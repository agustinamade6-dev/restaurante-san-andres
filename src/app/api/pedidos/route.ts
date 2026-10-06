import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import eventEmitter from '@/lib/events';

export async function GET() {
  try {
    const pedidos = await prisma.pedido.findMany({
      where: {
        estado: { in: ['pendiente', 'preparando', 'listo'] },
      },
      include: {
        mesa: true,
        items: { include: { producto: true } },
        historial: true,
      },
      orderBy: { creadoEn: 'asc' },
    });
    return NextResponse.json(pedidos || []);
  } catch (error) {
    console.error('Error fetching pedidos:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Error al obtener pedidos' }, { status: 500 });
  }
}

import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');
    let sessionData = null;
    if (sessionCookie) {
      try { sessionData = JSON.parse(sessionCookie.value); } catch(e){}
    }
    const usuarioId = sessionData?.id;

    const body = await request.json();
    const { mesaId, items, notas } = body;

    // Calculate total
    const total = items.reduce(
      (sum: number, item: { precio: number; cantidad: number }) =>
        sum + item.precio * item.cantidad,
      0
    );

    const pedido = await prisma.pedido.create({
      data: {
        mesaId,
        creadoPorId: usuarioId || null,
        estado: 'pendiente',
        total,
        notas: notas || '',
        items: {
          create: items.map(
            (item: {
              productoId: number;
              cantidad: number;
              precio: number;
              notas?: string;
            }) => ({
              productoId: item.productoId,
              cantidad: item.cantidad,
              precio: item.precio,
              notas: item.notas || '',
            })
          ),
        },
      },
      include: {
        mesa: true,
        items: { include: { producto: true } },
      },
    });

    // Update mesa status
    await prisma.mesa.update({
      where: { id: mesaId },
      data: { estado: 'ocupada' },
    });

    // Emit real-time event
    eventEmitter.emit('pedido:nuevo', pedido);

    return NextResponse.json(pedido, { status: 201 });
  } catch (error) {
    console.error('Error creating pedido:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Error al crear pedido' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');
    let sessionData = null;
    if (sessionCookie) {
      try { sessionData = JSON.parse(sessionCookie.value); } catch(e){}
    }
    const usuarioId = sessionData?.id;

    const body = await request.json();
    const { id, estado, motivo } = body;

    const updateData: any = { estado };
    if (estado === 'entregado' || estado === 'pagado') {
      updateData.entregadoEn = new Date();
    } else {
      updateData.entregadoEn = null; // Reset if returning to previous states
    }

    const pedido = await prisma.pedido.update({
      where: { id },
      data: updateData,
      include: {
        mesa: true,
        items: { include: { producto: true } },
        historial: true,
      },
    });

    if (estado !== 'entregado' && estado !== 'pagado' && estado !== 'cancelado' && estado !== 'listo') {
      await prisma.historialPedido.create({
        data: {
          pedidoId: id,
          accion: `ESTADO_CAMBIADO_${estado.toUpperCase()}`,
          detalle: `El pedido pasó a estado ${estado}`,
          motivo: motivo || '',
          usuarioId: usuarioId || null,
        }
      });
    }

    // Update mesa status based on order status
    if (estado === 'entregado' || estado === 'pagado' || estado === 'cancelado') {
      // Check if there are other active orders for this mesa
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

      // Record as a venta if delivered or paid
      if (estado === 'entregado' || estado === 'pagado') {
        await prisma.venta.create({
          data: {
            total: pedido.total,
            items: pedido.items.length,
            mesaNumero: pedido.mesa.numero,
            pedido: { connect: { id: pedido.id } },
            mesa: { connect: { id: pedido.mesaId } },
          },
        });
      }
    } else if (estado === 'listo') {
      await prisma.mesa.update({
        where: { id: pedido.mesaId },
        data: { estado: 'esperando' },
      });
    }

    // Emit real-time event
    eventEmitter.emit('pedido:actualizado', pedido);

    return NextResponse.json(pedido);
  } catch (error) {
    console.error('Error updating pedido:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Error al actualizar pedido' }, { status: 500 });
  }
}
