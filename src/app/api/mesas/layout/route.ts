import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function PUT(request: Request) {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { mesas } = body;
    
    if (!mesas || !Array.isArray(mesas)) {
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
    }

    // Bulk update positions using a transaction
    await prisma.$transaction(
      mesas.map((m: any) => 
        prisma.mesa.update({
          where: { id: m.id },
          data: { posX: m.posX, posY: m.posY }
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating layout:', error);
    return NextResponse.json({ error: 'Error al actualizar posiciones' }, { status: 500 });
  }
}
