/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from './helpers/fakeDb';
import { loginAs, resetCookies } from './helpers/session';
import { enteroDeQuery, idDeQuery } from '@/lib/validacion';

let db: ReturnType<typeof createFakeDb>;
vi.mock('@/lib/prisma', () => ({
  default: new Proxy({}, { get: (_t, prop) => (db.prisma as any)[prop] }),
}));
vi.mock('next/headers', async () => (await import('./helpers/session')).nextHeadersMock());

import { GET as CAJA } from '@/app/api/caja/route';
import { GET as HISTORIAL } from '@/app/api/pedidos/history/route';
import { GET as HISTORIAL_PEDIDO } from '@/app/api/pedidos/[id]/history/route';

const get = (url: string) => new Request('http://localhost' + url);

beforeEach(async () => {
  db = createFakeDb({
    mesas: [{ id: 10, numero: 5, activa: true, estado: 'libre' }],
    pedidos: [
      { id: 1, mesaId: 10, estado: 'pagado', total: 100, actualizadoEn: new Date(), items: [] },
      { id: 2, mesaId: 10, estado: 'pendiente', total: 50, actualizadoEn: new Date(), items: [] },
    ],
    ventas: [{ id: 1, pedidoId: 1, total: 100, propina: 0, metodoPago: 'efectivo', numeroControlInterno: 'CI-1', fechaCobro: new Date() }],
    historial: [{ id: 1, pedidoId: 1, accion: 'X' }],
  });
  resetCookies();
  await loginAs('ADMIN', 1);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('lib/validacion — parámetros de query', () => {
  it('enteroDeQuery: ausente, válido, fuera de rango e inválido', () => {
    expect(enteroDeQuery(get('/x'), 'days', 1, 366)).toBeUndefined();
    expect(enteroDeQuery(get('/x?days='), 'days', 1, 366)).toBeUndefined();
    expect(enteroDeQuery(get('/x?days=7'), 'days', 1, 366)).toBe(7);
    expect(enteroDeQuery(get('/x?days=0'), 'days', 1, 366)).toBeNull();
    expect(enteroDeQuery(get('/x?days=367'), 'days', 1, 366)).toBeNull();
    expect(enteroDeQuery(get('/x?days=abc'), 'days', 1, 366)).toBeNull();
    expect(enteroDeQuery(get('/x?days=1.5'), 'days', 1, 366)).toBeNull();
    expect(enteroDeQuery(get('/x?days=1e2'), 'days', 1, 366)).toBe(100);
  });

  it('idDeQuery: ausente, válido e inválido', () => {
    expect(idDeQuery(get('/x'))).toBeUndefined();
    expect(idDeQuery(get('/x?id=4'))).toBe(4);
    expect(idDeQuery(get('/x?id=-4'))).toBeNull();
    expect(idDeQuery(get('/x?id=a'))).toBeNull();
  });
});

describe('GET /api/caja — parámetro days', () => {
  it('sin days usa 1 ("Hoy"); acepta los períodos de la pantalla', async () => {
    const hoy = await (await CAJA(get('/api/caja'))).json();
    expect(hoy.resumen.periodo).toBe('Hoy');
    expect(hoy.resumen.cantidadVentas).toBe(1);

    expect((await (await CAJA(get('/api/caja?days=7'))).json()).resumen.periodo).toBe('Últimos 7 días');
    expect((await CAJA(get('/api/caja?days=30'))).status).toBe(200);
  });

  it.each(['abc', '0', '-3', '367', '1.5'])('400 con days=%s (antes: error 500 por fecha inválida)', async (valor) => {
    expect((await CAJA(get('/api/caja?days=' + valor))).status).toBe(400);
  });
});

describe('GET /api/pedidos/history — parámetros', () => {
  it('sin parámetros lista los pedidos cerrados; days y mesaNumero filtran', async () => {
    expect((await (await HISTORIAL(get('/api/pedidos/history'))).json()).map((p: any) => p.id)).toEqual([1]);
    expect((await (await HISTORIAL(get('/api/pedidos/history?days=1'))).json())).toHaveLength(1);
    expect((await (await HISTORIAL(get('/api/pedidos/history?mesaNumero=5'))).json())).toHaveLength(1);
    expect((await (await HISTORIAL(get('/api/pedidos/history?mesaNumero=6'))).json())).toHaveLength(0);
  });

  it.each([
    ['days=abc'],
    ['days=0'],
    ['days=999'],
    ['mesaNumero=abc'],
    ['mesaNumero=0'],
  ])('400 con %s', async (query) => {
    expect((await HISTORIAL(get('/api/pedidos/history?' + query))).status).toBe(400);
  });
});

describe('GET /api/pedidos/[id]/history', () => {
  const pedir = (id: string) => HISTORIAL_PEDIDO(get('/x'), { params: Promise.resolve({ id }) });

  it('devuelve el historial del pedido', async () => {
    const res = await pedir('1');
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
  });

  it.each(['abc', '0', '-1', '1.5'])('400 con id %s (antes: error 500)', async (id) => {
    expect((await pedir(id)).status).toBe(400);
  });
});
