/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * AT-12: recetas de productos e inventario conectado a las ventas.
 * El stock se descuenta AL COBRAR y se reintegra AL ANULAR la venta; cancelar un pedido sin cobrar no lo toca.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from './helpers/fakeDb';
import { loginAs, resetCookies } from './helpers/session';

let db: ReturnType<typeof createFakeDb>;
vi.mock('@/lib/prisma', () => ({
  default: new Proxy({}, { get: (_t, prop) => (db.prisma as any)[prop] }),
}));
vi.mock('@/lib/events', () => ({ default: { emit: vi.fn() } }));
vi.mock('next/headers', async () => (await import('./helpers/session')).nextHeadersMock());

import * as RECETA from '@/app/api/productos/[id]/receta/route';
import * as INVENTARIO from '@/app/api/inventario/route';
import { POST as AJUSTAR } from '@/app/api/inventario/ajuste/route';
import { POST as PAGAR } from '@/app/api/checkout/pay/route';
import { POST as ANULAR } from '@/app/api/ventas/[id]/anular/route';
import { PATCH as CANCELAR } from '@/app/api/pedidos/[id]/cancel/route';
import { redondearCantidad } from '@/lib/stock';

const json = (method: string, body?: unknown) =>
  new Request('http://localhost/api/x', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
const conId = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });

const verReceta = async (id: number | string) => RECETA.GET(json('GET'), conId(id));
const guardarReceta = async (id: number | string, body: unknown) => RECETA.PUT(json('PUT', body), conId(id));
const pagar = (pedidoId: number) => PAGAR(json('POST', { pedidoId, mesaId: 10 }));
const anular = (ventaId: number) => ANULAR(json('POST', { motivo: 'error de carga' }), conId(ventaId));
const stock = (insumoId: number) => db.state.insumos.find((i) => i.id === insumoId)!.stockActual;

// Hamburguesa: 0,2 kg de carne + 1 pan. Doble: 0,4 kg de carne + 1 pan. Gaseosa: sin receta.
const seed = () =>
  createFakeDb({
    mesas: [{ id: 10, numero: 5, sector: 'salon', estado: 'ocupada', activa: true }],
    usuarios: [{ id: 1, nombre: 'Admin', rol: 'ADMIN' }],
    productos: [
      { id: 1, nombre: 'Hamburguesa', precio: 550000, disponible: true },
      { id: 2, nombre: 'Hamburguesa Doble', precio: 780000, disponible: true },
      { id: 3, nombre: 'Gaseosa', precio: 180000, disponible: true },
    ],
    insumos: [
      { id: 100, nombre: 'Carne picada', unidad: 'kg', stockActual: 25, stockMinimo: 10, precioUnitario: 320000 },
      { id: 101, nombre: 'Pan de hamburguesa', unidad: 'unidad', stockActual: 48, stockMinimo: 20, precioUnitario: 35000 },
    ],
    recetas: [
      { id: 1, productoId: 1, insumoId: 100, cantidad: 0.2 },
      { id: 2, productoId: 1, insumoId: 101, cantidad: 1 },
      { id: 3, productoId: 2, insumoId: 100, cantidad: 0.4 },
      { id: 4, productoId: 2, insumoId: 101, cantidad: 1 },
    ],
    pedidos: [
      {
        id: 1,
        mesaId: 10,
        estado: 'entregado',
        total: 2830000,
        items: [
          { id: 11, productoId: 1, cantidad: 3, precio: 550000 },
          { id: 12, productoId: 2, cantidad: 1, precio: 780000 },
          { id: 13, productoId: 3, cantidad: 2, precio: 180000 },
        ],
      },
    ],
  });

