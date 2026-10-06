import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySession, type SessionUser } from '@/lib/session';

export type Rol = 'ADMIN' | 'COCINERO' | 'MOZO';

export type AuthResult =
  | { ok: true; session: SessionUser }
  | { ok: false; response: NextResponse };

/**
 * Exige sesión válida (cookie firmada) y, opcionalmente, uno de los roles indicados.
 * Uso:  const auth = await requireAuth(['ADMIN']); if (!auth.ok) return auth.response;
 */
export async function requireAuth(roles?: readonly Rol[]): Promise<AuthResult> {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) {
    return { ok: false, response: NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 }) };
  }
  if (roles && !roles.includes(session.rol as Rol)) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'No autorizado para esta acción' }, { status: 403 }),
    };
  }
  return { ok: true, session };
}
