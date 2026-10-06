/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from './helpers/fakeDb';
import { loginAs, logout, resetCookies } from './helpers/session';

let db: ReturnType<typeof createFakeDb>;
vi.mock('@/lib/prisma', () => ({
  default: new Proxy({}, { get: (_t, prop) => (db.prisma as any)[prop] }),
}));
vi.mock('@/lib/events', () => ({ default: { emit: vi.fn() } }));
vi.mock('next/headers', async () => (await import('./helpers/session')).nextHeadersMock());

import { POST as CREAR, PATCH as ESTADO } from '@/app/api/mesas/route';
import { PATCH as EDITAR, DELETE as ELIMINAR } from '@/app/api/mesas/[id]/route';
import { PUT as LAYOUT } from '@/app/api/mesas/layout/route';
import eventEmitter from '@/lib/events';

const mesa = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  numero: id,
  capacidad: 4,
  sector: 'salon',
  forma: 'round',
  posX: 10,
  posY: 10,
  estado: 'libre',
  activa: true,
  ...over,
});

const req = (method: string, body?: unknown) =>
  new Request('http://localhost/api/mesas', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });

const crear = (b: unknown) => CREAR(req('POST', b));
const editar = (id: number | string, b: unknown) => EDITAR(req('PATCH', b), ctx(id));
const eliminar = (id: number | string) => ELIMINAR(req('DELETE'), ctx(id));
const estado = (b: unknown) => ESTADO(req('PATCH', b));
const layout = (b: unknown) => LAYOUT(req('PUT', b));

beforeEach(async () => {
  db = createFakeDb({
    mesas: [
      mesa(1),
      mesa(2),
      mesa(18, { activa: false }), // eliminada, sin historial
      mesa(19, { activa: false }), // eliminada, con historial
      mesa(20),
    ],
    pedidos: [{ id: 900, mesaId: 19, estado: 'pagado', total: 100, items: [] }],
    ventas: [{ id: 800, mesaId: 19, mesaNumero: 19, total: 100, propina: 0, metodoPago: 'efectivo' }],
  });
  resetCookies();
  await loginAs('ADMIN', 1);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/mesas — crear', () => {
  it('crea una mesa con los valores indicados (y 200, como antes)', async () => {
    const res = await crear({ numero: 30, capacidad: 6, sector: 'barra', forma: 'tall-bar', posX: 50, posY: 50 });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ numero: 30, capacidad: 6, sector: 'barra', forma: 'tall-bar', activa: true });
    expect(db.state.mesas.some((m) => m.numero === 30)).toBe(true);
  });

  it('acepta el payload del frontend (números como texto y campos de más)', async () => {
    const res = await crear({ numero: '31', capacidad: '4', sector: 'salon', forma: 'round', posX: 50, posY: 50, extra: 'x' });
    expect(res.status).toBe(200);
  });

  it('aplica valores por defecto razonables', async () => {
    const data = await (await crear({ numero: 32 })).json();
    expect(data).toMatchObject({ capacidad: 4, sector: 'salon', forma: 'round', posX: 50, posY: 50 });
  });

  it('400 si el número ya lo usa una mesa activa', async () => {
    const res = await crear({ numero: 1 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('El número de mesa ya está en uso');
  });

  it('reactiva la mesa eliminada con ese número (reutiliza la fila, no crea otra)', async () => {
    const antes = db.state.mesas.length;
    const res = await crear({ numero: 18, capacidad: 8, sector: 'barra', forma: 'tall-bar', posX: 5, posY: 6 });

    expect(res.status).toBe(200);
    expect(db.state.mesas).toHaveLength(antes);
    expect(db.state.mesas.find((m) => m.id === 18)).toMatchObject({ activa: true, estado: 'libre', capacidad: 8, sector: 'barra' });
  });

  it('una alta simultánea con el mismo número devuelve 400 y no 500', async () => {
    vi.spyOn(db.prisma.mesa, 'create').mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));
    expect((await crear({ numero: 50 })).status).toBe(400);
  });

  it.each([
    ['número 0', { numero: 0 }],
    ['número negativo (reservado para mesas archivadas)', { numero: -5 }],
    ['número decimal', { numero: 1.5 }],
    ['número no numérico', { numero: 'abc' }],
    ['número demasiado grande', { numero: 10000 }],
    ['sin número', { capacidad: 4 }],
    ['capacidad 0', { numero: 40, capacidad: 0 }],
    ['capacidad excesiva', { numero: 40, capacidad: 99 }],
    ['sector inexistente', { numero: 40, sector: 'terraza' }],
    ['forma inexistente', { numero: 40, forma: 'triangulo' }],
    ['posición no numérica', { numero: 40, posX: 'a' }],
  ])('400 y no crea nada: %s', async (_n, body) => {
    const antes = db.state.mesas.length;
    expect((await crear(body)).status).toBe(400);
    expect(db.state.mesas).toHaveLength(antes);
  });

  it('400 ante JSON inválido; 401 sin sesión; 403 para MOZO', async () => {
    expect((await crear('{roto')).status).toBe(400);
    logout();
    expect((await crear({ numero: 40 })).status).toBe(401);
    await loginAs('MOZO', 3);
    expect((await crear({ numero: 40 })).status).toBe(403);
  });
});

