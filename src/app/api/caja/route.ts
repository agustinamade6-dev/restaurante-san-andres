import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { marcarAnuladas, resumirVentas } from '@/lib/ventas';

export async function GET(request: Request) {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

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

    // Resumen neto: las anulaciones (asientos con importe negativo) restan de los totales y de la cantidad.
    const { totalRecaudado, totalPropinas, cantidadVentas, porMetodo } = resumirVentas(ventas);

    return NextResponse.json({
      ventas: marcarAnuladas(ventas),
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
