import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import eventEmitter from '@/lib/events';
import { dentroDeRango, enPesos, subtotalCentavos } from '@/lib/money';
import { ApiError, cantidadItem } from '@/lib/api-error';

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

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
    return NextResponse.json(enPesos(pedidos || []));
  } catch (error) {
    console.error('Error fetching pedidos:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Error al obtener pedidos' }, { status: 500 });
  }
}


// El precio NO se acepta del cliente: se toma siempre de Producto.precio.
// Si el frontend envía "precio", zod lo descarta (no es error, para no romper el contrato).
const crearPedidoSchema = z.object({
  mesaId: z.coerce.number().int().positive(),
  items: z
    .array(
      z.object({
        productoId: z.coerce.number().int().positive(),
        cantidad: cantidadItem,
        notas: z.string().max(500).nullish(),
      })
    )
    .min(1, 'El pedido debe tener al menos un ítem')
    .max(100),
  notas: z.string().max(500).nullish(),
});

export async function POST(request: Request) {
  const auth = await requireAuth(['ADMIN', 'MOZO']);
  if (!auth.ok) return auth.response;

  try {
    const usuarioId = auth.session.id;

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
      const total = subtotalCentavos(lineas);
      if (!dentroDeRango(total)) throw new ApiError(400, 'El total del pedido supera el máximo que se puede registrar');

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
    const respuesta = enPesos(pedido);
    eventEmitter.emit('pedido:nuevo', respuesta);

    return NextResponse.json(respuesta, { status: 201 });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Error creating pedido:', error);
    return NextResponse.json({ success: false, error: 'Error al crear pedido' }, { status: 500 });
  }
}

// Estados finales: un pedido "pagado" o "cancelado" no vuelve a abrirse.
// Corregir un cobro se hace anulando la venta (POST /api/ventas/[id]/anular), no reabriendo el pedido.
const ESTADOS_FINALES = ['pagado', 'cancelado'];
const ESTADOS_ABIERTOS = ['pendiente', 'preparando', 'listo', 'entregado'];
const ESTADOS_DE_MESA_OCUPADA = ['pendiente', 'preparando', 'listo'];

const cambiarEstadoSchema = z.object({
  id: z.coerce.number().int().positive(),
  estado: z.string(),
  motivo: z.string().max(500).nullish(),
});

export async function PATCH(request: Request) {
  const auth = await requireAuth(['ADMIN', 'COCINERO']);
  if (!auth.ok) return auth.response;

  try {
    const usuarioId = auth.session.id;

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Cuerpo JSON inválido' }, { status: 400 });
    }
    const parsed = cambiarEstadoSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json(
        { success: false, error: `${issue.path.join('.') || 'datos'}: ${issue.message}` },
        { status: 400 }
      );
    }
    const { id, estado, motivo } = parsed.data;

    // El cobro (Venta + ticket) se registra únicamente en /api/checkout/pay.
    if (estado === 'pagado') {
      return NextResponse.json(
        { success: false, error: 'Para cobrar un pedido usá /api/checkout/pay' },
        { status: 400 }
      );
    }
    if (estado === 'cancelado') {
      return NextResponse.json(
        { success: false, error: 'Para cancelar un pedido usá /api/pedidos/[id]/cancel' },
        { status: 400 }
      );
    }
    if (!ESTADOS_ABIERTOS.includes(estado)) {
      return NextResponse.json({ success: false, error: 'Estado inválido' }, { status: 400 });
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const incluir = {
        mesa: true,
        items: { include: { producto: true } },
        historial: true,
      } as const;

      const anterior = await tx.pedido.findUnique({ where: { id }, select: { id: true, estado: true } });
      if (!anterior) throw new ApiError(404, 'Pedido no encontrado');
      if (ESTADOS_FINALES.includes(anterior.estado)) {
        throw new ApiError(
          400,
          anterior.estado === 'pagado'
            ? 'El pedido ya fue cobrado y no puede reabrirse. Para corregir el cobro, anulá la venta.'
            : 'El pedido está cancelado y no puede cambiar de estado'
        );
      }

      // Mismo estado: no hay nada que hacer (evita historial duplicado por doble clic).
      if (anterior.estado === estado) {
        return { pedido: await tx.pedido.findUnique({ where: { id }, include: incluir }), cambio: false };
      }

      // Guard atómico: si un cobro o una cancelación se coló entre la lectura y la escritura, no pisa el estado final.
      const claimed = await tx.pedido.updateMany({
        where: { id, estado: { notIn: ESTADOS_FINALES } },
        data: { estado, entregadoEn: estado === 'entregado' ? new Date() : null },
      });
      if (claimed.count === 0) throw new ApiError(400, 'El pedido ya fue cerrado y no puede cambiar de estado');

      const pedido = await tx.pedido.findUnique({ where: { id }, include: incluir });
      if (!pedido) throw new ApiError(404, 'Pedido no encontrado');

      if (estado !== 'entregado' && estado !== 'listo') {
        await tx.historialPedido.create({
          data: {
            pedidoId: id,
            accion: `ESTADO_CAMBIADO_${estado.toUpperCase()}`,
            detalle: `El pedido pasó a estado ${estado}`,
            motivo: motivo || '',
            usuarioId: usuarioId || null,
          },
        });
      }

      // Estado de la mesa según el estado del pedido.
      if (estado === 'entregado') {
        const activos = await tx.pedido.count({
          where: { mesaId: pedido.mesaId, estado: { in: ESTADOS_DE_MESA_OCUPADA } },
        });
        if (activos === 0) {
          await tx.mesa.update({ where: { id: pedido.mesaId }, data: { estado: 'libre' } });
        }
      } else if (estado === 'listo') {
        await tx.mesa.update({ where: { id: pedido.mesaId }, data: { estado: 'esperando' } });
      } else {
        // pendiente / preparando (p. ej. al reabrir un pedido entregado): la mesa vuelve a estar ocupada.
        await tx.mesa.update({ where: { id: pedido.mesaId }, data: { estado: 'ocupada' } });
      }

      return { pedido, cambio: true };
    });

    // Emit real-time event
    const respuesta = enPesos(resultado.pedido);
    if (resultado.cambio) eventEmitter.emit('pedido:actualizado', respuesta);

    return NextResponse.json(respuesta);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Error updating pedido:', error);
    return NextResponse.json({ success: false, error: 'Error al actualizar pedido' }, { status: 500 });
  }
}
