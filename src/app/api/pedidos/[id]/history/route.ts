import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

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
