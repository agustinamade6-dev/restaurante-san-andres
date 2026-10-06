import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  const usuarios = await prisma.usuario.findMany({
    select: {
      id: true,
      nombre: true,
      rol: true,
      activo: true,
    },
    orderBy: { rol: 'asc' }
  });
  return NextResponse.json(usuarios);
}
