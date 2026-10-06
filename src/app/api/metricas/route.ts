import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { contarVentasNetas } from '@/lib/ventas';

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Ventas del día
    const ventasHoy = await prisma.venta.findMany({
      where: { fechaCobro: { gte: todayStart } },
    });
    const totalHoy = ventasHoy.reduce((sum, v) => sum + (v.total || 0), 0);

    // Ventas de la semana
    const ventasSemana = await prisma.venta.findMany({
      where: { fechaCobro: { gte: weekStart } },
    });
    const totalSemana = ventasSemana.reduce((sum, v) => sum + (v.total || 0), 0);

    // Ventas del mes
    const ventasMes = await prisma.venta.findMany({
      where: { fechaCobro: { gte: monthStart } },
    });
    const totalMes = ventasMes.reduce((sum, v) => sum + (v.total || 0), 0);

    // Costos fijos mensuales
    const costos = await prisma.costoFijo.findMany();
    const totalCostosMensuales = costos.reduce((sum, c) => sum + c.monto, 0);

    // Platos más vendidos (últimos 30 días)
    const thirtyDaysAgo = new Date(todayStart);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const itemsVendidos = await prisma.itemPedido.findMany({
      where: {
        pedido: {
          estado: { in: ['entregado', 'pagado'] },
          creadoEn: { gte: thirtyDaysAgo },
        },
      },
      include: { producto: true },
    });

    const platosContador: Record<string, { nombre: string; cantidad: number; ingresos: number }> = {};
    itemsVendidos.forEach((item) => {
      const key = item.producto.nombre;
      if (!platosContador[key]) {
        platosContador[key] = { nombre: key, cantidad: 0, ingresos: 0 };
      }
      platosContador[key].cantidad += item.cantidad;
      platosContador[key].ingresos += item.precio * item.cantidad;
    });
    const platosMasVendidos = Object.values(platosContador)
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5);

    // Ventas por día (últimos 7 días)
    const ventasPorDia = [];
    for (let i = 6; i >= 0; i--) {
      const dia = new Date(todayStart);
      dia.setDate(dia.getDate() - i);
      const finDia = new Date(dia);
      finDia.setDate(finDia.getDate() + 1);
      const ventasDia = await prisma.venta.findMany({
        where: { fechaCobro: { gte: dia, lt: finDia } },
      });
      ventasPorDia.push({
        dia: dia.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' }),
        total: ventasDia.reduce((sum, v) => sum + (v.total || 0), 0),
        cantidad: contarVentasNetas(ventasDia),
      });
    }

    // Ventas por semana (últimas 4 semanas)
    const ventasPorSemana = [];
    for (let i = 3; i >= 0; i--) {
      const inicioSemana = new Date(todayStart);
      inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay() - i * 7);
      const finSemana = new Date(inicioSemana);
      finSemana.setDate(finSemana.getDate() + 7);
      const ventasS = await prisma.venta.findMany({
        where: { fechaCobro: { gte: inicioSemana, lt: finSemana } },
      });
      ventasPorSemana.push({
        semana: `Sem ${4 - i}`,
        total: ventasS.reduce((sum, v) => sum + (v.total || 0), 0),
        cantidad: contarVentasNetas(ventasS),
      });
    }

    // Insumos con bajo stock
    const insumoBajoStock = await prisma.insumo.findMany({
      where: {
        stockActual: { lte: prisma.insumo.fields.stockMinimo } as unknown as number,
      },
    });
    // Fallback: fetch all and filter in JS
    const todosInsumos = await prisma.insumo.findMany();
    const alertasStock = todosInsumos.filter((i) => i.stockActual <= i.stockMinimo);

    // Pedidos activos
    const pedidosActivos = await prisma.pedido.count({
      where: { estado: { in: ['pendiente', 'preparando'] } },
    });

    return NextResponse.json({
      ventasHoy: { total: totalHoy, cantidad: contarVentasNetas(ventasHoy) },
      ventasSemana: { total: totalSemana, cantidad: contarVentasNetas(ventasSemana) },
      ventasMes: { total: totalMes, cantidad: contarVentasNetas(ventasMes) },
      costosMensuales: totalCostosMensuales,
      balanceMes: totalMes - totalCostosMensuales,
      platosMasVendidos,
      ventasPorDia,
      ventasPorSemana,
      alertasStock: alertasStock.length,
      pedidosActivos,
    });
  } catch (error) {
    console.error('Error fetching metricas:', error);
    return NextResponse.json({ error: 'Error al obtener métricas' }, { status: 500 });
  }
}
