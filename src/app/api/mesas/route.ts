import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { ApiError } from '@/lib/api-error';
import {
  PEDIDOS_QUE_OCUPAN_MESA,
  crearMesaSchema,
  estadoMesaSchema,
  mensajeZod,
} from '@/lib/mesas';

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    const mesas = await prisma.mesa.findMany({
      where: { activa: true },
      orderBy: { numero: 'asc' },
      include: {
        pedidos: {
          where: {
            estado: { in: ['pendiente', 'preparando', 'listo', 'entregado'] },
          },
          include: { 
            items: { include: { producto: true } },
            historial: true,
          },
          orderBy: { creadoEn: 'desc' },
          take: 1,
        },
      },
    });
    return NextResponse.json(mesas || []);
  } catch (error) {
    console.error('Error fetching mesas:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Error al obtener mesas' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAuth(['ADMIN', 'MOZO']);
  if (!auth.ok) return auth.response;

  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Cuerpo JSON inválido' }, { status: 400 });
    }
    const parsed = estadoMesaSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: mensajeZod(parsed.error) }, { status: 400 });
    }
    const { id, estado } = parsed.data;

    const mesa = await prisma.$transaction(async (tx) => {
      const actual = await tx.mesa.findUnique({ where: { id }, select: { id: true, activa: true } });
      if (!actual || !actual.activa) throw new ApiError(404, 'Mesa no encontrada');

      // No se puede marcar libre una mesa que tiene pedidos en curso.
      if (estado === 'libre') {
        const enCurso = await tx.pedido.count({
          where: { mesaId: id, estado: { in: PEDIDOS_QUE_OCUPAN_MESA } },
        });
        if (enCurso > 0) throw new ApiError(400, 'La mesa tiene pedidos en curso y no puede marcarse libre');
      }

      return tx.mesa.update({ where: { id }, data: { estado } });
    });

    return NextResponse.json(mesa);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Error updating mesa:', error);
    return NextResponse.json({ success: false, error: 'Error al actualizar mesa' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Cuerpo JSON inválido' }, { status: 400 });
    }
    const parsed = crearMesaSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: mensajeZod(parsed.error) }, { status: 400 });
    }
    const { numero, capacidad, sector, forma, posX, posY } = parsed.data;

    const mesa = await prisma.$transaction(async (tx) => {
      const exists = await tx.mesa.findUnique({ where: { numero } });
      if (exists) {
        if (exists.activa) throw new ApiError(400, 'El número de mesa ya está en uso');
        // La mesa fue eliminada (baja lógica): se reactiva con los datos nuevos.
        return tx.mesa.update({
          where: { numero },
          data: { activa: true, estado: 'libre', capacidad, sector, forma, posX, posY },
        });
      }
      return tx.mesa.create({
        data: { numero, capacidad, sector, forma, posX, posY, activa: true },
      });
    });

    return NextResponse.json(mesa);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    // Dos altas simultáneas con el mismo número: la restricción única de la base lo detiene.
    if ((error as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'El número de mesa ya está en uso' }, { status: 400 });
    }
    console.error('Error creating mesa:', error);
    return NextResponse.json({ success: false, error: 'Error al crear mesa' }, { status: 500 });
  }
}
