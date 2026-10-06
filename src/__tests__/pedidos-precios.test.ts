/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from './helpers/fakeDb';
import { loginAs, resetCookies } from './helpers/session';

let db: ReturnType<typeof createFakeDb>;
const emit = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({
  default: new Proxy({}, { get: (_t, prop) => (db.prisma as any)[prop] }),
}));
vi.mock('@/lib/events', () => ({ default: { emit } }));
vi.mock('next/headers', async () => (await import('./helpers/session')).nextHeadersMock());

import { POST } from '@/app/api/pedidos/route';
import { PATCH as PATCH_ITEMS } from '@/app/api/pedidos/[id]/items/route';

const seed = () =>
  createFakeDb({
    mesas: [
      { id: 10, numero: 5, estado: 'libre', activa: true },
      { id: 11, numero: 6, estado: 'libre', activa: false },
    ],
    productos: [
      { id: 1, nombre: 'Milanesa', precio: 1500, disponible: true },
      { id: 2, nombre: 'Gaseosa', precio: 800.5, disponible: true },
      { id: 3, nombre: 'Flan', precio: 900, disponible: false },
    ],
  });

const crear = (body: unknown) =>
  POST(
    new Request('http://localhost/api/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );

beforeEach(async () => {
  db = seed();
  emit.mockClear();
  resetCookies();
  await loginAs('MOZO', 4);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/pedidos — precios del servidor', () => {
  it('ignora el precio enviado por el cliente y usa Producto.precio', async () => {
    const res = await crear({
      mesaId: 10,
      items: [
        { productoId: 1, cantidad: 2, precio: 0 }, // intento de abaratar
        { productoId: 2, cantidad: 1, precio: 1 },
      ],
    });
    const pedido = await res.json();

    expect(res.status).toBe(201);
    expect(pedido.total).toBe(3800.5); // 2 x 1500 + 800.5
    expect(db.state.items.map((i) => i.precio)).toEqual([1500, 800.5]);
  });

  it('acepta el payload actual del frontend (con precio y campos extra) y mantiene el contrato', async () => {
    const res = await crear({
      mesaId: 10,
      items: [{ productoId: 1, cantidad: 1, precio: 1500, notas: 'sin sal', nombre: 'Milanesa' }],
    });
    const pedido = await res.json();

    expect(res.status).toBe(201);
    expect(pedido).toMatchObject({ mesaId: 10, estado: 'pendiente', total: 1500 });
    expect(pedido.mesa.numero).toBe(5);
    expect(pedido.items[0]).toMatchObject({ productoId: 1, cantidad: 1, notas: 'sin sal' });
    expect(pedido.items[0].producto.nombre).toBe('Milanesa');
  });

  it('el creador del pedido es el usuario de la sesión firmada', async () => {
    const pedido = await (await crear({ mesaId: 10, items: [{ productoId: 1, cantidad: 1 }] })).json();
    expect(pedido.creadoPorId).toBe(4);
  });

  it('ocupa la mesa y emite pedido:nuevo', async () => {
    await crear({ mesaId: 10, items: [{ productoId: 1, cantidad: 1 }] });

    expect(db.state.mesas[0].estado).toBe('ocupada');
    expect(emit).toHaveBeenCalledWith('pedido:nuevo', expect.objectContaining({ mesaId: 10 }));
  });

  it('permite el mismo producto en varias líneas', async () => {
    const res = await crear({
      mesaId: 10,
      items: [
        { productoId: 1, cantidad: 1, notas: 'sin sal' },
        { productoId: 1, cantidad: 1, notas: 'bien cocida' },
      ],
    });
    expect((await res.json()).total).toBe(3000);
  });

  it('redondea el total a centavos', async () => {
    db.state.productos[0].precio = 0.1;
    const res = await crear({ mesaId: 10, items: [{ productoId: 1, cantidad: 3 }] });
    expect((await res.json()).total).toBe(0.3); // sin 0.30000000000000004
  });
});

describe('POST /api/pedidos — validación', () => {
  it.each([
    ['producto inexistente', { mesaId: 10, items: [{ productoId: 999, cantidad: 1 }] }, 400],
    ['producto no disponible', { mesaId: 10, items: [{ productoId: 3, cantidad: 1 }] }, 400],
    ['mesa inexistente', { mesaId: 999, items: [{ productoId: 1, cantidad: 1 }] }, 404],
    ['mesa inactiva', { mesaId: 11, items: [{ productoId: 1, cantidad: 1 }] }, 400],
    ['sin ítems', { mesaId: 10, items: [] }, 400],
    ['items no es array', { mesaId: 10, items: 'x' }, 400],
    ['sin items', { mesaId: 10 }, 400],
    ['sin mesaId', { items: [{ productoId: 1, cantidad: 1 }] }, 400],
    ['cantidad 0', { mesaId: 10, items: [{ productoId: 1, cantidad: 0 }] }, 400],
    ['cantidad negativa', { mesaId: 10, items: [{ productoId: 1, cantidad: -2 }] }, 400],
    ['cantidad decimal', { mesaId: 10, items: [{ productoId: 1, cantidad: 1.5 }] }, 400],
    ['cantidad excesiva', { mesaId: 10, items: [{ productoId: 1, cantidad: 101 }] }, 400],
    ['sin cantidad', { mesaId: 10, items: [{ productoId: 1 }] }, 400],
  ])('rechaza %s sin crear nada', async (_n, body, status) => {
    const res = await crear(body);

    expect(res.status).toBe(status);
    expect((await res.json()).success).toBe(false);
    expect(db.state.pedidos).toHaveLength(0);
    expect(db.state.mesas[0].estado).toBe('libre');
    expect(emit).not.toHaveBeenCalled();
  });

  it('400 ante JSON inválido (antes era 500)', async () => {
    expect((await crear('{roto')).status).toBe(400);
  });

  it('un fallo al crear revierte todo, no deja la mesa ocupada y no filtra detalles', async () => {
    db.failOn.add('pedido.create');
    const res = await crear({ mesaId: 10, items: [{ productoId: 1, cantidad: 1 }] });

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Error al crear pedido');
    expect(db.state.mesas[0].estado).toBe('libre');
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/pedidos/[id]/items — precios y totales del servidor', () => {
  const pedidoAbierto = (over: Record<string, unknown> = {}) => ({
    id: 1,
    mesaId: 10,
    estado: 'pendiente',
    total: 1, // desfasado a propósito
    items: [{ id: 501, productoId: 1, cantidad: 2, precio: 1500 }],
    ...over,
  });

  const modificar = (id: number | string, body: unknown) =>
    PATCH_ITEMS(
      new Request(`http://localhost/api/pedidos/${id}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: String(id) }) }
    );

  beforeEach(async () => {
    await loginAs('COCINERO', 5); // la cocina edita ítems
    db.addPedido(pedidoAbierto());
  });

  it('ADD_ITEM usa el precio de Producto aunque el cliente mande otro', async () => {
    const res = await modificar(1, { action: 'ADD_ITEM', productoId: 2, cantidad: 1, precio: 0 });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.items.find((i: any) => i.productoId === 2).precio).toBe(800.5);
    expect(data.total).toBe(3800.5); // recalculado desde ítems: 2x1500 + 800.5
    expect(emit).toHaveBeenCalledWith('pedido:actualizado', expect.anything());
    expect(db.state.historial.map((h) => h.accion)).toContain('ITEM_AGREGADO');
  });

  it('ADD_ITEM sin cantidad agrega 1 (payload actual del frontend)', async () => {
    const res = await modificar(1, { action: 'ADD_ITEM', productoId: 1 });
    expect(res.status).toBe(200);
    expect(db.state.items.filter((i) => i.productoId === 1 && i.pedidoId === 1).map((i) => i.cantidad)).toContain(1);
  });

  it('ADD_ITEM rechaza producto inexistente o no disponible', async () => {
    expect((await modificar(1, { action: 'ADD_ITEM', productoId: 999 })).status).toBe(400);
    const res = await modificar(1, { action: 'ADD_ITEM', productoId: 3 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('no está disponible');
    expect(db.state.items).toHaveLength(1);
  });

  it('UPDATE_QUANTITY recalcula el total desde los ítems (corrige el desfase)', async () => {
    const res = await modificar(1, { action: 'UPDATE_QUANTITY', itemId: 501, cantidad: 3 });

    expect(res.status).toBe(200);
    expect((await res.json()).total).toBe(4500);
    expect(db.state.pedidos[0].total).toBe(4500);
  });

  it('UPDATE_QUANTITY con la misma cantidad no cambia nada', async () => {
    const res = await modificar(1, { action: 'UPDATE_QUANTITY', itemId: 501, cantidad: 2 });

    expect(await res.json()).toEqual({ success: true });
    expect(db.state.historial).toHaveLength(0);
    expect(emit).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, 101, 'abc'])('UPDATE_QUANTITY rechaza cantidad inválida (%s)', async (cantidad) => {
    const res = await modificar(1, { action: 'UPDATE_QUANTITY', itemId: 501, cantidad });
    expect(res.status).toBe(400);
    expect(db.state.items[0].cantidad).toBe(2);
  });

  it('REMOVE_ITEM quita el ítem y deja el total en 0 si era el último', async () => {
    const res = await modificar(1, { action: 'REMOVE_ITEM', itemId: 501 });

    expect(res.status).toBe(200);
    expect((await res.json()).total).toBe(0);
    expect(db.state.items).toHaveLength(0);
  });

  it('no permite tocar ítems de otro pedido', async () => {
    db.addPedido(pedidoAbierto({ id: 2, items: [{ id: 777, productoId: 2, cantidad: 1, precio: 800.5 }] }));

    const res = await modificar(1, { action: 'REMOVE_ITEM', itemId: 777 });

    expect(res.status).toBe(400);
    expect(db.state.items.some((i) => i.id === 777)).toBe(true);
  });

  it.each(['pagado', 'cancelado'])('rechaza modificar un pedido %s', async (estado) => {
    db.state.pedidos[0].estado = estado;

    const res = await modificar(1, { action: 'ADD_ITEM', productoId: 1 });

    expect(res.status).toBe(400);
    expect(db.state.items).toHaveLength(1);
  });

  it('404 si el pedido no existe y 400 si el id no es válido', async () => {
    expect((await modificar(999, { action: 'ADD_ITEM', productoId: 1 })).status).toBe(404);
    expect((await modificar('abc', { action: 'ADD_ITEM', productoId: 1 })).status).toBe(400);
  });

  it('acción desconocida o ausente -> 400 "Acción no soportada"', async () => {
    const res = await modificar(1, { action: 'BORRAR_TODO' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Acción no soportada');
    expect((await modificar(1, {})).status).toBe(400);
  });

  it('400 ante JSON inválido', async () => {
    expect((await modificar(1, '{roto')).status).toBe(400);
  });

  it('un fallo a mitad de camino revierte y responde 500 genérico', async () => {
    db.failOn.add('itemPedido.create');

    const res = await modificar(1, { action: 'ADD_ITEM', productoId: 2 });

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Error al modificar ítems');
    expect(db.state.items).toHaveLength(1);
    expect(db.state.historial).toHaveLength(0);
  });
});
