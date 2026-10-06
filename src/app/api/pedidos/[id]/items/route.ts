import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import eventEmitter from '@/lib/events';

import { cookies } from 'next/headers';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');
    let sessionData = null;
    if (sessionCookie) {
      try { sessionData = JSON.parse(sessionCookie.value); } catch(e){}
    }
    const usuarioId = sessionData?.id;

    const { id } = await params;
    const pedidoId = parseInt(id, 10);
    const body = await request.json();
    const { action, itemId, productoId, cantidad, precio, notas, motivo } = body;

    const pedido = await prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: { items: { include: { producto: true } }, mesa: true },
    });

    if (!pedido) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    }

    let detalleLog = '';
    let updatedTotal = pedido.total;
    let finalAction = action;

    if (action === 'ADD_ITEM') {
      const producto = await prisma.producto.findUnique({ where: { id: productoId } });
      if (!producto) throw new Error('Producto no existe');

      await prisma.itemPedido.create({
        data: {
          pedidoId,
          productoId,
          cantidad: cantidad || 1,
          precio: precio || producto.precio,
          notas: notas || '',
        },
      });
      
      const subtotal = (precio || producto.precio) * (cantidad || 1);
      updatedTotal += subtotal;
      detalleLog = `Se agregó ${cantidad || 1}x ${producto.nombre}`;
      finalAction = 'ITEM_AGREGADO';

    } else if (action === 'REMOVE_ITEM') {
      const itemToRemove = await prisma.itemPedido.findUnique({
        where: { id: itemId },
        include: { producto: true },
      });
      if (!itemToRemove || itemToRemove.pedidoId !== pedidoId) throw new Error('Item inválido');

      await prisma.itemPedido.delete({ where: { id: itemId } });
      
      const subtotal = itemToRemove.precio * itemToRemove.cantidad;
      updatedTotal -= subtotal;
      detalleLog = `Se removió ${itemToRemove.cantidad}x ${itemToRemove.producto.nombre}`;
      finalAction = 'ITEM_REMOVIDO';

    } else if (action === 'UPDATE_QUANTITY') {
      const itemToUpdate = await prisma.itemPedido.findUnique({
        where: { id: itemId },
        include: { producto: true },
      });
      if (!itemToUpdate || itemToUpdate.pedidoId !== pedidoId) throw new Error('Item inválido');

      const diff = cantidad - itemToUpdate.cantidad;
      if (diff === 0) return NextResponse.json({ success: true });

      await prisma.itemPedido.update({
        where: { id: itemId },
        data: { cantidad },
      });

      updatedTotal += itemToUpdate.precio * diff;
      detalleLog = `Se modificó la cantidad de ${itemToUpdate.producto.nombre} de ${itemToUpdate.cantidad} a ${cantidad}`;
      finalAction = 'CANTIDAD_MODIFICADA';

    } else {
      return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 });
    }

    // Actualizar total del pedido
    const updatedPedido = await prisma.pedido.update({
      where: { id: pedidoId },
      data: { total: Math.max(0, updatedTotal) },
      include: {
        mesa: true,
        items: { include: { producto: true } },
      },
    });

    // Registrar historial
    await prisma.historialPedido.create({
      data: {
        pedidoId,
        accion: finalAction,
        detalle: detalleLog,
        motivo: motivo || '',
        usuarioId: usuarioId || null,
      },
    });

    // Emitir evento para actualizar frontend (KDS y Comandas)
    eventEmitter.emit('pedido:actualizado', updatedPedido);

    return NextResponse.json(updatedPedido);
  } catch (error) {
    console.error('Error modifying pedido items:', error);
    return NextResponse.json({ error: 'Error al modificar ítems' }, { status: 500 });
  }
}
