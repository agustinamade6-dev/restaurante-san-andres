/** Redondea un monto a centavos para evitar acumulación de error de punto flotante. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
