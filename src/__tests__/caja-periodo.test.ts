/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from './helpers/fakeDb';
import { loginAs, resetCookies } from './helpers/session';

let db: ReturnType<typeof createFakeDb>;
vi.mock('@/lib/prisma', () => ({
  default: new Proxy({}, { get: (_t, prop) => (db.prisma as any)[prop] }),
}));
vi.mock('next/headers', async () => (await import('./helpers/session')).nextHeadersMock());

import { GET as CAJA } from '@/app/api/caja/route';

// Martes 6/10/2026 a las 15:00 (hora local).
const AHORA = new Date(2026, 9, 6, 15, 0, 0);

const venta = (id: number, fecha: Date) => ({
  id,
  total: 100,
  propina: 0,
  metodoPago: 'efectivo',
  numeroControlInterno: `CI-${id}`,
  fechaCobro: fecha,
});

const ids = async (days?: number) => {
  const res = await CAJA(new Request('http://localhost/api/caja' + (days ? `?days=${days}` : '')));
  const data = await res.json();
  return { ids: data.ventas.map((v: any) => v.id).sort((a: number, b: number) => a - b), resumen: data.resumen };
};

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(AHORA);
  db = createFakeDb({
    ventas: [
      venta(1, new Date(2026, 9, 5, 23, 30)), // ayer, 23:30
      venta(2, new Date(2026, 9, 6, 0, 0, 0)), // hoy, 00:00:00 exactos
      venta(3, new Date(2026, 9, 6, 14, 0)), // hoy, 14:00
      venta(4, new Date(2026, 8, 30, 0, 5)), // hace 6 días, 00:05
      venta(5, new Date(2026, 8, 29, 23, 59)), // hace 7 días, 23:59
      venta(6, new Date(2026, 8, 7, 0, 1)), // hace 29 días, 00:01
      venta(7, new Date(2026, 8, 6, 12, 0)), // hace 30 días, 12:00
    ],
  });
  resetCookies();
  await loginAs('ADMIN', 1);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/caja — el período incluye HOY y no se corre un día (AT-19)', () => {
  it('"Hoy" (days=1) es desde las 00:00 de hoy: NO suma las ventas de ayer', async () => {
    const r = await ids(1);

    expect(r.ids).toEqual([2, 3]);
    expect(r.resumen).toMatchObject({ periodo: 'Hoy', cantidadVentas: 2, totalRecaudado: 200 });
  });

  it('sin days se asume "Hoy"', async () => {
    expect((await ids()).ids).toEqual([2, 3]);
  });

  it('una venta a las 00:00:00 en punto de hoy entra en "Hoy"', async () => {
    expect((await ids(1)).ids).toContain(2);
  });

  it('"Últimos 7 días" son hoy y los 6 anteriores (7 días calendario, no 8)', async () => {
    const r = await ids(7);

    expect(r.ids).toEqual([1, 2, 3, 4]);
    expect(r.ids).not.toContain(5); // hace 7 días queda fuera
    expect(r.resumen.periodo).toBe('Últimos 7 días');
  });

  it('"Últimos 30 días" son hoy y los 29 anteriores', async () => {
    const r = await ids(30);

    expect(r.ids).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.ids).not.toContain(7);
  });

  it('coincide con el criterio del dashboard (/api/metricas): "hoy" empieza a las 00:00 de hoy', async () => {
    const todayStart = new Date(AHORA.getFullYear(), AHORA.getMonth(), AHORA.getDate());
    const enDashboard = db.state.ventas.filter((v) => v.fechaCobro >= todayStart).map((v) => v.id);

    expect((await ids(1)).ids).toEqual(enDashboard.sort());
  });
});
