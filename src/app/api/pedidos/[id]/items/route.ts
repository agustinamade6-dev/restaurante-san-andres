import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import eventEmitter from '@/lib/events';
import { enPesos, subtotalCentavos } from '@/lib/money';
import { ApiError, cantidadItem } from '@/lib/api-error';


const idPositivo = z.coerce.number().int().positive();
const cantidad = cantidadItem;
const texto = z.string().max(500).nullish();

// El precio NO se acepta del cliente: ADD_ITEM usa siempre Producto.precio.
const accionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('ADD_ITEM'),
    productoId: idPositivo,
    cantidad: cantidad.default(1),
    notas: texto,
    motivo: texto,
  }),
  z.object({ action: z.literal('REMOVE_ITEM'), itemId: idPositivo, motivo: texto }),
  z.object({ action: z.literal('UPDATE_QUANTITY'), itemId: idPositivo, cantidad, motivo: texto }),
]);

const ESTADOS_CERRADOS = ['pagado', 'cancelado'];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(['ADMIN', 'COCINERO']);
  if (!auth.ok) return auth.response;

  try {
    const usuarioId = auth.session.id;

    const { id } = await params;
    const pedidoId = Number(id);
    if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
      return NextResponse.json({ error: 'ID de pedido inválido' }, { status: 400 });
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: 'Cuerpo JSON inválido' }, { status: 400 });
    }
    const parsed = accionSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const campo = issue.path.join('.');
      const error = campo === 'action' ? 'Acción no soportada' : `${campo}: ${issue.message}`;
      return NextResponse.json({ error }, { status: 400 });
    }
    const data = parsed.data;

    const updatedPedido = await prisma.$transaction(async (tx) => {
      // Guard: toma el lock de escritura y rechaza pedidos cerrados de forma atómica.
      const claimed = await tx.pedido.updateMany({
        where: { id: pedidoId, estado: { notIn: ESTADOS_CERRADOS } },
        data: { actualizadoEn: new Date() },
      });
      if (claimed.count === 0) {
        const existe = await tx.pedido.findUnique({ where: { id: pedidoId }, select: { id: true } });
        throw existe
          ? new ApiError(400, 'No se puede modificar un pedido cerrado')
          : new ApiError(404, 'Pedido no encontrado');
      }

      let detalleLog = '';
      let finalAction = '';

      if (data.action === 'ADD_ITEM') {
        const producto = await tx.producto.findUnique({ where: { id: data.productoId } });
        if (!producto) throw new ApiError(400, 'Producto no existe');
        if (!producto.disponible) throw new ApiError(400, `"${producto.nombre}" no está disponible`);

        await tx.itemPedido.create({
          data: {
            pedidoId,
            productoId: producto.id,
            cantidad: data.cantidad,
            precio: producto.precio,
            notas: data.notas || '',
          },
        });
        detalleLog = `Se agregó ${data.cantidad}x ${producto.nombre}`;
        finalAction = 'ITEM_AGREGADO';
      } else {
        const item = await tx.itemPedido.findUnique({
          where: { id: data.itemId },
          include: { producto: true },
        });
        if (!item || item.pedidoId !== pedidoId) throw new ApiError(400, 'Item inválido');

        if (data.action === 'REMOVE_ITEM') {
          await tx.itemPedido.delete({ where: { id: item.id } });
          detalleLog = `Se removió ${item.cantidad}x ${item.producto.nombre}`;
          finalAction = 'ITEM_REMOVIDO';
        } else {
          if (data.cantidad === item.cantidad) return null; // sin cambios
          await tx.itemPedido.update({ where: { id: item.id }, data: { cantidad: data.cantidad } });
          detalleLog = `Se modificó la cantidad de ${item.producto.nombre} de ${item.cantidad} a ${data.cantidad}`;
          finalAction = 'CANTIDAD_MODIFICADA';
        }
      }

      // El total se recalcula desde los ítems persistidos (no de forma incremental).
      const lineas = await tx.itemPedido.findMany({
        where: { pedidoId },
        select: { precio: true, cantidad: true },
      });
      const total = subtotalCentavos(lineas);

      const actualizado = await tx.pedido.update({
        where: { id: pedidoId },
        data: { total },
        include: {
          mesa: true,
          items: { include: { producto: true } },
        },
      });

      await tx.historialPedido.create({
        data: {
          pedidoId,
          accion: finalAction,
          detalle: detalleLog,
          motivo: data.motivo || '',
          usuarioId: usuarioId || null,
        },
      });

      return actualizado;
    });

    if (!updatedPedido) return NextResponse.json({ success: true });

    // Emitir evento para actualizar frontend (KDS y Comandas)
    const respuesta = enPesos(updatedPedido);
    eventEmitter.emit('pedido:actualizado', respuesta);

    return NextResponse.json(respuesta);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error modifying pedido items:', error);
    return NextResponse.json({ error: 'Error al modificar ítems' }, { status: 500 });
  }
}
