import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { autenticarPin, PIN_REGEX } from '@/lib/pin';
import { claveCliente, registrarExito, registrarFallo, segundosBloqueado } from '@/lib/rate-limit';

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    const clave = claveCliente(req);
    const espera = segundosBloqueado(clave);
    if (espera > 0) {
      return NextResponse.json(
        { error: `Demasiados intentos fallidos. Reintentá en ${espera} segundos.` },
        { status: 429, headers: { 'Retry-After': String(espera) } }
      );
    }

    let body: { pin?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Cuerpo JSON inválido' }, { status: 400 });
    }
    const { pin } = body ?? {};

    if (!pin) {
      return NextResponse.json({ error: 'PIN requerido' }, { status: 400 });
    }

    const usuario = typeof pin === 'string' && PIN_REGEX.test(pin) ? await autenticarPin(pin) : null;

    if (!usuario) {
      registrarFallo(clave);
      return NextResponse.json({ error: 'PIN incorrecto o usuario inactivo' }, { status: 401 });
    }

    // Solo ADMIN (los roles CAJERO y ENCARGADO que se aceptaban antes no existen en el sistema).
    if (usuario.rol !== 'ADMIN') {
      return NextResponse.json({ error: 'Se requiere el PIN de un administrador.' }, { status: 403 });
    }

    registrarExito(clave);
    // Solo confirma: no revela el nombre ni el rol del dueño del PIN, y no cambia la sesión actual.
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in auth:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
