import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const { pin } = await req.json();
    
    if (!pin) {
      return NextResponse.json({ error: 'PIN requerido' }, { status: 400 });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { pin }
    });

    if (!usuario || !usuario.activo) {
      return NextResponse.json({ error: 'PIN incorrecto o usuario inactivo' }, { status: 401 });
    }

    if (usuario.rol !== 'ADMIN' && usuario.rol !== 'CAJERO' && usuario.rol !== 'ENCARGADO') {
      return NextResponse.json({ error: 'Rol no autorizado. Se requiere PIN de Cajero o Administrador.' }, { status: 403 });
    }

    return NextResponse.json({ success: true, user: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol } });
  } catch (error) {
    console.error('Error in auth:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
