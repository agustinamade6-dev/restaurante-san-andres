import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import eventEmitter from '@/lib/events';
import { ApiError } from '@/lib/api-error';
import { layoutSchema } from '@/lib/mesas';

export async function PUT(request: Request) {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
    }
    const parsed = layoutSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
    }
    const { mesas } = parsed.data;

    // Todo o nada: si una mesa no existe no se mueve ninguna.
    await prisma.$transaction(async (tx) => {
      const ids = [...new Set(mesas.map((m) => m.id))];
      const existentes = await tx.mesa.findMany({ where: { id: { in: ids } }, select: { id: true } });
      const encontrados = new Set(existentes.map((m) => m.id));
      const faltante = ids.find((id) => !encontrados.has(id));
      if (faltante !== undefined) throw new ApiError(400, `La mesa ${faltante} no existe`);

      for (const m of mesas) {
        await tx.mesa.update({ where: { id: m.id }, data: { posX: m.posX, posY: m.posY } });
      }
    });

    eventEmitter.emit('mesa:actualizada', { layout: true });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error updating layout:', error);
    return NextResponse.json({ error: 'Error al actualizar posiciones' }, { status: 500 });
  }
}
