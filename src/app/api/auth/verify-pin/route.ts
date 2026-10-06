import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { cookies } from 'next/headers';

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const { pin, module } = await req.json();
    
    if (!pin) {
      return NextResponse.json({ error: 'PIN requerido' }, { status: 400 });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { pin }
    });

    if (!usuario || !usuario.activo) {
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

    // Set simple session cookie
    const sessionData = {
      id: usuario.id,
      nombre: usuario.nombre,
      rol: usuario.rol
    };
    
    const cookieStore = await cookies();
    cookieStore.set('session', JSON.stringify(sessionData), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 12, // 12 hours
      path: '/'
    });

    return NextResponse.json({ success: true, user: sessionData });
  } catch (error) {
    console.error('Error in auth:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
