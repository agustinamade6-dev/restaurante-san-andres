import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const pedidoId = parseInt(id, 10);

    const historial = await prisma.historialPedido.findMany({
      where: { pedidoId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(historial);
  } catch (error) {
    console.error('Error fetching pedido history:', error);
    return NextResponse.json({ error: 'Error al obtener historial' }, { status: 500 });
  }
}