beforeEach(async () => {
  db = seed();
  resetCookies();
  await loginAs('ADMIN', 1, 'Admin');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('cobro: descuenta del stock los insumos de las recetas', () => {
  it('descuenta receta × cantidad vendida, sumando el mismo insumo de varios productos', async () => {
    const res = await pagar(1);
    expect(res.status).toBe(200);

    // Carne: 3 × 0,2 + 1 × 0,4 = 1 kg. Pan: 3 + 1 = 4. La gaseosa no tiene receta.
    expect(stock(100)).toBe(24);
    expect(stock(101)).toBe(44);
  });

  it('registra un movimiento por insumo, negativo y asociado a la venta', async () => {
    await pagar(1);
    const ventaId = db.state.ventas[0].id;
    expect(db.state.movimientos).toHaveLength(2);
    expect(db.state.movimientos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ insumoId: 100, cantidad: -1, motivo: 'VENTA', ventaId, usuarioId: 1 }),
        expect.objectContaining({ insumoId: 101, cantidad: -4, motivo: 'VENTA', ventaId, usuarioId: 1 }),
      ])
    );
  });

  it('no acumula ruido de punto flotante en cantidades decimales', async () => {
    db.state.items.splice(0, db.state.items.length, { id: 20, pedidoId: 1, productoId: 1, cantidad: 3, precio: 550000 });
    db.state.insumos[0].stockActual = 1;
    await pagar(1);
    expect(stock(100)).toBe(0.4); // 1 − 3 × 0,2 (sin 0.3999999999999999)
  });

  it('el stock puede quedar negativo: la venta no se bloquea por un inventario desactualizado', async () => {
    db.state.insumos[1].stockActual = 2;
    const res = await pagar(1);
    expect(res.status).toBe(200);
    expect(stock(101)).toBe(-2);
  });

  it('productos sin receta: se cobra igual y no se mueve el stock', async () => {
    db.state.recetas.length = 0;
    expect((await pagar(1)).status).toBe(200);
    expect([stock(100), stock(101)]).toEqual([25, 48]);
    expect(db.state.movimientos).toHaveLength(0);
  });

  it('si falla el registro del stock, el cobro entero se revierte (ni venta ni descuento)', async () => {
    db.failOn.add('movimientoStock.create');
    const res = await pagar(1);
    expect(res.status).toBe(500);
    expect(db.state.ventas).toHaveLength(0);
    expect(db.state.pedidos[0].estado).toBe('entregado');
    expect([stock(100), stock(101)]).toEqual([25, 48]);
  });
});

describe('anulación: reintegra exactamente lo que descontó el cobro', () => {
  it('devuelve el stock y registra los movimientos inversos con la venta de anulación', async () => {
    await pagar(1);
    const ventaId = db.state.ventas[0].id;
    const res = await anular(ventaId);
    expect(res.status).toBe(200);

    expect([stock(100), stock(101)]).toEqual([25, 48]);
    const anulacionId = db.state.ventas[1].id;
    expect(db.state.movimientos.filter((m) => m.motivo === 'ANULACION')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ insumoId: 100, cantidad: 1, ventaId: anulacionId }),
        expect.objectContaining({ insumoId: 101, cantidad: 4, ventaId: anulacionId }),
      ])
    );
  });

  it('usa los movimientos de la venta, no la receta actual (aunque la receta haya cambiado)', async () => {
    await pagar(1);
    // Después del cobro, la hamburguesa pasa a llevar 0,3 kg: la anulación igual devuelve lo que se descontó (1 kg).
    db.state.recetas[0].cantidad = 0.3;
    await anular(db.state.ventas[0].id);
    expect(stock(100)).toBe(25);
  });

  it('una venta cobrada antes de las recetas (sin movimientos) se anula sin tocar el stock', async () => {
    db.state.ventas.push({ id: 50, pedidoId: 1, mesaId: 10, total: 100000, propina: 0, metodoPago: 'efectivo', numeroTicket: 'T-viejo', numeroControlInterno: 'CI-viejo' });
    expect((await anular(50)).status).toBe(200);
    expect([stock(100), stock(101)]).toEqual([25, 48]);
    expect(db.state.movimientos).toHaveLength(0);
  });
});

