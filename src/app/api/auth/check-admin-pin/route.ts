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

    if (usuario.rol !== 'ADMIN' && usuario.rol !== 'CAJERO' && usuario.rol !== 'ENCARGADO') {
      return NextResponse.json({ error: 'Rol no autorizado. Se requiere PIN de Cajero o Administrador.' }, { status: 403 });
    }

    registrarExito(clave);
    return NextResponse.json({ success: true, user: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol } });
  } catch (error) {
    console.error('Error in auth:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
