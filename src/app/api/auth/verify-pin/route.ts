import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { autenticarPin, PIN_REGEX } from '@/lib/pin';
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession } from '@/lib/session';
import { claveCliente, registrarExito, registrarFallo, segundosBloqueado } from '@/lib/rate-limit';
import { origenPermitido } from '@/lib/origen';

export async function POST(req: Request) {
  // Login CSRF: una página de otro sitio no puede iniciar sesión en nombre de este equipo.
  if (!origenPermitido(req.headers)) {
    return NextResponse.json({ error: 'Origen de la petición no permitido' }, { status: 403 });
  }

  try {
    const clave = claveCliente(req);
    const espera = segundosBloqueado(clave);
    if (espera > 0) {
      return NextResponse.json(
        { error: `Demasiados intentos fallidos. Reintentá en ${espera} segundos.` },
        { status: 429, headers: { 'Retry-After': String(espera) } }
      );
    }

    let body: { pin?: unknown; module?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Cuerpo JSON inválido' }, { status: 400 });
    }
    const { pin, module } = body ?? {};

    if (!pin) {
      return NextResponse.json({ error: 'PIN requerido' }, { status: 400 });
    }

    const usuario = typeof pin === 'string' && PIN_REGEX.test(pin) ? await autenticarPin(pin) : null;

    if (!usuario) {
      registrarFallo(clave);
      return NextResponse.json({ error: 'PIN incorrecto o usuario inactivo' }, { status: 401 });
    }

    // Validate role against module
    if (module === 'admin' && usuario.rol !== 'ADMIN') {
      return NextResponse.json({ error: 'Rol no autorizado para Administración' }, { status: 403 });
    }
    if (module === 'cocina' && !['ADMIN', 'COCINERO'].includes(usuario.rol)) {
      return NextResponse.json({ error: 'Rol no autorizado para Cocina' }, { status: 403 });
    }
    if (module === 'comandas' && !['ADMIN', 'MOZO'].includes(usuario.rol)) {
      return NextResponse.json({ error: 'Rol no autorizado para Sala' }, { status: 403 });
    }

    registrarExito(clave);

    const sessionData = { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol };

    // Cookie firmada y httpOnly: el navegador no puede leerla ni fabricarla.
    // "secure" solo con HTTPS; en modo LAN (http://IP:3000) una cookie secure sería descartada.
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, await signSession(sessionData), {
      httpOnly: true,
      sameSite: 'lax',
      secure: new URL(req.url).protocol === 'https:',
      maxAge: SESSION_MAX_AGE,
      path: '/',
    });

    return NextResponse.json({ success: true, user: sessionData });
  } catch (error) {
    console.error('Error in auth:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
