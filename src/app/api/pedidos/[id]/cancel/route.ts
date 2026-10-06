import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import eventEmitter from '@/lib/events';


export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireAuth(['ADMIN', 'COCINERO']);
  if (!auth.ok) return auth.response;

  try {
    const usuarioId = auth.session.id;

    const resolvedParams = await params;
    const pedidoId = parseInt(resolvedParams.id);
    const body = await request.json();
    const { motivo } = body;

    // Obtener pedido actual para los ítems
    const pedidoActual = await prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: { items: { include: { producto: true } }, mesa: true },
    });

    if (!pedidoActual) {
      return NextResponse.json({ success: false, error: 'Pedido no encontrado' }, { status: 404 });
    }

    // Wrap the operations in a transaction
    const [pedido] = await prisma.$transaction([
      // 1. Actualizar estado a cancelado
      prisma.pedido.update({
        where: { id: pedidoId },
        data: { estado: 'cancelado' },
        include: {
          mesa: true,
          items: { include: { producto: true } },
        },
      }),
      // 2. Registrar en el historial
      prisma.historialPedido.create({
        data: {
          pedidoId,
          accion: 'PEDIDO_CANCELADO',
          detalle: motivo || 'Cancelado sin motivo especificado',
          motivo: motivo || 'Cancelado sin motivo especificado',
          usuarioId: usuarioId || null,
        },
      }),
    ]);

    // Liberar mesa si no hay más pedidos activos
    const activeOrders = await prisma.pedido.count({
      where: {
        mesaId: pedido.mesaId,
        estado: { in: ['pendiente', 'preparando', 'listo'] },
      },
    });

    if (activeOrders === 0) {
      await prisma.mesa.update({
        where: { id: pedido.mesaId },
        data: { estado: 'libre' },
      });
    }

    // Nota: Lógica de reintegro de stock de insumos iría aquí si Producto tuviera
    // mapeada su receta/insumos asociados.

    // Emitir eventos para la actualización en tiempo real
    eventEmitter.emit('pedido:actualizado', pedido);
    // Disparar un evento para refrescar las mesas (y que el plano se ponga verde)
    eventEmitter.emit('mesa:actualizada', pedido.mesa);

    return NextResponse.json(pedido);
  } catch (error) {
    console.error('Error al cancelar pedido:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error interno del servidor al cancelar' },
      { status: 500 }
    );
  }
}
