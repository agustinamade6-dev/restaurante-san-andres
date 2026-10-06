import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const mesas = await prisma.mesa.findMany();
    const ocupadas = mesas.filter(m => m.estado === 'ocupada').length;
    const libres = mesas.filter(m => m.estado === 'libre').length;
    
    const pedidosPreparando = await prisma.pedido.count({
      where: { estado: 'preparando' }
    });

    return NextResponse.json({
      mesas: { ocupadas, libres, total: mesas.length },
      cocina: { preparando: pedidosPreparando }
    });
  } catch (error) {
    console.error('Error fetching hub metrics:', error);
    return NextResponse.json({
      mesas: { ocupadas: 0, libres: 0, total: 0 },
      cocina: { preparando: 0 }
    }, { status: 500 });
  }
}
