import { aPesos } from '@/lib/money';

/**
 * Anulación de ventas por asiento inverso: la venta original nunca se modifica ni se borra.
 * Se registra OTRA venta con importe negativo, y su numeroControlInterno guarda el id de la original
 * ("ANUL-V<id>"). Así los totales de Caja se netean solos y queda rastro de la anulación.
 * No requiere cambios en el esquema de la base de datos.
 */
export const PREFIJO_ANULACION = 'ANUL-V';

interface VentaMinima {
  id?: number;
  total: number;
  propina: number;
  metodoPago: string;
  numeroControlInterno?: string | null;
}

export function esAnulacion(v: Pick<VentaMinima, 'numeroControlInterno'>): boolean {
  return !!v.numeroControlInterno?.startsWith(PREFIJO_ANULACION);
}

/** Id de la venta original que anula este asiento, o null si no es una anulación. */
export function ventaAnuladaId(v: Pick<VentaMinima, 'numeroControlInterno'>): number | null {
  if (!esAnulacion(v)) return null;
  const n = Number(v.numeroControlInterno!.slice(PREFIJO_ANULACION.length));
  return Number.isInteger(n) ? n : null;
}

/** Cantidad neta: cada venta suma 1 y cada anulación resta 1. */
export function contarVentasNetas(ventas: Pick<VentaMinima, 'numeroControlInterno'>[]): number {
  return ventas.reduce((n, v) => n + (esAnulacion(v) ? -1 : 1), 0);
}

/**
 * Resumen neto de Caja. Recibe las ventas como salen de la base (montos en centavos), suma en centavos
 * (exacto) y devuelve los totales en PESOS, listos para responder.
 */
export function resumirVentas(ventas: VentaMinima[]) {
  const centavosPorMetodo: Record<string, { count: number; total: number }> = {};
  for (const v of ventas) {
    const m = (centavosPorMetodo[v.metodoPago] ??= { count: 0, total: 0 });
    m.count += esAnulacion(v) ? -1 : 1;
    m.total += v.total;
  }
  const porMetodo = Object.fromEntries(
    Object.entries(centavosPorMetodo).map(([metodo, m]) => [metodo, { count: m.count, total: aPesos(m.total) }])
  );
  const recaudado = ventas.reduce((s, v) => s + v.total, 0);
  const propinas = ventas.reduce((s, v) => s + v.propina, 0);
  return {
    // Lo que entró a caja (incluye propinas): sirve para el arqueo.
    totalRecaudado: aPesos(recaudado),
    totalPropinas: aPesos(propinas),
    // Ingreso del negocio por ventas: sin propinas (son del personal).
    totalVentas: aPesos(recaudado - propinas),
    cantidadVentas: contarVentasNetas(ventas),
    porMetodo,
  };
}

/** Agrega a cada venta los indicadores `esAnulacion` y `anulada` (ya fue anulada por un asiento inverso). */
export function marcarAnuladas<T extends VentaMinima>(ventas: T[]): (T & { esAnulacion: boolean; anulada: boolean })[] {
  const anuladas = new Set(ventas.map(ventaAnuladaId).filter((id): id is number => id !== null));
  return ventas.map((v) => ({
    ...v,
    esAnulacion: esAnulacion(v),
    anulada: v.id !== undefined && anuladas.has(v.id),
  }));
}
