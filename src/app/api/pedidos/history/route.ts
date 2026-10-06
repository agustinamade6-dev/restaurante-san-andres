import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mesaNumero = searchParams.get('mesaNumero');
    const days = searchParams.get('days'); // e.g. "7" for last 7 days

    const where: any = {
      estado: { in: ['entregado', 'pagado', 'cancelado'] },
    };

    if (mesaNumero) {
      where.mesa = { numero: parseInt(mesaNumero, 10) };
    }

    if (days) {
      const dateLimit = new Date();
      dateLimit.setDate(dateLimit.getDate() - parseInt(days, 10));
      where.actualizadoEn = { gte: dateLimit };
    }

    const pedidos = await prisma.pedido.findMany({
      where,
      include: {
        mesa: true,
        items: { include: { producto: true } },
        historial: true,
      },
      orderBy: { actualizadoEn: 'desc' },
    });

    return NextResponse.json(pedidos);
  } catch (error) {
    console.error('Error fetching pedidos history:', error);
    return NextResponse.json({ error: 'Error al obtener historial de pedidos' }, { status: 500 });
  }
}
