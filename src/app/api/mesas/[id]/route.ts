import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { transaccion } from '@/lib/transaccion';
import eventEmitter from '@/lib/events';
import { ApiError } from '@/lib/api-error';
import { PEDIDOS_QUE_BLOQUEAN_BORRADO, editarMesaSchema, mensajeZod } from '@/lib/mesas';

function idDeMesa(idStr: string): number | null {
  const id = Number(idStr);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const id = idDeMesa((await params).id);
    if (id === null) {
      return NextResponse.json({ success: false, error: 'ID de mesa inválido' }, { status: 400 });
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Cuerpo JSON inválido' }, { status: 400 });
    }
    const parsed = editarMesaSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: mensajeZod(parsed.error) }, { status: 400 });
    }
    const { numero, capacidad, sector, forma } = parsed.data;

    const mesa = await transaccion(async (tx) => {
      // Escritura neutra inicial: toma el lock de escritura y comprueba que la mesa exista y esté activa.
      const claimed = await tx.mesa.updateMany({
        where: { id, activa: true },
        data: { capacidad: { increment: 0 } },
      });
      if (claimed.count === 0) throw new ApiError(404, 'Mesa no encontrada');

      const actual = await tx.mesa.findUnique({ where: { id } });
      if (!actual) throw new ApiError(404, 'Mesa no encontrada');

      if (numero !== undefined && numero !== actual.numero) {
        const otra = await tx.mesa.findUnique({ where: { numero } });
        if (otra && otra.id !== id) {
          if (otra.activa) throw new ApiError(400, 'El número de mesa ya está en uso');

          // El número lo conserva una mesa ELIMINADA (baja lógica): se libera.
          const [pedidos, ventas] = [
            await tx.pedido.count({ where: { mesaId: otra.id } }),
            await tx.venta.count({ where: { mesaId: otra.id } }),
          ];
          if (pedidos === 0 && ventas === 0) {
            await tx.mesa.delete({ where: { id: otra.id } }); // sin historial: se borra definitivamente
          } else {
            // Con historial no se puede borrar: se archiva con un número negativo único (reservado).
            // Las ventas conservan el número original en Venta.mesaNumero.
            await tx.mesa.update({ where: { id: otra.id }, data: { numero: -otra.id } });
          }
        }
      }

      return tx.mesa.update({
        where: { id },
        data: { numero, capacidad, sector, forma },
      });
    });

    eventEmitter.emit('mesa:actualizada', mesa);
    return NextResponse.json(mesa);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if ((error as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'El número de mesa ya está en uso' }, { status: 400 });
    }
    console.error('Error updating mesa:', error);
    return NextResponse.json({ success: false, error: 'Error al actualizar mesa' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const id = idDeMesa((await params).id);
    if (id === null) {
      return NextResponse.json({ success: false, error: 'ID de mesa inválido' }, { status: 400 });
    }

    await transaccion(async (tx) => {
      const mesa = await tx.mesa.findUnique({ where: { id }, select: { id: true, activa: true } });
      if (!mesa) throw new ApiError(404, 'Mesa no encontrada');
      if (!mesa.activa) return; // ya estaba eliminada: DELETE es idempotente

      // Guard atómico: solo se da de baja una mesa activa y libre.
      const claimed = await tx.mesa.updateMany({
        where: { id, activa: true, estado: 'libre' },
        data: { activa: false },
      });
      if (claimed.count === 0) {
        throw new ApiError(400, 'No se puede eliminar una mesa ocupada o con pedidos activos');
      }

      // Un pedido ENTREGADO aún sin cobrar también bloquea: si no, la mesa desaparece de Sala y no se puede cobrar.
      const pendientes = await tx.pedido.count({
        where: { mesaId: id, estado: { in: PEDIDOS_QUE_BLOQUEAN_BORRADO } },
      });
      if (pendientes > 0) {
        throw new ApiError(400, 'No se puede eliminar una mesa con pedidos activos o pendientes de cobro');
      }
    });

    eventEmitter.emit('mesa:actualizada', { id, activa: false });
    return NextResponse.json({ success: true, tableId: id });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Error deleting mesa:', error);
    return NextResponse.json({ success: false, error: 'Error al eliminar mesa' }, { status: 500 });
  }
}
