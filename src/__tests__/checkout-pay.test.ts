/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from './helpers/fakeDb';
import { loginAs, logout, resetCookies } from './helpers/session';

let db: ReturnType<typeof createFakeDb>;

vi.mock('@/lib/prisma', () => ({
  default: new Proxy({}, { get: (_t, prop) => (db.prisma as any)[prop] }),
}));

vi.mock('next/headers', async () => (await import('./helpers/session')).nextHeadersMock());

import { POST } from '@/app/api/checkout/pay/route';

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};

const pedidoBase = (over: Record<string, unknown> = {}) => ({
  id: 1,
  mesaId: 10,
  estado: 'entregado',
  total: 999, // total acumulado "desfasado" a propósito
  items: [
    { id: 1, productoId: 1, cantidad: 2, precio: 1500, producto: { nombre: 'Milanesa' } },
    { id: 2, productoId: 2, cantidad: 1, precio: 800.5, producto: { nombre: 'Gaseosa' } },
  ],
  ...over,
});

const seed = () =>
  createFakeDb({
    pedidos: [pedidoBase()],
    mesas: [{ id: 10, numero: 5, sector: 'salon', estado: 'ocupada' }],
    usuarios: [
      { id: 7, nombre: 'Cajero' },
      { id: 8, nombre: 'Otro mozo' },
    ],
  });

