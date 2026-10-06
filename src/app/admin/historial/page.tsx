'use client';

import { useState, useMemo } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAhora } from '@/hooks/useAhora';
import { Search, Clock, CheckCheck, TrendingUp, Filter } from 'lucide-react';
import { formatDate } from '@/lib/formatDate';

interface Pedido {
  id: number;
  estado: string;
  total: number;
  creadoEn: string;
  entregadoEn: string | null;
  actualizadoEn: string;
  mesa: { numero: number };
  items: Array<{
    id: number;
    cantidad: number;
    producto: { nombre: string };
  }>;
}

export default function AdminHistorialPage() {
  const [busqueda, setBusqueda] = useState('');
  const [dias, setDias] = useState('1'); // Por defecto, hoy
  const { data } = useApi<Pedido[]>(`/api/pedidos/history?days=${dias}`, []);
  const pedidos = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  // Duración de pedidos aún sin entregar: se mide contra una hora que avanza sola
  const ahora = useAhora();

  const pedidosFiltrados = useMemo(() => {
    return pedidos.filter((pedido) => {
      if (!busqueda) return true;
      return (
        pedido.mesa.numero.toString().includes(busqueda) ||
        pedido.id.toString().includes(busqueda)
      );
    });
  }, [pedidos, busqueda]);

  const stats = useMemo(() => {
    if (pedidosFiltrados.length === 0) return { promedioMins: 0, total: 0 };
    
    let sumMins = 0;
    let countValidos = 0;
    let sumTotal = 0;

    pedidosFiltrados.forEach(p => {
      sumTotal += p.total;
      if (p.entregadoEn) {
        const start = new Date(p.creadoEn).getTime();
        const end = new Date(p.entregadoEn).getTime();
        sumMins += (end - start) / 60000;
        countValidos++;
      }
    });

    return {
      promedioMins: countValidos > 0 ? Math.round(sumMins / countValidos) : 0,
      total: sumTotal
    };
  }, [pedidosFiltrados]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">Historial de Comandas</h1>
          <p className="text-[var(--muted)]">Consulta los pedidos despachados y audita los tiempos de cocina.</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-5 border border-[var(--border)] bg-gradient-to-br from-[var(--card)] to-[var(--background)]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <CheckCheck className="w-5 h-5 text-green-500" />
            </div>
            <h3 className="font-bold text-[var(--muted)]">Comandas Despachadas</h3>
          </div>
          <p className="text-3xl font-black">{pedidosFiltrados.length}</p>
        </div>
        
        <div className="card p-5 border border-[var(--border)] bg-gradient-to-br from-[var(--card)] to-[var(--background)]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-purple-500" />
            </div>
            <h3 className="font-bold text-[var(--muted)]">Tiempo Promedio</h3>
          </div>
          <p className="text-3xl font-black">{stats.promedioMins} min</p>
        </div>

        <div className="card p-5 border border-[var(--border)] bg-gradient-to-br from-[var(--card)] to-[var(--background)]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-blue-500" />
            </div>
            <h3 className="font-bold text-[var(--muted)]">Facturación Total</h3>
          </div>
          <p className="text-3xl font-black">${stats.total.toLocaleString()}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 bg-[var(--card)] p-4 rounded-xl border border-[var(--border)]">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
          <input
            type="text"
            placeholder="Buscar por número de mesa o ID de pedido..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="input w-full pl-9 bg-[var(--background)] border border-[var(--border)]"
          />
        </div>
        <div className="relative w-full sm:w-48">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
          <select 
            value={dias}
            onChange={(e) => setDias(e.target.value)}
            className="input w-full pl-9 bg-[var(--background)] border border-[var(--border)] appearance-none"
          >
            <option value="1">Hoy</option>
            <option value="7">Últimos 7 días</option>
            <option value="30">Último mes</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden border border-[var(--border)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--background)]">
                <th className="p-4 font-bold text-[var(--muted)]">ID</th>
                <th className="p-4 font-bold text-[var(--muted)]">Mesa</th>
                <th className="p-4 font-bold text-[var(--muted)]">Ingreso / Despacho</th>
                <th className="p-4 font-bold text-[var(--muted)]">Tiempo</th>
                <th className="p-4 font-bold text-[var(--muted)]">Estado</th>
                <th className="p-4 font-bold text-[var(--muted)] text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {pedidosFiltrados.map((pedido) => {
                const end = pedido.entregadoEn ? new Date(pedido.entregadoEn).getTime() : ahora;
                const start = new Date(pedido.creadoEn).getTime();
                const durationMins = Math.floor((end - start) / 60000);
                const isFast = durationMins <= 15;

                return (
                  <tr key={pedido.id} className="hover:bg-[var(--card-hover)] transition-colors">
                    <td className="p-4 font-black">#{pedido.id}</td>
                    <td className="p-4">
                      <span className="bg-neutral-800 text-white px-3 py-1 rounded-md font-bold text-sm">
                        {/* Una mesa eliminada con historial queda archivada con número negativo */}
                        {pedido.mesa.numero < 0 ? 'Mesa eliminada' : `Mesa ${pedido.mesa.numero}`}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-[var(--muted)]">
                      <div><span className="font-bold">In:</span> {formatDate(pedido.creadoEn)}</div>
                      <div><span className="font-bold">Out:</span> {pedido.estado === 'cancelado' ? `Cancelado ${formatDate(pedido.actualizadoEn)}` : (pedido.entregadoEn ? formatDate(pedido.entregadoEn) : '...')}</div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${isFast ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {durationMins} min
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`badge px-2 py-1 text-[10px] font-black uppercase ${pedido.estado === 'pagado' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}`}>
                        {pedido.estado}
                      </span>
                    </td>
                    <td className="p-4 text-right font-black">${pedido.total.toLocaleString()}</td>
                  </tr>
                )
              })}
              {pedidosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-[var(--muted)]">
                    <CheckCheck className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="text-lg font-bold">No se encontraron comandas despachadas</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
