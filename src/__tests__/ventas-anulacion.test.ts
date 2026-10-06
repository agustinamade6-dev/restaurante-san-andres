/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from './helpers/fakeDb';
import { loginAs, logout, resetCookies } from './helpers/session';
import { contarVentasNetas, esAnulacion, marcarAnuladas, resumirVentas, ventaAnuladaId } from '@/lib/ventas';

let db: ReturnType<typeof createFakeDb>;
vi.mock('@/lib/prisma', () => ({
  default: new Proxy({}, { get: (_t, prop) => (db.prisma as any)[prop] }),
}));
vi.mock('@/lib/events', () => ({ default: { emit: vi.fn() } }));
vi.mock('next/headers', async () => (await import('./helpers/session')).nextHeadersMock());

import { POST as ANULAR } from '@/app/api/ventas/[id]/anular/route';
import { GET as CAJA } from '@/app/api/caja/route';
import { POST as CREAR_PEDIDO, PATCH as ESTADO } from '@/app/api/pedidos/route';
import { PATCH as ITEMS } from '@/app/api/pedidos/[id]/items/route';
import { PATCH as CANCELAR } from '@/app/api/pedidos/[id]/cancel/route';
import { POST as PAGAR } from '@/app/api/checkout/pay/route';

const json = (url: string, method: string, body?: unknown) =>
  new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

const anular = (id: number | string, body?: unknown) =>
  ANULAR(json(`http://localhost/api/ventas/${id}/anular`, 'POST', body), { params: Promise.resolve({ id: String(id) }) });
const caja = async () => (await CAJA(new Request('http://localhost/api/caja?days=1'))).json();

const venta = (over: Record<string, unknown> = {}) => ({
  id: 1,
  pedidoId: 1,
  mesaId: 10,
  mesaNumero: 5,
  total: 2500000, // montos de la base en centavos ($25.000)
  propina: 0,
  metodoPago: 'efectivo',
  numeroTicket: 'T-20261006-0001',
  numeroControlInterno: 'CI-20261006-0001',
  fechaCobro: new Date(),
  ...over,
});

describe('lib/ventas — anulación por asiento inverso', () => {
  const original = venta();
  const asiento = venta({ id: 2, total: -2500000, numeroTicket: 'A-1', numeroControlInterno: 'ANUL-V1' });

  it('reconoce los asientos de anulación y a qué venta corresponden', () => {
    expect(esAnulacion(asiento)).toBe(true);
    expect(esAnulacion(original)).toBe(false);
    expect(ventaAnuladaId(asiento)).toBe(1);
    expect(ventaAnuladaId(original)).toBeNull();
    expect(ventaAnuladaId({ numeroControlInterno: 'ANUL-Vx' })).toBeNull();
  });

  it('la cantidad es neta: cada anulación resta una venta', () => {
    expect(contarVentasNetas([original])).toBe(1);
    expect(contarVentasNetas([original, asiento])).toBe(0);
  });

  it('el resumen netea totales, propinas y desglose por método', () => {
    // Entra en centavos (como sale de la base) y el resumen sale en pesos.
    const conPropina = venta({ propina: 50000 });
    const inversa = venta({ id: 2, total: -2500000, propina: -50000, numeroControlInterno: 'ANUL-V1' });
    const otra = venta({ id: 3, total: 80010, metodoPago: 'tarjeta', numeroControlInterno: 'CI-2' });

    const r = resumirVentas([conPropina, inversa, otra]);

    expect(r.totalRecaudado).toBe(800.1);
    expect(r.totalPropinas).toBe(0);
    expect(r.cantidadVentas).toBe(1);
    expect(r.porMetodo).toEqual({ efectivo: { count: 0, total: 0 }, tarjeta: { count: 1, total: 800.1 } });
  });

  it('marca la venta anulada y el asiento sin modificar las filas originales', () => {
    const [a, b] = marcarAnuladas([original, asiento]);

    expect(a).toMatchObject({ anulada: true, esAnulacion: false });
    expect(b).toMatchObject({ anulada: false, esAnulacion: true });
    expect(original).not.toHaveProperty('anulada');
  });
});