describe('cancelar un pedido sin cobrar no toca el stock', () => {
  it('nunca se descontó, así que no hay nada que reintegrar', async () => {
    const res = await CANCELAR(json('PATCH', { motivo: 'el cliente se fue' }), conId(1));
    expect(res.status).toBe(200);
    expect([stock(100), stock(101)]).toEqual([25, 48]);
    expect(db.state.movimientos).toHaveLength(0);
  });
});

describe('/api/productos/[id]/receta', () => {
  it('GET devuelve la receta con el costo estimado de los insumos en pesos', async () => {
    const res = await verReceta(1);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.productoId).toBe(1);
    expect(data.items).toEqual([
      { insumoId: 100, cantidad: 0.2, insumo: { id: 100, nombre: 'Carne picada', unidad: 'kg', precioUnitario: 3200 } },
      { insumoId: 101, cantidad: 1, insumo: { id: 101, nombre: 'Pan de hamburguesa', unidad: 'unidad', precioUnitario: 350 } },
    ]);
    expect(data.costoEstimado).toBe(990); // 0,2 × $3.200 + 1 × $350
  });

  it('GET de un producto sin receta: lista vacía y costo 0', async () => {
    expect(await (await verReceta(3)).json()).toEqual({ productoId: 3, items: [], costoEstimado: 0 });
  });

  it('PUT reemplaza la receta completa', async () => {
    const res = await guardarReceta(1, { items: [{ insumoId: 100, cantidad: '0.25' }] });
    expect(res.status).toBe(200);
    expect((await res.json()).items).toEqual([expect.objectContaining({ insumoId: 100, cantidad: 0.25 })]);
    expect(db.state.recetas.filter((r) => r.productoId === 1)).toEqual([expect.objectContaining({ insumoId: 100, cantidad: 0.25 })]);
    // Las recetas de otros productos no se tocan.
    expect(db.state.recetas.filter((r) => r.productoId === 2)).toHaveLength(2);
  });

  it('PUT con lista vacía deja el producto sin receta', async () => {
    expect((await guardarReceta(1, { items: [] })).status).toBe(200);
    expect(db.state.recetas.filter((r) => r.productoId === 1)).toHaveLength(0);
  });

  it.each([
    ['insumo repetido', { items: [{ insumoId: 100, cantidad: 1 }, { insumoId: 100, cantidad: 2 }] }, /más de una vez/],
    ['cantidad 0', { items: [{ insumoId: 100, cantidad: 0 }] }, /mayor que 0/],
    ['cantidad negativa', { items: [{ insumoId: 100, cantidad: -1 }] }, /mayor que 0/],
    ['cantidad no numérica', { items: [{ insumoId: 100, cantidad: 'mucha' }] }, /cantidad/],
    ['insumo inexistente', { items: [{ insumoId: 999, cantidad: 1 }] }, /El insumo 999 no existe/],
    ['sin items', {}, /items/],
  ])('PUT rechaza %s con 400 y no cambia la receta', async (_n, body, mensaje) => {
    const res = await guardarReceta(1, body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(mensaje);
    expect(db.state.recetas.filter((r) => r.productoId === 1)).toHaveLength(2);
  });

  it('404 si el producto no existe y 400 si el id no es válido', async () => {
    expect((await verReceta(999)).status).toBe(404);
    expect((await guardarReceta(999, { items: [] })).status).toBe(404);
    expect((await verReceta('abc')).status).toBe(400);
    expect((await guardarReceta(1, '{roto')).status).toBe(400);
  });

  it('si falla a mitad de camino, la receta anterior queda intacta', async () => {
    db.failOn.add('recetaItem.createMany');
    expect((await guardarReceta(1, { items: [{ insumoId: 101, cantidad: 2 }] })).status).toBe(500);
    expect(db.state.recetas.filter((r) => r.productoId === 1)).toHaveLength(2);
  });
});

