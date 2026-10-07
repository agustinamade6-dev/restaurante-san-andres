import type { Prisma } from '@prisma/client';

/**
 * Stock de insumos conectado a las ventas (AT-12).
 *
 * - Al COBRAR, cada producto vendido descuenta los insumos de su receta (RecetaItem × cantidad vendida).
 * - Al ANULAR la venta, se revierten exactamente los movimientos que generó ese cobro (no se recalcula con la receta
 *   actual, que pudo cambiar desde entonces).
 * - Cancelar un pedido que no se cobró no toca el stock: nunca se descontó.
 *
 * El stock PUEDE quedar negativo: una venta real no se bloquea porque el inventario cargado esté desactualizado.
 * El stock negativo aparece en Inventario como "bajo stock" y avisa que hay que corregir el conteo.
 *
 * Las funciones reciben el cliente de una transacción: se ejecutan dentro de la misma transacción que el cobro o la
 * anulación, así que si algo falla no queda ni la venta sin descuento ni el descuento sin venta.
 */

type Tx = Prisma.TransactionClient;

export const MOTIVO_VENTA = 'VENTA';
export const MOTIVO_ANULACION = 'ANULACION';
export const MOTIVO_AJUSTE = 'AJUSTE';

/** Las cantidades de insumo son decimales (0,2 kg): se redondean a 4 decimales para no acumular ruido binario. */
export function redondearCantidad(valor: number): number {
  return Math.round(valor * 10_000) / 10_000;
}

async function moverStock(
  tx: Tx,
  insumoId: number,
  cantidad: number,
  datos: { motivo: string; ventaId: number | null; usuarioId: number | null; detalle?: string }
) {
  const insumo = await tx.insumo.findUnique({ where: { id: insumoId }, select: { stockActual: true } });
  if (!insumo) return;
  await tx.insumo.update({
    where: { id: insumoId },
    data: { stockActual: redondearCantidad(insumo.stockActual + cantidad) },
  });
  await tx.movimientoStock.create({ data: { insumoId, cantidad, ...datos } });
}

/**
 * Descuenta del stock lo que consume una venta según las recetas de sus productos.
 * Devuelve la cantidad de insumos afectados (0 si ningún producto tiene receta).
 */
export async function descontarStockDeVenta(
  tx: Tx,
  { ventaId, usuarioId, items }: { ventaId: number; usuarioId: number | null; items: { productoId: number; cantidad: number }[] }
): Promise<number> {
  const productoIds = [...new Set(items.map((i) => i.productoId))];
  if (productoIds.length === 0) return 0;
  const recetas = await tx.recetaItem.findMany({ where: { productoId: { in: productoIds } } });

  const consumo = new Map<number, number>();
  for (const item of items) {
    for (const r of recetas.filter((r) => r.productoId === item.productoId)) {
      consumo.set(r.insumoId, (consumo.get(r.insumoId) ?? 0) + r.cantidad * item.cantidad);
    }
  }

  for (const [insumoId, cantidad] of consumo) {
    await moverStock(tx, insumoId, -redondearCantidad(cantidad), { motivo: MOTIVO_VENTA, ventaId, usuarioId });
  }
  return consumo.size;
}

/**
 * Reintegra al stock lo que descontó la venta `ventaOriginalId`, registrando los movimientos inversos con la venta de
 * anulación. Una venta cobrada antes de existir las recetas no tiene movimientos: no reintegra nada.
 */
export async function reintegrarStockDeVenta(
  tx: Tx,
  { ventaOriginalId, anulacionId, usuarioId }: { ventaOriginalId: number; anulacionId: number; usuarioId: number | null }
): Promise<number> {
  const movimientos = await tx.movimientoStock.findMany({ where: { ventaId: ventaOriginalId, motivo: MOTIVO_VENTA } });
  for (const m of movimientos) {
    await moverStock(tx, m.insumoId, -m.cantidad, { motivo: MOTIVO_ANULACION, ventaId: anulacionId, usuarioId });
  }
  return movimientos.length;
}

/**
 * Ajuste manual de stock (conteo físico, merma, compra recibida): SUMA o RESTA `delta` sobre el valor actual de la
 * base, en vez de reemplazarlo. Así no se pisan los descuentos de ventas hechas entre que se abrió la pantalla y se
 * guardó, y el ajuste queda registrado con su motivo y su usuario.
 */
export async function ajustarStock(
  tx: Tx,
  { insumoId, delta, detalle, usuarioId }: { insumoId: number; delta: number; detalle: string; usuarioId: number | null }
) {
  await moverStock(tx, insumoId, redondearCantidad(delta), { motivo: MOTIVO_AJUSTE, ventaId: null, usuarioId, detalle });
  return tx.insumo.findUnique({ where: { id: insumoId }, include: { proveedor: true } });
}
