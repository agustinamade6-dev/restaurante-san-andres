/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from './helpers/fakeDb';
import { loginAs, logout, resetCookies } from './helpers/session';

let db: ReturnType<typeof createFakeDb>;
const emit = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({
  default: new Proxy({}, { get: (_t, prop) => (db.prisma as any)[prop] }),
}));
vi.mock('@/lib/events', () => ({ default: { emit } }));
vi.mock('next/headers', async () => (await import('./helpers/session')).nextHeadersMock());

import { PATCH } from '@/app/api/pedidos/route';
import { PATCH as CANCEL } from '@/app/api/pedidos/[id]/cancel/route';
import { POST as PAY } from '@/app/api/checkout/pay/route';

const pedido = (over: Record<string, unknown> = {}) => ({
  id: 1,
  mesaId: 10,
  estado: 'pendiente',
  total: 3000,
  items: [{ id: 501, productoId: 1, cantidad: 2, precio: 1500, producto: { nombre: 'Milanesa' } }],
  ...over,
});

const cambiar = (body: unknown) =>
  PATCH(
    new Request('http://localhost/api/pedidos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );

const cancelar = (id: number | string, body?: unknown) =>
  CANCEL(
    new Request(`http://localhost/api/pedidos/${id}/cancel`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: String(id) }) }
  );

const pagar = (pedidoId = 1) =>
  PAY(
    new Request('http://localhost/api/checkout/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pedidoId, mesaId: 10, metodoPago: 'efectivo' }),
    })
  );

