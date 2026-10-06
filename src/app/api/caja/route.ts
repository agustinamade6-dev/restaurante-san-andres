import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const daysStr = searchParams.get('days') || '1';
    const days = parseInt(daysStr);
    
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const ventas = await prisma.venta.findMany({
      where: { fechaCobro: { gte: since } },
      include: {
        pedido: {
          include: {
            items: { include: { producto: true } },
            mesa: true,
          },
        },
        mesa: true,
        cajero: { select: { id: true, nombre: true } },
      },
      orderBy: { fechaCobro: 'desc' },
    });

    // Summary calculations
    const totalRecaudado = ventas.reduce((sum, v) => sum + v.total, 0);
    const totalPropinas = ventas.reduce((sum, v) => sum + v.propina, 0);
    const cantidadVentas = ventas.length;

    const porMetodo: Record<string, { count: number; total: number }> = {};
    ventas.forEach(v => {
      if (!porMetodo[v.metodoPago]) porMetodo[v.metodoPago] = { count: 0, total: 0 };
      porMetodo[v.metodoPago].count++;
      porMetodo[v.metodoPago].total += v.total;
    });

    return NextResponse.json({
      ventas,
      resumen: {
        totalRecaudado,
        totalPropinas,
        cantidadVentas,
        porMetodo,
        periodo: days === 1 ? 'Hoy' : `Últimos ${days} días`,
      },
    });
  } catch (error) {
    console.error('Error fetching caja:', error);
    return NextResponse.json({ error: 'Error al obtener datos de caja' }, { status: 500 });
  }
}
