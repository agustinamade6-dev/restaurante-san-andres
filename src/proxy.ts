import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session';
import { sesionVigente } from '@/lib/auth';

export async function proxy(request: NextRequest) {
  // Cookie firmada (una fabricada o alterada no pasa) y usuario todavía activo en la base (el proxy corre en Node.js).
  const session = await sesionVigente(request.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith('/admin') && session.rol !== 'ADMIN') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (pathname.startsWith('/cocina') && !['ADMIN', 'COCINERO'].includes(session.rol)) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (pathname.startsWith('/comandas') && !['ADMIN', 'MOZO'].includes(session.rol)) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/cocina/:path*', '/comandas/:path*'],
};
