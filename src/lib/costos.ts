/**
 * Equivalente mensual de un costo según su periodicidad (montos en centavos).
 * Antes el dashboard sumaba los montos tal cual: un costo DIARIO de $10.000 contaba como $10.000 por mes en vez de
 * ~$304.000, y el balance del mes salía inflado.
 *   diario  → × 365 / 12  (30,42 días por mes en promedio)
 *   semanal → × 52 / 12   (4,33 semanas por mes)
 *   mensual → × 1
 */
const FACTOR_MENSUAL: Record<string, number> = {
  diario: 365 / 12,
  semanal: 52 / 12,
  mensual: 1,
};

export function montoMensualCentavos(monto: number, periodicidad: string): number {
  return Math.round(monto * (FACTOR_MENSUAL[periodicidad] ?? 1));
}