describe('PATCH /api/mesas/[id] — editar y renumerar', () => {
  it('edita capacidad, sector y forma', async () => {
    const res = await editar(1, { capacidad: 8, sector: 'barra', forma: 'square' });

    expect(res.status).toBe(200);
    expect(db.state.mesas[0]).toMatchObject({ capacidad: 8, sector: 'barra', forma: 'square', numero: 1 });
  });

  it('acepta el objeto mesa completo que envía el frontend sin pisar posición ni estado', async () => {
    const res = await editar(1, { ...mesa(1), capacidad: 6, estado: 'ocupada', posX: 99, pedidos: [{ id: 1 }] });

    expect(res.status).toBe(200);
    expect(db.state.mesas[0]).toMatchObject({ capacidad: 6, posX: 10, estado: 'libre' });
  });

  it('renumera a un número libre', async () => {
    expect((await editar(20, { numero: 40 })).status).toBe(200);
    expect(db.state.mesas.find((m) => m.id === 20)?.numero).toBe(40);
  });

  it('el mismo número no es un conflicto consigo misma', async () => {
    expect((await editar(20, { numero: 20, capacidad: 2 })).status).toBe(200);
  });

  it('CASO REAL: renumerar al número de una mesa eliminada SIN historial la borra y libera el número', async () => {
    const res = await editar(20, { numero: 18 });

    expect(res.status).toBe(200);
    expect((await res.json()).numero).toBe(18);
    expect(db.state.mesas.find((m) => m.id === 18)).toBeUndefined(); // la baja lógica vieja desapareció
    expect(db.state.mesas.find((m) => m.id === 20)?.numero).toBe(18);
  });

  it('renumerar al número de una mesa eliminada CON historial la archiva con número negativo y conserva su historial', async () => {
    const res = await editar(20, { numero: 19 });

    expect(res.status).toBe(200);
    expect(db.state.mesas.find((m) => m.id === 19)).toMatchObject({ numero: -19, activa: false });
    expect(db.state.mesas.find((m) => m.id === 20)?.numero).toBe(19);
    expect(db.state.pedidos).toHaveLength(1);
    expect(db.state.ventas[0]).toMatchObject({ mesaId: 19, mesaNumero: 19 }); // el snapshot de la venta no cambia
  });

  it('400 si el número lo usa otra mesa ACTIVA, y no cambia nada', async () => {
    const res = await editar(20, { numero: 2 });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('El número de mesa ya está en uso');
    expect(db.state.mesas.find((m) => m.id === 20)?.numero).toBe(20);
  });

  it('404 si la mesa no existe o fue eliminada; 400 si el id es inválido', async () => {
    expect((await editar(999, { capacidad: 2 })).status).toBe(404);
    expect((await editar(18, { capacidad: 2 })).status).toBe(404);
    expect((await editar('abc', { capacidad: 2 })).status).toBe(400);
    expect((await editar(-1, { capacidad: 2 })).status).toBe(400);
  });

  it.each([
    ['número 0', { numero: 0 }],
    ['número negativo', { numero: -3 }],
    ['número decimal', { numero: 2.5 }],
    ['sector inexistente', { sector: 'jardin' }],
    ['capacidad negativa', { capacidad: -1 }],
  ])('400 y sin cambios: %s', async (_n, body) => {
    expect((await editar(20, body)).status).toBe(400);
    expect(db.state.mesas.find((m) => m.id === 20)).toMatchObject({ numero: 20, capacidad: 4 });
  });

  it('un fallo al final revierte también la baja de la mesa antigua', async () => {
    vi.spyOn(db.prisma.mesa, 'update').mockRejectedValueOnce(new Error('disco lleno'));

    const res = await editar(20, { numero: 18 });

    expect(res.status).toBe(500);
    expect(db.state.mesas.find((m) => m.id === 18)).toBeDefined(); // la mesa 18 sigue ahí
    expect(db.state.mesas.find((m) => m.id === 20)?.numero).toBe(20);
  });

  it('MOZO puede editar (lo usa Sala); COCINERO no', async () => {
    await loginAs('MOZO', 3);
    expect((await editar(1, { capacidad: 5 })).status).toBe(200);
    await loginAs('COCINERO', 3);
    expect((await editar(1, { capacidad: 6 })).status).toBe(403);
  });
});