const pagar = (body: unknown) =>
  POST(
    new Request('http://localhost/api/checkout/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );

const valido = { pedidoId: 1, mesaId: 10, metodoPago: 'efectivo', propina: 100, cajeroId: 7 };

beforeEach(async () => {
  db = seed();
  resetCookies();
  await loginAs('MOZO', 7, 'Cajero');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/checkout/pay — camino feliz', () => {
  it('cobra, crea UNA venta, marca pagado y libera la mesa', async () => {
    const res = await pagar(valido);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(db.state.ventas).toHaveLength(1);
    expect(db.state.pedidos[0].estado).toBe('pagado');
    expect(db.state.mesas[0].estado).toBe('libre');
    expect(db.state.historial.map((h) => h.accion)).toContain('COBRADO');
  });

  it('calcula subtotal desde los ítems (no desde pedido.total) y suma la propina', async () => {
    const data = await (await pagar(valido)).json();

    // 2 x 1500 + 800.5 = 3800.5 ; + propina 100 = 3900.5
    expect(data.ticketCliente.subtotal).toBe(3800.5);
    expect(data.venta.total).toBe(3900.5);
    expect(db.state.pedidos[0].total).toBe(3800.5); // corrige el total desfasado
  });

  it('mantiene el contrato de respuesta que consume el frontend', async () => {
    const data = await (await pagar(valido)).json();

    expect(Object.keys(data).sort()).toEqual(['success', 'ticketCliente', 'ticketInterno', 'venta']);
    expect(data.ticketCliente).toMatchObject({ tipo: 'CLIENTE', mesa: 5, metodoPago: 'efectivo', propina: 100 });
    expect(data.ticketCliente.items[0]).toEqual({ nombre: 'Milanesa', cantidad: 2, precioUnit: 1500, subtotal: 3000 });
    expect(data.ticketInterno).toMatchObject({ tipo: 'INTERNO', sector: 'salon', operadorId: 7 });
  });

  it('usa efectivo y propina 0 por defecto; el cajero es el de la sesión', async () => {
    const res = await pagar({ pedidoId: 1, mesaId: 10, cajeroId: null });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.venta).toMatchObject({ metodoPago: 'efectivo', propina: 0, cajeroId: 7 });
  });

  it('ignora el cajeroId del body: no se puede cobrar a nombre de otro usuario', async () => {
    const data = await (await pagar({ ...valido, cajeroId: 8 })).json();

    expect(data.venta.cajeroId).toBe(7);
    expect(data.ticketInterno.operadorId).toBe(7);
    expect(db.state.historial.find((h) => h.accion === 'COBRADO')?.usuarioId).toBe(7);
  });

  it('no libera la mesa si hay otro pedido activo en ella', async () => {
    db.addPedido(pedidoBase({ id: 2, estado: 'preparando' }));

    await pagar(valido);

    expect(db.state.mesas[0].estado).toBe('ocupada');
  });
});

describe('POST /api/checkout/pay — numeración de tickets', () => {
  it('genera tickets correlativos T-AAAAMMDD-NNNN', async () => {
    db.addPedido(pedidoBase({ id: 2 }));

    const a = await (await pagar(valido)).json();
    const b = await (await pagar({ ...valido, pedidoId: 2 })).json();

    expect(a.ticketCliente.numeroTicket).toBe(`T-${hoy()}-0001`);
    expect(b.ticketCliente.numeroTicket).toBe(`T-${hoy()}-0002`);
    expect(b.ticketInterno.numeroControlInterno).toBe(`CI-${hoy()}-0002`);
  });

  it('ignora ventas legadas sin ticket al numerar', async () => {
    db.state.ventas.push({ id: 1, pedidoId: 99, total: 10, numeroTicket: '' });

    const data = await (await pagar(valido)).json();

    expect(data.ticketCliente.numeroTicket).toBe(`T-${hoy()}-0001`);
  });
});

describe('POST /api/checkout/pay — idempotencia y concurrencia (modelo single-writer)', () => {
  it('rechaza cobrar dos veces el mismo pedido', async () => {
    await pagar(valido);
    const res = await pagar(valido);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Este pedido ya fue cerrado o cancelado');
    expect(db.state.ventas).toHaveLength(1);
  });

  it('con dos cobros simultáneos solo uno gana y se crea una sola venta', async () => {
    const [r1, r2] = await Promise.all([pagar(valido), pagar(valido)]);

    expect([r1.status, r2.status].sort()).toEqual([200, 400]);
    expect(db.state.ventas).toHaveLength(1);
    expect(db.state.historial.filter((h) => h.accion === 'COBRADO')).toHaveLength(1);
  });

  it('cobros simultáneos de pedidos distintos no repiten el número de ticket', async () => {
    db.addPedido(pedidoBase({ id: 2 }));

    await Promise.all([pagar(valido), pagar({ ...valido, pedidoId: 2 })]);

    const tickets = db.state.ventas.map((v) => v.numeroTicket);
    expect(new Set(tickets).size).toBe(2);
  });
});

describe('POST /api/checkout/pay — validación', () => {
  it.each([
    ['sin pedidoId', { mesaId: 10 }],
    ['sin mesaId', { pedidoId: 1 }],
    ['pedidoId no numérico', { pedidoId: 'abc', mesaId: 10 }],
  ])('400 con mensaje legado: %s', async (_n, body) => {
    const res = await pagar(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('pedidoId y mesaId son requeridos');
  });

  it.each([
    ['método de pago inexistente', { ...valido, metodoPago: 'bitcoin' }],
    ['propina negativa', { ...valido, propina: -50 }],
    ['propina NaN', { ...valido, propina: 'mucho' }],
  ])('400: %s', async (_n, body) => {
    const res = await pagar(body);
    expect(res.status).toBe(400);
    expect((await res.json()).success).toBe(false);
    expect(db.state.ventas).toHaveLength(0);
  });

  it('400 ante JSON inválido (antes era 500)', async () => {
    const res = await pagar('{no es json');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/checkout/pay — reglas de negocio y rollback', () => {
  it('404 si el pedido no existe', async () => {
    const res = await pagar({ ...valido, pedidoId: 12345 });
    expect(res.status).toBe(404);
  });

  it('400 si el pedido está cancelado y no crea venta', async () => {
    db.state.pedidos[0].estado = 'cancelado';
    const res = await pagar(valido);
    expect(res.status).toBe(400);
    expect(db.state.ventas).toHaveLength(0);
    expect(db.state.pedidos[0].estado).toBe('cancelado');
  });

  it('400 si la mesa no corresponde al pedido y deja el pedido sin cobrar', async () => {
    const res = await pagar({ ...valido, mesaId: 11 });
    expect(res.status).toBe(400);
    expect(db.state.pedidos[0].estado).toBe('entregado'); // rollback del guard
    expect(db.state.ventas).toHaveLength(0);
  });

  it('400 si el usuario de la sesión ya no existe y hace rollback', async () => {
    await loginAs('MOZO', 999);
    const res = await pagar(valido);
    expect(res.status).toBe(400);
    expect(db.state.pedidos[0].estado).toBe('entregado');
  });

  it('400 si el pedido no tiene ítems', async () => {
    db.state.items.length = 0;
    const res = await pagar(valido);
    expect(res.status).toBe(400);
    expect(db.state.pedidos[0].estado).toBe('entregado');
  });

  it('un fallo a mitad de la transacción revierte todo y responde 500 sin filtrar detalles', async () => {
    db.failOn.add('venta.create');

    const res = await pagar(valido);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toBe('Error al procesar el cobro');
    expect(db.state.pedidos[0].estado).toBe('entregado');
    expect(db.state.mesas[0].estado).toBe('ocupada');
    expect(db.state.historial).toHaveLength(0);
  });
});

describe('POST /api/checkout/pay — autenticación y roles', () => {
  it('401 sin sesión y no cobra', async () => {
    logout();
    const res = await pagar(valido);

    expect(res.status).toBe(401);
    expect(db.state.ventas).toHaveLength(0);
    expect(db.state.pedidos[0].estado).toBe('entregado');
  });

  it('403 para COCINERO y no cobra', async () => {
    await loginAs('COCINERO', 7);
    const res = await pagar(valido);

    expect(res.status).toBe(403);
    expect(db.state.ventas).toHaveLength(0);
  });

  it('ADMIN también puede cobrar', async () => {
    await loginAs('ADMIN', 7);
    expect((await pagar(valido)).status).toBe(200);
  });
});
