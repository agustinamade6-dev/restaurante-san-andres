import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { enPesos } from '@/lib/money';
import { enteroDeQuery } from '@/lib/validacion';

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    const mesaNumero = enteroDeQuery(request, 'mesaNumero', 1, 9999);
    if (mesaNumero === null) {
      return NextResponse.json({ error: 'mesaNumero inválido' }, { status: 400 });
    }
    const days = enteroDeQuery(request, 'days', 1, 366); // e.g. 7 para los últimos 7 días
    if (days === null) {
      return NextResponse.json({ error: 'El parámetro days debe ser un entero entre 1 y 366' }, { status: 400 });
    }
    const where: Prisma.PedidoWhereInput = {
      estado: { in: ['entregado', 'pagado', 'cancelado'] },
    };
    if (mesaNumero) {
      where.mesa = { numero: mesaNumero };
    }
    if (days) {
      const dateLimit = new Date();
      dateLimit.setDate(dateLimit.getDate() - days);
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

    return NextResponse.json(enPesos(pedidos));
  } catch (error) {
    console.error('Error fetching pedidos history:', error);
    return NextResponse.json({ error: 'Error al obtener historial de pedidos' }, { status: 500 });
  }
}
