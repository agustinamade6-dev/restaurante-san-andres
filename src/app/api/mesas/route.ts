import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const mesas = await prisma.mesa.findMany({
      where: { activa: true },
      orderBy: { numero: 'asc' },
      include: {
        pedidos: {
          where: {
            estado: { in: ['pendiente', 'preparando', 'listo', 'entregado'] },
          },
          include: { 
            items: { include: { producto: true } },
            historial: true,
          },
          orderBy: { creadoEn: 'desc' },
          take: 1,
        },
      },
    });
    return NextResponse.json(mesas || []);
  } catch (error) {
    console.error('Error fetching mesas:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Error al obtener mesas' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, estado } = body;
    const mesa = await prisma.mesa.update({
      where: { id },
      data: { estado },
    });
    return NextResponse.json(mesa);
  } catch (error) {
    console.error('Error updating mesa:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Error al actualizar mesa' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { numero, capacidad, sector, forma, posX, posY } = body;
    
    // Check if number is in use
    const exists = await prisma.mesa.findUnique({ where: { numero } });
    if (exists) {
      if (!exists.activa) {
        // reactivate
        const mesa = await prisma.mesa.update({
          where: { numero },
          data: { activa: true, capacidad, sector, forma, posX, posY }
        });
        return NextResponse.json(mesa);
      }
      return NextResponse.json({ success: false, error: 'El número de mesa ya está en uso' }, { status: 400 });
    }

    const mesa = await prisma.mesa.create({
      data: {
        numero,
        capacidad,
        sector,
        forma,
        posX,
        posY,
        activa: true,
      },
    });
    return NextResponse.json(mesa);
  } catch (error) {
    console.error('Error creating mesa:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Error al crear mesa' }, { status: 500 });
  }
}
