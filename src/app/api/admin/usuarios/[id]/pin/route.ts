import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = parseInt(id, 10);
    const body = await request.json();
    const { pin } = body;

    if (!pin || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'El PIN debe contener exactamente 4 dígitos numéricos' }, { status: 400 });
    }

    const user = await prisma.usuario.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    await prisma.usuario.update({
      where: { id: userId },
      data: { pin },
    });

    return NextResponse.json({ success: true, message: 'PIN actualizado correctamente' });
  } catch (error: any) {
    console.error('Error updating PIN:', error);
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Este PIN ya está en uso por otro usuario' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
