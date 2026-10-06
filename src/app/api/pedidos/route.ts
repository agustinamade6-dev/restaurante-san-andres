import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import eventEmitter from '@/lib/events';
import { roundMoney } from '@/lib/money';
import { ApiError, MAX_CANTIDAD_ITEM } from '@/lib/api-error';

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

// El precio NO se acepta del cliente: se toma siempre de Producto.precio.
// Si el frontend envía "precio", zod lo descarta (no es error, para no romper el contrato).
const crearPedidoSchema = z.object({
  mesaId: z.coerce.number().int().positive(),
  items: z
    .array(
      z.object({
        productoId: z.coerce.number().int().positive(),
        cantidad: z.coerce.number().int().min(1).max(MAX_CANTIDAD_ITEM),
        notas: z.string().max(500).nullish(),
      })
    )
    .min(1, 'El pedido debe tener al menos un ítem')
    .max(100),
  notas: z.string().max(500).nullish(),
});

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');
    let sessionData = null;
    if (sessionCookie) {
      try { sessionData = JSON.parse(sessionCookie.value); } catch(e){}
    }
    const usuarioId = sessionData?.id;

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Cuerpo JSON inválido' }, { status: 400 });
    }
    const parsed = crearPedidoSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const campo = issue.path.join('.');
      return NextResponse.json(
        { success: false, error: campo ? `${campo}: ${issue.message}` : issue.message },
        { status: 400 }
      );
    }
    const { mesaId, items, notas } = parsed.data;

    const pedido = await prisma.$transaction(async (tx) => {
      const mesa = await tx.mesa.findUnique({ where: { id: mesaId }, select: { id: true, activa: true } });
      if (!mesa) throw new ApiError(404, 'Mesa no encontrada');
      if (!mesa.activa) throw new ApiError(400, 'La mesa no está activa');

      const ids = [...new Set(items.map((i) => i.productoId))];
      const productos = await tx.producto.findMany({ where: { id: { in: ids } } });
      const porId = new Map(productos.map((p) => [p.id, p]));
      for (const id of ids) {
        const producto = porId.get(id);
        if (!producto) throw new ApiError(400, `El producto ${id} no existe`);
        if (!producto.disponible) throw new ApiError(400, `"${producto.nombre}" no está disponible`);
      }

      const lineas = items.map((item) => ({
        productoId: item.productoId,
        cantidad: item.cantidad,
        precio: porId.get(item.productoId)!.precio,
        notas: item.notas || '',
      }));
      const total = roundMoney(lineas.reduce((sum, l) => sum + l.precio * l.cantidad, 0));

      const creado = await tx.pedido.create({
        data: {
          mesaId,
          creadoPorId: usuarioId || null,
          estado: 'pendiente',
          total,
          notas: notas || '',
          items: { create: lineas },
        },
        include: {
          mesa: true,
          items: { include: { producto: true } },
        },
      });

      await tx.mesa.update({ where: { id: mesaId }, data: { estado: 'ocupada' } });
      return creado;
    });

    // Emit real-time event
    eventEmitter.emit('pedido:nuevo', pedido);

    return NextResponse.json(pedido, { status: 201 });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Error creating pedido:', error);
    return NextResponse.json({ success: false, error: 'Error al crear pedido' }, { status: 500 });
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

    // El cobro (Venta + ticket) se registra únicamente en /api/checkout/pay.
    // Permitir "pagado" por acá dejaría pedidos pagados sin Venta.
    if (estado === 'pagado') {
      return NextResponse.json(
        { success: false, error: 'Para cobrar un pedido usá /api/checkout/pay' },
        { status: 400 }
      );
    }

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
