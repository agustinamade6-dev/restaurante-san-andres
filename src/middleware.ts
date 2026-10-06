import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get('session');
  
  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  try {
    const session = JSON.parse(sessionCookie.value);
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

  } catch {
    // Si la cookie es inválida
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/cocina/:path*', '/comandas/:path*'],
};