describe('DELETE /api/mesas/[id] — eliminar', () => {
  it('da de baja una mesa libre y sin pedidos (baja lógica) con la respuesta de siempre', async () => {
    const res = await eliminar(1);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, tableId: 1 });
    expect(db.state.mesas[0].activa).toBe(false);
  });

  it('400 si la mesa está ocupada', async () => {
    db.state.mesas[0].estado = 'ocupada';
    const res = await eliminar(1);

    expect(res.status).toBe(400);
    expect(db.state.mesas[0].activa).toBe(true);
  });

  it.each(['pendiente', 'preparando', 'listo'])('400 si tiene un pedido %s', async (est) => {
    db.addPedido({ id: 50, mesaId: 1, estado: est, total: 1, items: [] });
    expect((await eliminar(1)).status).toBe(400);
    expect(db.state.mesas[0].activa).toBe(true);
  });

  it('REGRESIÓN: 400 si tiene un pedido ENTREGADO sin cobrar, aunque la mesa figure libre', async () => {
    db.addPedido({ id: 50, mesaId: 1, estado: 'entregado', total: 1, items: [] });

    const res = await eliminar(1);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('pendientes de cobro');
    expect(db.state.mesas[0].activa).toBe(true); // la baja se revirtió
  });

  it('permite eliminar si solo hay pedidos pagados o cancelados', async () => {
    db.addPedido({ id: 50, mesaId: 1, estado: 'pagado', total: 1, items: [] });
    db.addPedido({ id: 51, mesaId: 1, estado: 'cancelado', total: 1, items: [] });
    expect((await eliminar(1)).status).toBe(200);
  });

  it('es idempotente: eliminar dos veces responde 200 las dos y no cambia nada más', async () => {
    expect((await eliminar(1)).status).toBe(200);
    const res = await eliminar(1);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, tableId: 1 });
    expect(db.state.mesas[0].activa).toBe(false);
  });

  it('404 si no existe; 400 si el id es inválido; 401 y 403 según el rol', async () => {
    expect((await eliminar(999)).status).toBe(404);
    expect((await eliminar('abc')).status).toBe(400);
    await loginAs('MOZO', 3);
    expect((await eliminar(1)).status).toBe(403);
    logout();
    expect((await eliminar(1)).status).toBe(401);
    expect(db.state.mesas[0].activa).toBe(true);
  });
});