beforeEach(async () => {
  db = createFakeDb({
    pedidos: [pedido()],
    mesas: [{ id: 10, numero: 5, estado: 'ocupada', activa: true }],
    usuarios: [{ id: 3, nombre: 'Cocinero' }],
  });
  emit.mockClear();
  resetCookies();
  await loginAs('COCINERO', 3);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('PATCH /api/pedidos — flujo de estados', () => {
  it('pendiente -> preparando -> listo -> entregado actualiza pedido, historial y mesa', async () => {
    let res = await cambiar({ id: 1, estado: 'preparando' });
    expect(res.status).toBe(200);
    expect((await res.json()).estado).toBe('preparando');
    expect(db.state.historial.map((h) => h.accion)).toEqual(['ESTADO_CAMBIADO_PREPARANDO']);
    expect(db.state.historial[0].usuarioId).toBe(3);

    await cambiar({ id: 1, estado: 'listo' });
    expect(db.state.mesas[0].estado).toBe('esperando');

    res = await cambiar({ id: 1, estado: 'entregado' });
    expect(res.status).toBe(200);
    expect(db.state.pedidos[0].estado).toBe('entregado');
    expect(db.state.pedidos[0].entregadoEn).toBeInstanceOf(Date);
    expect(db.state.mesas[0].estado).toBe('ocupada'); // servido pero sin cobrar: la mesa sigue ocupada
    // 3 eventos del pedido + 2 de la mesa (esperando y ocupada); al pasar a "preparando" la mesa ya estaba ocupada.
    expect(emit.mock.calls.filter(([e]) => e === 'pedido:actualizado')).toHaveLength(3);
    expect(emit.mock.calls.filter(([e]) => e === 'mesa:actualizada').map(([, m]) => m.estado)).toEqual(['esperando', 'ocupada']);
  });

  it('la mesa se anuncia con su estado YA actualizado y solo si cambió', async () => {
    db.state.mesas[0].estado = 'libre';
    await cambiar({ id: 1, estado: 'preparando' });
    expect(emit).toHaveBeenCalledWith('mesa:actualizada', expect.objectContaining({ id: 10, estado: 'ocupada' }));
    emit.mockClear();
    await cambiar({ id: 1, estado: 'listo' });
    await cambiar({ id: 1, estado: 'preparando' }); // corrección de un "listo" por error: vuelve a ocupada
    expect(emit.mock.calls.filter(([e]) => e === 'mesa:actualizada').map(([, m]) => m.estado)).toEqual(['esperando', 'ocupada']);
  });

  it('mantiene el contrato: la respuesta trae mesa, items con producto e historial', async () => {
    const data = await (await cambiar({ id: 1, estado: 'preparando' })).json();

    expect(data.mesa.numero).toBe(5);
    expect(data.items[0].producto.nombre).toBe('Milanesa');
    expect(Array.isArray(data.historial)).toBe(true);
  });

  it('REGRESIÓN: "entregado" mantiene la mesa ocupada hasta el cobro; recién cobrar la libera', async () => {
    // Antes "entregado" dejaba la mesa en "libre" aunque el cliente seguía sentado sin pagar: un mozo podía sentar gente nueva.
    db.state.pedidos[0].estado = 'listo';
    await cambiar({ id: 1, estado: 'entregado' });
    expect(db.state.mesas[0].estado).toBe('ocupada');

    await loginAs('MOZO', 3);
    expect((await pagar()).status).toBe(200);
    expect(db.state.pedidos[0].estado).toBe('pagado');
    expect(db.state.mesas[0].estado).toBe('libre');
    expect(emit.mock.calls.filter(([e]) => e === 'mesa:actualizada').map(([, m]) => m.estado).at(-1)).toBe('libre');
  });

  it('REGRESIÓN: cancelar un pedido ENTREGADO libera la mesa solo si no le quedan otros sin cobrar', async () => {
    db.state.pedidos[0].estado = 'entregado';
    db.addPedido(pedido({ id: 2, estado: 'entregado' }));
    await loginAs('ADMIN', 3);

    await cancelar(1, { motivo: 'El cliente se retiró' });
    expect(db.state.mesas[0].estado).toBe('ocupada'); // el pedido 2 sigue servido y sin cobrar

    await cancelar(2, { motivo: 'El cliente se retiró' });
    expect(db.state.mesas[0].estado).toBe('libre');
  });

  it('reabrir un pedido ENTREGADO (aún sin cobrar) a "preparando" está permitido y ocupa la mesa', async () => {
    db.state.pedidos[0].estado = 'listo';
    await cambiar({ id: 1, estado: 'entregado' });
    expect(db.state.mesas[0].estado).toBe('ocupada');

    const res = await cambiar({ id: 1, estado: 'preparando' });

    expect(res.status).toBe(200);
    expect(db.state.pedidos[0].entregadoEn).toBeNull();
    expect(db.state.mesas[0].estado).toBe('ocupada');
  });

  it('el mismo estado es un no-op: sin historial duplicado ni eventos', async () => {
    await cambiar({ id: 1, estado: 'preparando' });
    emit.mockClear();

    const res = await cambiar({ id: 1, estado: 'preparando' });

    expect(res.status).toBe(200);
    expect(db.state.historial).toHaveLength(1);
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/pedidos — estados finales (reabrir un cobro)', () => {
  it('un pedido PAGADO no se puede reabrir (caso real: traerlo a "preparando" desde el historial)', async () => {
    db.state.pedidos[0].estado = 'pagado';

    const res = await cambiar({ id: 1, estado: 'preparando' });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('anulá la venta');
    expect(db.state.pedidos[0].estado).toBe('pagado');
    expect(emit).not.toHaveBeenCalled();
  });

  it.each(['pendiente', 'preparando', 'listo', 'entregado'])('un pedido pagado no puede pasar a %s', async (estado) => {
    db.state.pedidos[0].estado = 'pagado';
    expect((await cambiar({ id: 1, estado })).status).toBe(400);
    expect(db.state.pedidos[0].estado).toBe('pagado');
  });

  it('un pedido cancelado tampoco se reabre', async () => {
    db.state.pedidos[0].estado = 'cancelado';
    const res = await cambiar({ id: 1, estado: 'preparando' });
    expect(res.status).toBe(400);
    expect(db.state.pedidos[0].estado).toBe('cancelado');
  });

  it.each([
    ['pagado', 'Para cobrar un pedido'],
    ['cancelado', '/cancel'],
  ])('no se puede pasar a "%s" por esta ruta', async (estado, texto) => {
    const res = await cambiar({ id: 1, estado });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(texto);
    expect(db.state.pedidos[0].estado).toBe('pendiente');
  });
});

describe('PATCH /api/pedidos — validación y permisos', () => {
  it.each([
    ['estado inventado', { id: 1, estado: 'volando' }],
    ['sin estado', { id: 1 }],
    ['sin id', { estado: 'preparando' }],
    ['id inválido', { id: 'abc', estado: 'preparando' }],
    ['id negativo', { id: -1, estado: 'preparando' }],
  ])('400: %s', async (_n, body) => {
    expect((await cambiar(body)).status).toBe(400);
    expect(db.state.pedidos[0].estado).toBe('pendiente');
  });

  it('400 ante JSON inválido y 404 si el pedido no existe', async () => {
    expect((await cambiar('{roto')).status).toBe(400);
    expect((await cambiar({ id: 999, estado: 'preparando' })).status).toBe(404);
  });

  it('401 sin sesión y 403 para MOZO', async () => {
    logout();
    expect((await cambiar({ id: 1, estado: 'preparando' })).status).toBe(401);
    await loginAs('MOZO', 3);
    expect((await cambiar({ id: 1, estado: 'preparando' })).status).toBe(403);
    expect(db.state.pedidos[0].estado).toBe('pendiente');
  });

  it('un fallo a mitad de camino revierte todo y no filtra detalles', async () => {
    vi.spyOn(db.prisma.historialPedido, 'create').mockRejectedValueOnce(new Error('disco lleno'));

    const res = await cambiar({ id: 1, estado: 'preparando' });

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Error al actualizar pedido');
    expect(db.state.pedidos[0].estado).toBe('pendiente');
    expect(db.state.historial).toHaveLength(0);
  });
});

describe('PATCH /api/pedidos/[id]/cancel', () => {
  it('cancela un pedido activo, deja historial con motivo y usuario, y libera la mesa', async () => {
    const res = await cancelar(1, { motivo: 'El cliente se fue' });

    expect(res.status).toBe(200);
    expect(db.state.pedidos[0].estado).toBe('cancelado');
    expect(db.state.historial[0]).toMatchObject({ accion: 'PEDIDO_CANCELADO', motivo: 'El cliente se fue', usuarioId: 3 });
    expect(db.state.mesas[0].estado).toBe('libre');
    expect(emit).toHaveBeenCalledWith('mesa:actualizada', expect.anything());
  });

  it('sin motivo usa el texto por defecto (y acepta una petición sin cuerpo)', async () => {
    expect((await cancelar(1)).status).toBe(200);
    expect(db.state.historial[0].motivo).toBe('Cancelado sin motivo especificado');
  });

  it('no libera la mesa si hay otro pedido activo', async () => {
    db.addPedido(pedido({ id: 2, estado: 'listo' }));
    await cancelar(1);
    expect(db.state.mesas[0].estado).toBe('ocupada');
  });

  it('no se puede cancelar un pedido PAGADO: la venta quedaría sin pedido válido', async () => {
    db.state.pedidos[0].estado = 'pagado';

    const res = await cancelar(1, { motivo: 'x' });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('anulá la venta');
    expect(db.state.pedidos[0].estado).toBe('pagado');
    expect(db.state.historial).toHaveLength(0);
  });

  it('cancelar dos veces: el segundo intento da 400 y no duplica el historial', async () => {
    await cancelar(1);
    const res = await cancelar(1);

    expect(res.status).toBe(400);
    expect(db.state.historial).toHaveLength(1);
  });

  it('404 si no existe y 400 si el id es inválido', async () => {
    expect((await cancelar(999)).status).toBe(404);
    expect((await cancelar('abc')).status).toBe(400);
  });

  it('un fallo a mitad de camino revierte la cancelación', async () => {
    vi.spyOn(db.prisma.mesa, 'update').mockRejectedValueOnce(new Error('disco lleno'));

    const res = await cancelar(1);

    expect(res.status).toBe(500);
    expect(db.state.pedidos[0].estado).toBe('pendiente');
    expect(db.state.historial).toHaveLength(0);
  });
});

describe('carreras entre cobro, cancelación y reapertura (modelo single-writer)', () => {
  it('cobrar y reabrir a la vez nunca deja un pedido reabierto con venta registrada', async () => {
    db.state.pedidos[0].estado = 'entregado';
    await loginAs('ADMIN', 3);

    await Promise.all([pagar(), cambiar({ id: 1, estado: 'preparando' })]);

    expect(db.state.ventas).toHaveLength(1);
    expect(db.state.pedidos[0].estado).toBe('pagado');
  });

  it('cobrar y cancelar a la vez: gana uno solo y el resultado es coherente', async () => {
    db.state.pedidos[0].estado = 'entregado';
    await loginAs('ADMIN', 3);

    await Promise.all([pagar(), cancelar(1, { motivo: 'carrera' })]);

    const { estado } = db.state.pedidos[0];
    expect(
      (estado === 'cancelado' && db.state.ventas.length === 0) || (estado === 'pagado' && db.state.ventas.length === 1)
    ).toBe(true);
  });
});

describe('PATCH /api/pedidos — máquina de estados', () => {
  it.each([
    ['pendiente', 'listo'],
    ['pendiente', 'entregado'],
    ['preparando', 'pendiente'],
    ['preparando', 'entregado'],
    ['listo', 'pendiente'],
    ['entregado', 'pendiente'],
    ['entregado', 'listo'],
  ])('%s → %s: 400 y no cambia nada', async (desde, hacia) => {
    db.state.pedidos[0].estado = desde;
    const res = await cambiar({ id: 1, estado: hacia });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(`no puede pasar a "${hacia}"`);
    expect(db.state.pedidos[0].estado).toBe(desde);
  });

  it.each([
    ['pendiente', 'preparando'],
    ['preparando', 'listo'],
    ['listo', 'entregado'],
    ['listo', 'preparando'],
    ['entregado', 'preparando'],
  ])('%s → %s: permitido', async (desde, hacia) => {
    db.state.pedidos[0].estado = desde;
    expect((await cambiar({ id: 1, estado: hacia })).status).toBe(200);
    expect(db.state.pedidos[0].estado).toBe(hacia);
  });

  it('el flujo completo de cocina funciona paso a paso', async () => {
    for (const estado of ['preparando', 'listo', 'entregado']) {
      expect((await cambiar({ id: 1, estado })).status).toBe(200);
    }
  });
});

describe('PATCH /api/pedidos/[id]/cancel — evento de mesa', () => {
  it('REGRESIÓN: la mesa se anuncia LIBRE (antes salía con el estado leído antes de liberarla)', async () => {
    expect(db.state.mesas[0].estado).toBe('ocupada');
    expect((await cancelar(1, { motivo: 'se fue' })).status).toBe(200);
    expect(db.state.mesas[0].estado).toBe('libre');
    expect(emit).toHaveBeenCalledWith('mesa:actualizada', expect.objectContaining({ id: 10, estado: 'libre' }));
  });

  it('si la mesa tiene otro pedido en curso, sigue ocupada y no se anuncia', async () => {
    db.addPedido(pedido({ id: 2, estado: 'preparando' }));
    expect((await cancelar(1, { motivo: 'error de carga' })).status).toBe(200);
    expect(db.state.mesas[0].estado).toBe('ocupada');
    expect(emit).toHaveBeenCalledWith('pedido:actualizado', expect.anything());
    expect(emit).not.toHaveBeenCalledWith('mesa:actualizada', expect.anything());
  });
});
