import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { ApiError } from '@/lib/api-error';
import { aPesos, enPesos } from '@/lib/money';
import { PREFIJO_ANULACION, esAnulacion } from '@/lib/ventas';
import { reintegrarStockDeVenta } from '@/lib/stock';

const bodySchema = z.object({
  motivo: z.string().trim().min(3, 'El motivo es obligatorio (mínimo 3 caracteres)').max(500),
});

/**
 * Anula una venta por asiento inverso (ver lib/ventas.ts). Solo ADMIN, con motivo obligatorio.
 * La venta original queda intacta; se registra una venta con importe negativo y una entrada en el
 * historial del pedido con quién, cuándo y por qué.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const ventaId = Number(id);
    if (!Number.isInteger(ventaId) || ventaId <= 0) {
      return NextResponse.json({ success: false, error: 'ID de venta inválido' }, { status: 400 });
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Cuerpo JSON inválido' }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { motivo } = parsed.data;
    const usuarioId = auth.session.id;

    const hoy = new Date();
    const prefijoFecha = `${hoy.getFullYear()}${(hoy.getMonth() + 1).toString().padStart(2, '0')}${hoy.getDate().toString().padStart(2, '0')}`;

    const { original, anulacion } = await prisma.$transaction(async (tx) => {
      // Escritura inicial neutra: toma el lock de escritura para que dos anulaciones simultáneas se serialicen.
      const claimed = await tx.venta.updateMany({ where: { id: ventaId }, data: { total: { increment: 0 } } });
      if (claimed.count === 0) throw new ApiError(404, 'Venta no encontrada');

      const original = await tx.venta.findUnique({ where: { id: ventaId } });
      if (!original) throw new ApiError(404, 'Venta no encontrada');
      if (esAnulacion(original) || original.total <= 0) {
        throw new ApiError(400, 'Esta venta no se puede anular');
      }

      const yaAnulada = await tx.venta.count({ where: { numeroControlInterno: `${PREFIJO_ANULACION}${original.id}` } });
      if (yaAnulada > 0) throw new ApiError(400, 'Esta venta ya fue anulada');

      const usuario = await tx.usuario.findUnique({ where: { id: usuarioId }, select: { id: true } });
      if (!usuario) throw new ApiError(400, 'Usuario inválido');

      const anuladasHoy = await tx.venta.count({ where: { numeroTicket: { startsWith: `A-${prefijoFecha}-` } } });
      const numeroTicket = `A-${prefijoFecha}-${(anuladasHoy + 1).toString().padStart(4, '0')}`;

      const anulacion = await tx.venta.create({
        data: {
          pedidoId: original.pedidoId,
          mesaId: original.mesaId,
          mesaNumero: original.mesaNumero,
          total: -original.total,
          propina: -original.propina,
          metodoPago: original.metodoPago,
          cajeroId: usuarioId,
          numeroTicket,
          numeroControlInterno: `${PREFIJO_ANULACION}${original.id}`,
          items: 0,
        },
      });

      // Devuelve al stock exactamente lo que descontó el cobro original.
      await reintegrarStockDeVenta(tx, { ventaOriginalId: original.id, anulacionId: anulacion.id, usuarioId });

      if (original.pedidoId) {
        await tx.historialPedido.create({
          data: {
            pedidoId: original.pedidoId,
            accion: 'VENTA_ANULADA',
            detalle: `Venta ${original.numeroTicket || `#${original.id}`} anulada por $${aPesos(original.total).toLocaleString()}`,
            motivo,
            usuarioId,
          },
        });
      }

      return { original, anulacion };
    });

    return NextResponse.json({
      success: true,
      anulacion: enPesos(anulacion),
      ventaOriginal: { id: original.id, numeroTicket: original.numeroTicket, total: aPesos(original.total) },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Error al anular venta:', error);
    return NextResponse.json({ success: false, error: 'Error al anular la venta' }, { status: 500 });
  }
}
