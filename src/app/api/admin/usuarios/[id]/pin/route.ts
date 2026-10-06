import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { hashPin, pinEnUso, PIN_REGEX } from '@/lib/pin';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const userId = Number(id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: 'ID de usuario inválido' }, { status: 400 });
    }

    let body: { pin?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Cuerpo JSON inválido' }, { status: 400 });
    }
    const { pin } = body ?? {};

    if (typeof pin !== 'string' || !PIN_REGEX.test(pin)) {
      return NextResponse.json({ error: 'El PIN debe contener exactamente 4 dígitos numéricos' }, { status: 400 });
    }

    const user = await prisma.usuario.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Los PIN se guardan con hash y sal: la unicidad ya no la puede garantizar la base de datos.
    if (await pinEnUso(pin, userId)) {
      return NextResponse.json({ error: 'Este PIN ya está en uso por otro usuario' }, { status: 400 });
    }

    await prisma.usuario.update({
      where: { id: userId },
      data: { pin: await hashPin(pin) },
    });

    return NextResponse.json({ success: true, message: 'PIN actualizado correctamente' });
  } catch (error) {
    console.error('Error updating PIN:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
