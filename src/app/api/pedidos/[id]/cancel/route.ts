import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import eventEmitter from '@/lib/events';
import { ApiError } from '@/lib/api-error';

const bodySchema = z.object({ motivo: z.string().max(500).nullish() });

const ESTADOS_FINALES = ['pagado', 'cancelado'];

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

    const pedido = await prisma.$transaction(async (tx) => {
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

      // Liberar mesa si no hay más pedidos activos
      const activeOrders = await tx.pedido.count({
        where: { mesaId: cancelado.mesaId, estado: { in: ['pendiente', 'preparando', 'listo'] } },
      });
      if (activeOrders === 0) {
        await tx.mesa.update({ where: { id: cancelado.mesaId }, data: { estado: 'libre' } });
      }

      // Nota: Lógica de reintegro de stock de insumos iría aquí si Producto tuviera
      // mapeada su receta/insumos asociados.
      return cancelado;
    });

    // Emitir eventos para la actualización en tiempo real
    eventEmitter.emit('pedido:actualizado', pedido);
    // Disparar un evento para refrescar las mesas (y que el plano se ponga verde)
    eventEmitter.emit('mesa:actualizada', pedido.mesa);

    return NextResponse.json(pedido);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Error al cancelar pedido:', error);
    return NextResponse.json({ success: false, error: 'Error interno del servidor al cancelar' }, { status: 500 });
  }
}
