import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/session';
import { sesionVigente } from '@/lib/auth';

export async function GET() {
  try {
    const cookieStore = await cookies();
    // Igual que requireAuth: un usuario desactivado o borrado ya no tiene sesión, aunque la cookie no haya vencido.
    const user = await sesionVigente(cookieStore.get(SESSION_COOKIE)?.value);
    return NextResponse.json({ user });
  } catch (error) {
    // Un fallo transitorio NO es "sesión vencida": el cliente redirigiría al login a un usuario con cookie válida.
    console.error('Error al verificar la sesión:', error);
    return NextResponse.json({ error: 'No se pudo verificar la sesión' }, { status: 500 });
  }
}
