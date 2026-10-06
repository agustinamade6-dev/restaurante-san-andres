'use client';

import { useState, useEffect } from 'react';
import {
  DollarSign,
  TrendingUp,
  ShoppingBag,
  AlertTriangle,
  ChefHat,
  BarChart3,
  Trophy,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';

interface Metricas {
  ventasHoy: { total: number; cantidad: number };
  ventasSemana: { total: number; cantidad: number };
  ventasMes: { total: number; cantidad: number };
  costosMensuales: number;
  balanceMes: number;
  platosMasVendidos: Array<{
    nombre: string;
    cantidad: number;
    ingresos: number;
  }>;
  ventasPorDia: Array<{ dia: string; total: number; cantidad: number }>;
  ventasPorSemana: Array<{
    semana: string;
    total: number;
    cantidad: number;
  }>;
  alertasStock: number;
  pedidosActivos: number;
}

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [metricas, setMetricas] = useState<Metricas>({
    ventasHoy: { total: 0, cantidad: 0 },
    ventasSemana: { total: 0, cantidad: 0 },
    ventasMes: { total: 0, cantidad: 0 },
    costosMensuales: 0,
    balanceMes: 0,
    platosMasVendidos: [],
    ventasPorDia: [],
    ventasPorSemana: [],
    alertasStock: 0,
    pedidosActivos: 0,
  });

  useEffect(() => {
    fetch('/api/metricas')
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) {
          setMetricas({
            ventasHoy: data.ventasHoy || { total: 0, cantidad: 0 },
            ventasSemana: data.ventasSemana || { total: 0, cantidad: 0 },
            ventasMes: data.ventasMes || { total: 0, cantidad: 0 },
            costosMensuales: data.costosMensuales || 0,
            balanceMes: data.balanceMes || 0,
            platosMasVendidos: data.platosMasVendidos || [],
            ventasPorDia: data.ventasPorDia || [],
            ventasPorSemana: data.ventasPorSemana || [],
            alertasStock: data.alertasStock || 0,
            pedidosActivos: data.pedidosActivos || 0,
          });
        }
      })
      .catch((err) => console.error('[API /api/metricas] Error fetching metrics:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
          <div className="text-[var(--muted)] font-semibold animate-pulse">Cargando métricas...</div>
        </div>
      </div>
    );
  }

  const formatMoney = (n: number) =>
    `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-[var(--muted)] text-sm mt-1">
          Resumen de rendimiento — Restaurante San Andrés
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="metric-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-[var(--muted)] mb-1">Ventas Hoy</p>
              <p className="text-2xl font-bold text-[var(--success)]">
                {formatMoney(metricas?.ventasHoy?.total ?? 0)}
              </p>
              <p className="text-xs text-[var(--muted)] mt-1">
                {metricas?.ventasHoy?.cantidad ?? 0} pedidos
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-[var(--success-bg)] flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-[var(--success)]" />
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-[var(--muted)] mb-1">Ventas Semana</p>
              <p className="text-2xl font-bold text-[var(--info)]">
                {formatMoney(metricas?.ventasSemana?.total ?? 0)}
              </p>
              <p className="text-xs text-[var(--muted)] mt-1">
                {metricas?.ventasSemana?.cantidad ?? 0} pedidos
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-[var(--info-bg)] flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-[var(--info)]" />
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-[var(--muted)] mb-1">Ventas Mes</p>
              <p className="text-2xl font-bold text-[var(--purple)]">
                {formatMoney(metricas?.ventasMes?.total ?? 0)}
              </p>
              <p className="text-xs text-[var(--muted)] mt-1">
                {metricas?.ventasMes?.cantidad ?? 0} pedidos
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-[var(--purple-bg)] flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-[var(--purple)]" />
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-[var(--muted)] mb-1">Balance Mes</p>
              <p
                className={`text-2xl font-bold ${
                  (metricas?.balanceMes ?? 0) >= 0
                    ? 'text-[var(--success)]'
                    : 'text-[var(--danger)]'
                }`}
              >
                {formatMoney(metricas?.balanceMes ?? 0)}
              </p>
              <p className="text-xs text-[var(--muted)] mt-1">
                Costos: {formatMoney(metricas?.costosMensuales ?? 0)}
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-amber-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Quick alerts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {metricas.alertasStock > 0 && (
          <div className="glass-card p-4 flex items-center gap-4 border-amber-500/30">
            <div className="w-10 h-10 rounded-xl bg-[var(--warning-bg)] flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-[var(--warning)]" />
            </div>
            <div>
              <p className="font-semibold text-sm">Alertas de Stock</p>
              <p className="text-xs text-[var(--muted)]">
                {metricas?.alertasStock ?? 0} insumos por debajo del mínimo
              </p>
            </div>
          </div>
        )}
        <div className="glass-card p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[var(--info-bg)] flex items-center justify-center shrink-0">
            <ChefHat className="w-5 h-5 text-[var(--info)]" />
          </div>
          <div>
            <p className="font-semibold text-sm">Pedidos Activos</p>
            <p className="text-xs text-[var(--muted)]">
              {metricas?.pedidosActivos ?? 0} pedidos en cocina ahora
            </p>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Ventas por día */}
        <div className="glass-card p-6">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[var(--info)]" />
            Ventas Últimos 7 Días
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metricas?.ventasPorDia ?? []}>
                <defs>
                  <linearGradient
                    id="colorVentas"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="#3b82f6"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="#3b82f6"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                />
                <XAxis
                  dataKey="dia"
                  tick={{ fontSize: 12, fill: 'var(--muted)' }}
                  axisLine={{ stroke: 'var(--border)' }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: 'var(--muted)' }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    fontSize: '13px',
                  }}
                  formatter={(value: number) => [formatMoney(value), 'Total']}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#3b82f6"
                  fillOpacity={1}
                  fill="url(#colorVentas)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Ventas por semana */}
        <div className="glass-card p-6">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[var(--purple)]" />
            Rendimiento Semanal
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metricas?.ventasPorSemana ?? []}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                />
                <XAxis
                  dataKey="semana"
                  tick={{ fontSize: 12, fill: 'var(--muted)' }}
                  axisLine={{ stroke: 'var(--border)' }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: 'var(--muted)' }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    fontSize: '13px',
                  }}
                  formatter={(value: number) => [formatMoney(value), 'Total']}
                />
                <Bar
                  dataKey="total"
                  fill="#a855f7"
                  radius={[6, 6, 0, 0]}
                  barSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top dishes */}
      <div className="glass-card p-6">
        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-400" />
          Platos Más Vendidos (Último Mes)
        </h3>
        {(metricas?.platosMasVendidos?.length ?? 0) > 0 ? (
          <div className="space-y-3">
            {(metricas?.platosMasVendidos ?? []).map((plato, i) => (
              <div
                key={plato.nombre}
                className="flex items-center gap-4 p-3 rounded-xl bg-[var(--background)] hover:bg-[var(--card-hover)] transition-colors"
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                    i === 0
                      ? 'bg-amber-500/20 text-amber-400'
                      : i === 1
                      ? 'bg-gray-400/20 text-gray-400'
                      : i === 2
                      ? 'bg-orange-600/20 text-orange-400'
                      : 'bg-[var(--card)] text-[var(--muted)]'
                  }`}
                >
                  #{i + 1}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{plato.nombre}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {plato.cantidad} vendidos
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm text-[var(--success)]">
                    {formatMoney(plato.ingresos)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[var(--muted)] text-sm text-center py-8">
            No hay datos de ventas suficientes aún
          </p>
        )}
      </div>
    </div>
  );
}
