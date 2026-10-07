type ConPosicion = { id: number; posX: number; posY: number };

/**
 * Datos nuevos de las mesas (estado, pedidos, mesas agregadas o eliminadas) con las posiciones
 * que el admin movió en el editor del plano y todavía no guardó.
 */
export function conservarPosiciones<T extends ConPosicion>(enPantalla: T[], nuevas: T[]): T[] {
  const posiciones = new Map(enPantalla.map((m) => [m.id, { posX: m.posX, posY: m.posY }]));
  return nuevas.map((m) => ({ ...m, ...posiciones.get(m.id) }));
}