describe('PATCH /api/mesas — cambiar el estado', () => {
  it.each(['ocupada', 'esperando', 'libre'])('cambia a %s', async (est) => {
    const res = await estado({ id: 1, estado: est });
    expect(res.status).toBe(200);
    expect(db.state.mesas[0].estado).toBe(est);
  });

  it('no deja marcar libre una mesa con un pedido en curso', async () => {
    db.state.mesas[0].estado = 'ocupada';
    db.addPedido({ id: 50, mesaId: 1, estado: 'preparando', total: 1, items: [] });

    const res = await estado({ id: 1, estado: 'libre' });

    expect(res.status).toBe(400);
    expect(db.state.mesas[0].estado).toBe('ocupada');
  });

  it.each([
    ['estado inventado', { id: 1, estado: 'rota' }],
    ['sin estado', { id: 1 }],
    ['sin id', { estado: 'libre' }],
    ['id inválido', { id: 'x', estado: 'libre' }],
  ])('400: %s', async (_n, body) => {
    expect((await estado(body)).status).toBe(400);
  });

  it('404 si la mesa no existe o está eliminada; 400 con JSON roto; 403 para COCINERO', async () => {
    expect((await estado({ id: 999, estado: 'libre' })).status).toBe(404);
    expect((await estado({ id: 18, estado: 'libre' })).status).toBe(404);
    expect((await estado('{roto')).status).toBe(400);
    await loginAs('COCINERO', 3);
    expect((await estado({ id: 1, estado: 'libre' })).status).toBe(403);
  });
});

describe('PUT /api/mesas/layout — guardar la distribución', () => {
  it('actualiza las posiciones de todas las mesas', async () => {
    const res = await layout({ mesas: [{ id: 1, posX: 20, posY: 30 }, { id: 2, posX: 40.5, posY: 60.25 }] });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(db.state.mesas.find((m) => m.id === 2)).toMatchObject({ posX: 40.5, posY: 60.25 });
  });

  it('todo o nada: si una mesa no existe, ninguna se mueve', async () => {
    const res = await layout({ mesas: [{ id: 1, posX: 99, posY: 99 }, { id: 777, posX: 1, posY: 1 }] });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('777');
    expect(db.state.mesas[0]).toMatchObject({ posX: 10, posY: 10 });
  });

  it.each([
    ['sin mesas', {}],
    ['mesas no es lista', { mesas: 'x' }],
    ['lista vacía', { mesas: [] }],
    ['posición no numérica', { mesas: [{ id: 1, posX: 'a', posY: 1 }] }],
    ['id inválido', { mesas: [{ id: 'z', posX: 1, posY: 1 }] }],
  ])('400 "Payload inválido": %s', async (_n, body) => {
    const res = await layout(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Payload inválido');
  });

  it('401 sin sesión; 403 para MOZO y COCINERO', async () => {
    logout();
    expect((await layout({ mesas: [{ id: 1, posX: 1, posY: 1 }] })).status).toBe(401);
    for (const rol of ['MOZO', 'COCINERO']) {
      await loginAs(rol, 3);
      expect((await layout({ mesas: [{ id: 1, posX: 1, posY: 1 }] })).status).toBe(403);
    }
    expect(db.state.mesas[0].posX).toBe(10);
  });
});

describe('tiempo real (SSE): cada cambio de mesa se avisa a las otras pantallas', () => {
  const emit = () => eventEmitter.emit as unknown as ReturnType<typeof vi.fn>;
  beforeEach(() => emit().mockClear());

  it.each([
    ['crear', () => crear({ numero: 30, capacidad: 2, sector: 'salon', forma: 'round', posX: 0, posY: 0 })],
    ['reactivar una eliminada', () => crear({ numero: 18, capacidad: 2, sector: 'salon', forma: 'round', posX: 0, posY: 0 })],
    ['cambiar el estado', () => estado({ id: 1, estado: 'ocupada' })],
    ['editar', () => editar(1, { capacidad: 6 })],
    ['eliminar', () => eliminar(2)],
    ['mover el plano', () => layout({ mesas: [{ id: 1, posX: 5, posY: 5 }] })],
  ])('%s emite mesa:actualizada', async (_n, accion) => {
    expect((await accion()).status).toBeLessThan(300);
    expect(emit()).toHaveBeenCalledWith('mesa:actualizada', expect.anything());
  });

  it('una operación rechazada no emite', async () => {
    expect((await crear({ numero: 1, capacidad: 2, sector: 'salon', forma: 'round', posX: 0, posY: 0 })).status).toBe(400);
    expect((await layout({ mesas: [{ id: 777, posX: 1, posY: 1 }] })).status).toBe(400);
    expect(emit()).not.toHaveBeenCalled();
  });
});