describe('POST /api/ventas/[id]/anular', () => {
  beforeEach(async () => {
    db = createFakeDb({
      pedidos: [{ id: 1, mesaId: 10, estado: 'pagado', total: 2500000, items: [] }],
      mesas: [{ id: 10, numero: 5, estado: 'libre', activa: true }],
      usuarios: [{ id: 1, nombre: 'Admin' }],
      ventas: [venta({ propina: 50000 })],
    });
    resetCookies();
    await loginAs('ADMIN', 1);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('anula: crea un asiento inverso y deja la venta original intacta', async () => {
    const res = await anular(1, { motivo: 'Se devolvió el dinero al cliente' });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.ventaOriginal).toMatchObject({ id: 1, total: 25000 }); // respuesta en pesos
    expect(data.anulacion).toMatchObject({ total: -25000, propina: -500 });
    expect(db.state.ventas).toHaveLength(2);
    expect(db.state.ventas[0]).toMatchObject({ id: 1, total: 2500000, propina: 50000 }); // intacta (centavos)
    expect(db.state.ventas[1]).toMatchObject({
      pedidoId: 1,
      mesaNumero: 5,
      total: -2500000,
      propina: -50000,
      metodoPago: 'efectivo',
      cajeroId: 1,
      numeroControlInterno: 'ANUL-V1',
    });
    expect(db.state.ventas[1].numeroTicket).toMatch(/^A-\d{8}-0001$/);
  });

  it('deja rastro en el historial del pedido: quién, qué y por qué', async () => {
    await anular(1, { motivo: '  Error de carga  ' });

    expect(db.state.historial[0]).toMatchObject({
      pedidoId: 1,
      accion: 'VENTA_ANULADA',
      motivo: 'Error de carga',
      usuarioId: 1,
    });
    expect(db.state.historial[0].detalle).toContain('T-20261006-0001');
  });

  it('no deja anular dos veces la misma venta', async () => {
    await anular(1, { motivo: 'primera' });
    const res = await anular(1, { motivo: 'segunda' });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Esta venta ya fue anulada');
    expect(db.state.ventas).toHaveLength(2);
  });

  it('dos anulaciones simultáneas: solo una prospera', async () => {
    const [a, b] = await Promise.all([anular(1, { motivo: 'uno' }), anular(1, { motivo: 'dos' })]);

    expect([a.status, b.status].sort()).toEqual([200, 400]);
    expect(db.state.ventas).toHaveLength(2);
  });

  it('un asiento de anulación no se puede anular (no hay "des-anular")', async () => {
    await anular(1, { motivo: 'primera' });
    const res = await anular(db.state.ventas[1].id, { motivo: 'revertir' });

    expect(res.status).toBe(400);
    expect(db.state.ventas).toHaveLength(2);
  });

  it('numera las anulaciones de forma correlativa', async () => {
    db.state.ventas.push(venta({ id: 7, numeroTicket: 'T-2', numeroControlInterno: 'CI-2' }));
    await anular(1, { motivo: 'uno' });
    await anular(7, { motivo: 'dos' });

    const tickets = db.state.ventas.filter((v) => esAnulacion(v)).map((v) => v.numeroTicket);
    expect(tickets[0]).toMatch(/-0001$/);
    expect(tickets[1]).toMatch(/-0002$/);
  });

  it.each([
    ['sin motivo', {}],
    ['motivo vacío', { motivo: '' }],
    ['motivo solo espacios', { motivo: '    ' }],
    ['motivo demasiado corto', { motivo: 'ab' }],
    ['motivo no texto', { motivo: 123 }],
    ['motivo demasiado largo', { motivo: 'x'.repeat(501) }],
  ])('400 y no anula: %s', async (_n, body) => {
    const res = await anular(1, body);

    expect(res.status).toBe(400);
    expect(db.state.ventas).toHaveLength(1);
  });

  it('404 si la venta no existe, 400 si el id es inválido o el JSON está roto', async () => {
    expect((await anular(999, { motivo: 'prueba' })).status).toBe(404);
    expect((await anular('abc', { motivo: 'prueba' })).status).toBe(400);
    expect((await ANULAR(new Request('http://localhost/x', { method: 'POST', body: '{roto' }), { params: Promise.resolve({ id: '1' }) })).status).toBe(400);
  });

  it('401 sin sesión; 403 para MOZO y COCINERO (solo ADMIN anula)', async () => {
    logout();
    expect((await anular(1, { motivo: 'prueba' })).status).toBe(401);
    for (const rol of ['MOZO', 'COCINERO']) {
      await loginAs(rol, 1);
      expect((await anular(1, { motivo: 'prueba' })).status).toBe(403);
    }
    expect(db.state.ventas).toHaveLength(1);
  });

  it('un fallo a mitad de camino revierte todo', async () => {
    db.failOn.add('venta.create');
    const res = await anular(1, { motivo: 'prueba' });

    expect(res.status).toBe(500);
    expect(db.state.ventas).toHaveLength(1);
    expect(db.state.historial).toHaveLength(0);
  });
});

describe('GET /api/caja — con anulaciones', () => {
  beforeEach(async () => {
    db = createFakeDb({
      ventas: [
        venta({ id: 1, total: 2500000, numeroControlInterno: 'CI-1' }),
        venta({ id: 2, total: 500000, metodoPago: 'tarjeta', numeroTicket: 'T-2', numeroControlInterno: 'CI-2' }),
        venta({ id: 3, total: -2500000, numeroTicket: 'A-1', numeroControlInterno: 'ANUL-V1' }),
      ],
    });
    resetCookies();
    await loginAs('ADMIN', 1);
  });

  it('el resumen es neto y mantiene la forma que consume la pantalla', async () => {
    const data = await caja();

    expect(data.resumen).toMatchObject({ totalRecaudado: 5000, totalPropinas: 0, cantidadVentas: 1, periodo: 'Hoy' });
    expect(data.resumen.porMetodo).toEqual({ efectivo: { count: 0, total: 0 }, tarjeta: { count: 1, total: 5000 } });
  });

  it('la lista conserva TODAS las filas, con indicadores para distinguirlas', async () => {
    const { ventas } = await caja();

    expect(ventas).toHaveLength(3);
    expect(ventas.find((v: any) => v.id === 1)).toMatchObject({ anulada: true, esAnulacion: false });
    expect(ventas.find((v: any) => v.id === 3)).toMatchObject({ anulada: false, esAnulacion: true, total: -25000 });
    expect(ventas.find((v: any) => v.id === 2)).toMatchObject({ anulada: false, esAnulacion: false });
  });
});

describe('escenario real: corregir un cobro (5 ensaladas cobradas, quedó 1)', () => {
  beforeEach(() => {
    db = createFakeDb({
      mesas: [{ id: 2, numero: 2, estado: 'libre', activa: true }],
      productos: [{ id: 9, nombre: 'Ensalada César', precio: 500000, disponible: true }],
      usuarios: [
        { id: 1, nombre: 'Admin' },
        { id: 2, nombre: 'Cocinero' },
        { id: 3, nombre: 'Mozo' },
      ],
    });
    resetCookies();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('el pedido pagado no se puede reabrir ni tocar; se anula la venta y Caja queda en lo correcto', async () => {
    // Sala crea el pedido: 5 ensaladas
    await loginAs('MOZO', 3);
    const creado = await (await CREAR_PEDIDO(json('http://x/api/pedidos', 'POST', { mesaId: 2, items: [{ productoId: 9, cantidad: 5 }] }))).json();
    expect(creado.total).toBe(25000);

    // Cocina: preparando -> listo -> entregado
    await loginAs('COCINERO', 2);
    for (const estado of ['preparando', 'listo', 'entregado']) {
      expect((await ESTADO(json('http://x/api/pedidos', 'PATCH', { id: creado.id, estado }))).status).toBe(200);
    }

    // Sala cobra
    await loginAs('MOZO', 3);
    const pago = await PAGAR(json('http://x/api/checkout/pay', 'POST', { pedidoId: creado.id, mesaId: 2, metodoPago: 'efectivo' }));
    expect(pago.status).toBe(200);

    await loginAs('ADMIN', 1);
    expect((await caja()).resumen).toMatchObject({ totalRecaudado: 25000, cantidadVentas: 1 });

    // El intento del caso real: traer el pedido pagado de vuelta a "preparando", editarlo y volver a cobrar
    await loginAs('COCINERO', 2);
    expect((await ESTADO(json('http://x/api/pedidos', 'PATCH', { id: creado.id, estado: 'preparando' }))).status).toBe(400);
    const edicion = await ITEMS(json('http://x', 'PATCH', { action: 'REMOVE_ITEM', itemId: db.state.items[0].id }), {
      params: Promise.resolve({ id: String(creado.id) }),
    });
    expect(edicion.status).toBe(400);
    expect((await CANCELAR(json('http://x', 'PATCH', { motivo: 'x' }), { params: Promise.resolve({ id: String(creado.id) }) })).status).toBe(400);
    await loginAs('MOZO', 3);
    expect((await PAGAR(json('http://x/api/checkout/pay', 'POST', { pedidoId: creado.id, mesaId: 2 }))).status).toBe(400);
    expect(db.state.items[0].cantidad).toBe(5); // el pedido pagado quedó intacto
    expect(db.state.ventas).toHaveLength(1);

    // Corrección correcta: el ADMIN anula la venta con motivo...
    await loginAs('ADMIN', 1);
    expect((await anular(db.state.ventas[0].id, { motivo: 'Cliente pidió solo 1 ensalada' })).status).toBe(200);
    expect((await caja()).resumen).toMatchObject({ totalRecaudado: 0, cantidadVentas: 0 });

    // ...y se carga el pedido correcto (1 ensalada)
    await loginAs('MOZO', 3);
    const nuevo = await (await CREAR_PEDIDO(json('http://x/api/pedidos', 'POST', { mesaId: 2, items: [{ productoId: 9, cantidad: 1 }] }))).json();
    await loginAs('COCINERO', 2);
    for (const estado of ['preparando', 'listo', 'entregado']) await ESTADO(json('http://x/api/pedidos', 'PATCH', { id: nuevo.id, estado }));
    await loginAs('MOZO', 3);
    expect((await PAGAR(json('http://x/api/checkout/pay', 'POST', { pedidoId: nuevo.id, mesaId: 2 }))).status).toBe(200);

    // Caja neta: $5.000 por UNA venta (no $30.000)
    await loginAs('ADMIN', 1);
    const final = await caja();
    expect(final.resumen).toMatchObject({ totalRecaudado: 5000, cantidadVentas: 1 });
    expect(final.ventas).toHaveLength(3); // venta original + anulación + venta nueva: todo auditable
  });
});
