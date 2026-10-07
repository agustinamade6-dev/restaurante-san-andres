/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Dashboard (/api/metricas) y resumen de Caja: las propinas no son ingreso del negocio y los costos se llevan a su
 * equivalente mensual según la periodicidad. Montos de la base en centavos; respuestas en pesos.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from './helpers/fakeDb';
import { loginAs, resetCookies } from './helpers/session';
import { montoMensualCentavos } from '@/lib/costos';

let db: ReturnType<typeof createFakeDb>;
vi.mock('@/lib/prisma', () => ({
  default: new Proxy({}, { get: (_t, prop) => (db.prisma as any)[prop] }),
}));
vi.mock('next/headers', async () => (await import('./helpers/session')).nextHeadersMock());

import { GET as METRICAS } from '@/app/api/metricas/route';
import { GET as CAJA } from '@/app/api/caja/route';

const venta = (id: number, total: number, propina: number, over: Record<string, unknown> = {}) => ({
  id,
  pedidoId: id,
  total,
  propina,
  metodoPago: 'efectivo',
  numeroTicket: `T-${id}`,
  numeroControlInterno: `CI-${id}`,
  fechaCobro: new Date(),
  ...over,
});

beforeEach(async () => {
  db = createFakeDb({
    // Venta 1: $1.000 de consumo + $100 de propina. Venta 2: $500 sin propina.
    ventas: [venta(1, 110000, 10000), venta(2, 50000, 0)],
    costos: [
      { id: 1, concepto: 'Alquiler', monto: 30000000, tipo: 'fijo', periodicidad: 'mensual' }, // $300.000/mes
      { id: 2, concepto: 'Limpieza', monto: 1000000, tipo: 'variable', periodicidad: 'semanal' }, // $10.000/semana
      { id: 3, concepto: 'Hielo', monto: 100000, tipo: 'variable', periodicidad: 'diario' }, // $1.000/día
    ],
  });
  resetCookies();
  await loginAs('ADMIN', 1);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('montoMensualCentavos', () => {
  it('lleva cada periodicidad a su equivalente mensual', () => {
    expect(montoMensualCentavos(30000000, 'mensual')).toBe(30000000);
    expect(montoMensualCentavos(1000000, 'semanal')).toBe(4333333); // × 52/12
    expect(montoMensualCentavos(100000, 'diario')).toBe(3041667); // × 365/12
    expect(montoMensualCentavos(500, 'desconocida')).toBe(500);
  });
});

describe('GET /api/metricas', () => {
  it('las ventas no incluyen las propinas; las propinas se informan aparte', async () => {
    const data = await (await METRICAS()).json();
    expect(data.ventasHoy).toEqual({ total: 1500, cantidad: 2 });
    expect(data.ventasMes.total).toBe(1500);
    expect(data.propinasMes).toBe(100);
  });

  it('los costos se suman en su equivalente mensual y el balance usa ventas sin propinas', async () => {
    const data = await (await METRICAS()).json();
    // 300.000 + 43.333,33 + 30.416,67 = 373.750
    expect(data.costosMensuales).toBe(373750);
    expect(data.balanceMes).toBe(1500 - 373750);
  });

  it('una anulación descuenta también su propina (asiento inverso)', async () => {
    db.state.ventas.push(venta(3, -110000, -10000, { numeroControlInterno: 'ANUL-V1', numeroTicket: 'A-1' }));
    const data = await (await METRICAS()).json();
    expect(data.ventasHoy).toEqual({ total: 500, cantidad: 1 });
    expect(data.propinasMes).toBe(0);
  });
});

describe('GET /api/caja — resumen', () => {
  it('totalRecaudado incluye propinas (arqueo) y totalVentas no (ingreso del negocio)', async () => {
    const { resumen } = await (await CAJA(new Request('http://localhost/api/caja?days=1'))).json();
    expect(resumen).toMatchObject({ totalRecaudado: 1600, totalPropinas: 100, totalVentas: 1500, cantidadVentas: 2 });
  });
});
