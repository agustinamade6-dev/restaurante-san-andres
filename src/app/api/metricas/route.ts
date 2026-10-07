import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { aPesos } from '@/lib/money';
import { montoMensualCentavos } from '@/lib/costos';
import { contarVentasNetas } from '@/lib/ventas';

/**
 * Ingreso por ventas = total cobrado MENOS la propina: la propina es del personal, no del negocio. Contarla como
 * ingreso inflaba las ventas y el balance del mes. Las propinas se informan aparte.
 */
const ingreso = (v: { total: number; propina: number }) => (v.total || 0) - (v.propina || 0);
const sumarIngresos = (ventas: { total: number; propina: number }[]) => ventas.reduce((s, v) => s + ingreso(v), 0);

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Una sola consulta: desde el inicio más antiguo que necesita algún bloque (mes, semana, 7 días o 4 semanas);
    // hoy, semana, mes y cada día/semana se obtienen filtrando en memoria.
    const inicioSemanas = new Date(todayStart);
    inicioSemanas.setDate(inicioSemanas.getDate() - inicioSemanas.getDay() - 3 * 7);
    const inicioDias = new Date(todayStart);
    inicioDias.setDate(inicioDias.getDate() - 6);
    const desde = new Date(Math.min(monthStart.getTime(), weekStart.getTime(), inicioSemanas.getTime(), inicioDias.getTime()));
    const ventas = await prisma.venta.findMany({ where: { fechaCobro: { gte: desde } } });
    const entre = (ini: Date, fin?: Date) =>
      ventas.filter((v) => v.fechaCobro >= ini && (!fin || v.fechaCobro < fin));

    const ventasHoy = entre(todayStart);
    const totalHoy = sumarIngresos(ventasHoy);
    const ventasSemana = entre(weekStart);
    const totalSemana = sumarIngresos(ventasSemana);
    const ventasMes = entre(monthStart);
    const totalMes = sumarIngresos(ventasMes);
    const propinasMes = ventasMes.reduce((s, v) => s + (v.propina || 0), 0);

    // Costos llevados a su equivalente mensual según la periodicidad (diario, semanal o mensual).
    const costos = await prisma.costoFijo.findMany();
    const totalCostosMensuales = costos.reduce((sum, c) => sum + montoMensualCentavos(c.monto, c.periodicidad), 0);

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
      .slice(0, 5)
      .map((p) => ({ ...p, ingresos: aPesos(p.ingresos) }));

    // Ventas por día (últimos 7 días)
    const ventasPorDia = [];
    for (let i = 6; i >= 0; i--) {
      const dia = new Date(todayStart);
      dia.setDate(dia.getDate() - i);
      const finDia = new Date(dia);
      finDia.setDate(finDia.getDate() + 1);
      const ventasDia = entre(dia, finDia);
      ventasPorDia.push({
        dia: dia.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' }),
        total: aPesos(sumarIngresos(ventasDia)),
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
      const ventasS = entre(inicioSemana, finSemana);
      ventasPorSemana.push({
        semana: `Sem ${4 - i}`,
        total: aPesos(sumarIngresos(ventasS)),
        cantidad: contarVentasNetas(ventasS),
      });
    }

    // Insumos con bajo stock (SQLite no compara dos columnas en un filtro de Prisma: se filtra en memoria).
    const todosInsumos = await prisma.insumo.findMany();
    const alertasStock = todosInsumos.filter((i) => i.stockActual <= i.stockMinimo);

    // Pedidos activos
    const pedidosActivos = await prisma.pedido.count({
      where: { estado: { in: ['pendiente', 'preparando'] } },
    });

    return NextResponse.json({
      // Los totales se suman en centavos (exacto) y se responden en pesos.
      ventasHoy: { total: aPesos(totalHoy), cantidad: contarVentasNetas(ventasHoy) },
      ventasSemana: { total: aPesos(totalSemana), cantidad: contarVentasNetas(ventasSemana) },
      ventasMes: { total: aPesos(totalMes), cantidad: contarVentasNetas(ventasMes) },
      propinasMes: aPesos(propinasMes),
      costosMensuales: aPesos(totalCostosMensuales),
      balanceMes: aPesos(totalMes - totalCostosMensuales),
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
