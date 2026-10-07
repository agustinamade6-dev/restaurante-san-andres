import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { transaccion } from '@/lib/transaccion';
import { enPesos } from '@/lib/money';
import { PEDIDOS_QUE_OCUPAN_MESA } from '@/lib/mesas';
import eventEmitter from '@/lib/events';
import { ApiError } from '@/lib/api-error';
import { ESTADOS_FINALES } from '@/lib/pedidos';

const bodySchema = z.object({ motivo: z.string().max(500).nullish() });


export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth(['ADMIN', 'COCINERO']);
  if (!auth.ok) return auth.response;

  try {
    const usuarioId = auth.session.id;

    const resolvedParams = await params;
    const pedidoId = Number(resolvedParams.id);
    if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
      return NextResponse.json({ success: false, error: 'ID de pedido inválido' }, { status: 400 });
    }

    let raw: unknown = {};
    try {
      raw = await request.json();
    } catch {
      // Sin cuerpo: se cancela con el motivo por defecto.
    }
    const parsed = bodySchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: `motivo: ${parsed.error.issues[0].message}` }, { status: 400 });
    }
    const motivo = parsed.data.motivo?.trim() || 'Cancelado sin motivo especificado';

    const { cancelado: pedido, mesa: mesaLiberada } = await transaccion(async (tx) => {
      // Guard atómico: solo se cancela un pedido que no esté ya pagado ni cancelado.
      const claimed = await tx.pedido.updateMany({
        where: { id: pedidoId, estado: { notIn: ESTADOS_FINALES } },
        data: { estado: 'cancelado' },
      });
      if (claimed.count === 0) {
        const actual = await tx.pedido.findUnique({ where: { id: pedidoId }, select: { id: true, estado: true } });
        if (!actual) throw new ApiError(404, 'Pedido no encontrado');
        throw new ApiError(
          400,
          actual.estado === 'pagado'
            ? 'El pedido ya fue cobrado y no puede cancelarse. Para corregir el cobro, anulá la venta.'
            : 'El pedido ya está cancelado'
        );
      }

      const cancelado = await tx.pedido.findUnique({
        where: { id: pedidoId },
        include: { mesa: true, items: { include: { producto: true } } },
      });
      if (!cancelado) throw new ApiError(404, 'Pedido no encontrado');

      await tx.historialPedido.create({
        data: {
          pedidoId,
          accion: 'PEDIDO_CANCELADO',
          detalle: motivo,
          motivo,
          usuarioId: usuarioId || null,
        },
      });

      // Liberar la mesa si no le quedan pedidos que la ocupen.
      const activos = await tx.pedido.count({
        where: { mesaId: cancelado.mesaId, estado: { in: PEDIDOS_QUE_OCUPAN_MESA } },
      });
      const mesa =
        activos === 0 && cancelado.mesa.estado !== 'libre'
          ? await tx.mesa.update({ where: { id: cancelado.mesaId }, data: { estado: 'libre' } })
          : null;

      // El stock no se toca: un pedido sin cobrar nunca lo descontó (se descuenta al cobrar, ver lib/stock.ts).
      return { cancelado, mesa };
    });

    // Tiempo real: el pedido cancelado y, solo si cambió, la mesa con su estado ya actualizado.
    eventEmitter.emit('pedido:actualizado', enPesos(pedido));
    if (mesaLiberada) eventEmitter.emit('mesa:actualizada', mesaLiberada);

    return NextResponse.json(enPesos(pedido));
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Error al cancelar pedido:', error);
    return NextResponse.json({ success: false, error: 'Error interno del servidor al cancelar' }, { status: 500 });
  }
}