describe('POST /api/inventario (alta de insumos)', () => {
  it('crea un insumo con el precio en pesos y lo guarda en centavos', async () => {
    const res = await INVENTARIO.POST(json('POST', { nombre: 'Queso cheddar', unidad: 'kg', stockActual: 8, stockMinimo: 5, precioUnitario: 5500.5 }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ nombre: 'Queso cheddar', unidad: 'kg', stockActual: 8, precioUnitario: 5500.5, proveedorId: null });
    expect(db.state.insumos.at(-1)).toMatchObject({ precioUnitario: 550050 });
  });

  it('aplica valores por defecto (unidad, stock y precio en 0)', async () => {
    const data = await (await INVENTARIO.POST(json('POST', { nombre: 'Sal', unidad: '', proveedorId: '' }))).json();
    expect(data).toMatchObject({ nombre: 'Sal', unidad: 'unidad', stockActual: 0, stockMinimo: 0, precioUnitario: 0, proveedorId: null });
  });

  it.each([
    ['sin nombre', { unidad: 'kg' }],
    ['stock negativo', { nombre: 'X', stockActual: -1 }],
    ['precio negativo', { nombre: 'X', precioUnitario: -1 }],
    ['proveedor inexistente', { nombre: 'X', proveedorId: 999 }],
  ])('rechaza %s con 400', async (_n, body) => {
    expect((await INVENTARIO.POST(json('POST', body))).status).toBe(400);
    expect(db.state.insumos).toHaveLength(2);
  });
});

describe('redondearCantidad', () => {
  it('redondea a 4 decimales', () => {
    expect(redondearCantidad(0.1 + 0.2)).toBe(0.3);
    expect(redondearCantidad(25 - 3 * 0.2)).toBe(24.4);
    expect(redondearCantidad(-0.00004)).toBe(-0);
  });
});

describe('POST /api/inventario/ajuste', () => {
  const ajustar = (body: unknown) => AJUSTAR(json('POST', body));

  it('suma o resta sobre el stock ACTUAL de la base y registra el movimiento con su motivo', async () => {
    await pagar(1); // la venta deja carne en 24 y pan en 44
    const res = await ajustar({ insumoId: 100, delta: 5.5, motivo: 'Compra recibida' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: 100, stockActual: 29.5, precioUnitario: 3200 });
    expect(stock(100)).toBe(29.5); // 24 + 5,5: no pisa el descuento de la venta
    expect(db.state.movimientos.at(-1)).toMatchObject({ insumoId: 100, cantidad: 5.5, motivo: 'AJUSTE', detalle: 'Compra recibida', ventaId: null, usuarioId: 1 });

    expect((await ajustar({ insumoId: 101, delta: -4, motivo: 'Merma: pan vencido' })).status).toBe(200);
    expect(stock(101)).toBe(40);
  });

  it('redondea la cantidad a 4 decimales', async () => {
    await ajustar({ insumoId: 100, delta: 0.1 + 0.2, motivo: 'conteo' });
    expect(stock(100)).toBe(25.3);
  });

  it.each([
    ['delta 0', { insumoId: 100, delta: 0, motivo: 'nada' }, /distinto de 0/],
    ['sin motivo', { insumoId: 100, delta: 1 }, /motivo/],
    ['motivo corto', { insumoId: 100, delta: 1, motivo: 'x' }, /mínimo 3/],
    ['delta no numérico', { insumoId: 100, delta: 'mucho', motivo: 'conteo' }, /delta/],
    ['delta absurdo', { insumoId: 100, delta: 1e9, motivo: 'conteo' }, /demasiado grande/],
  ])('400: %s', async (_n, body, mensaje) => {
    const res = await ajustar(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(mensaje);
    expect(stock(100)).toBe(25);
    expect(db.state.movimientos).toHaveLength(0);
  });

  it('404 si el insumo no existe', async () => {
    expect((await ajustar({ insumoId: 999, delta: 1, motivo: 'conteo' })).status).toBe(404);
  });

  it('si falla el registro del movimiento, el stock no cambia', async () => {
    db.failOn.add('movimientoStock.create');
    expect((await ajustar({ insumoId: 100, delta: 3, motivo: 'conteo' })).status).toBe(500);
    expect(stock(100)).toBe(25);
  });
});
