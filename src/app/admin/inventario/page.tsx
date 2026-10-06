'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Package,
  AlertTriangle,
  CheckCircle2,
  Search,
} from 'lucide-react';
import { formatDate } from '@/lib/formatDate';

interface Insumo {
  id: number;
  nombre: string;
  unidad: string;
  stockActual: number;
  stockMinimo: number;
  precioUnitario: number;
  proveedorId: number | null;
  proveedor: { id: number; nombre: string } | null;
  updatedAt: string;
}

export default function InventarioPage() {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'bajo' | 'ok'>('todos');
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [stockEdit, setStockEdit] = useState<number>(0);

  const fetchInsumos = useCallback(async () => {
    const res = await fetch('/api/inventario');
    setInsumos(await res.json());
  }, []);

  useEffect(() => {
    fetchInsumos();
  }, [fetchInsumos]);

  const actualizarStock = async (insumo: Insumo) => {
    await fetch('/api/inventario', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...insumo, stockActual: stockEdit }),
    });
    setEditandoId(null);
    fetchInsumos();
  };

  const filtrados = insumos.filter((i) => {
    if (busqueda && !i.nombre.toLowerCase().includes(busqueda.toLowerCase()))
      return false;
    if (filtro === 'bajo' && i.stockActual > i.stockMinimo) return false;
    if (filtro === 'ok' && i.stockActual <= i.stockMinimo) return false;
    return true;
  });

  const bajoStock = insumos.filter((i) => i.stockActual <= i.stockMinimo);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Inventario & Stock</h1>
          <p className="text-[var(--muted)] text-sm mt-1">
            {insumos.length} insumos registrados
          </p>
        </div>
      </div>

      {/* Alert */}
      {bajoStock.length > 0 && (
        <div className="glass-card p-4 mb-6 flex items-center gap-4 border-amber-500/30 animate-pulse-glow">
          <AlertTriangle className="w-6 h-6 text-[var(--warning)] shrink-0" />
          <div>
            <p className="font-semibold text-sm">
              ⚠️ {bajoStock.length} insumo(s) por debajo del stock mínimo
            </p>
            <p className="text-xs text-[var(--muted)]">
              {bajoStock.map((i) => i.nombre).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
          <input
            type="text"
            placeholder="Buscar insumo..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="input pl-10"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setFiltro('todos')}
            className={`btn btn-sm ${filtro === 'todos' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Todos
          </button>
          <button
            onClick={() => setFiltro('bajo')}
            className={`btn btn-sm ${filtro === 'bajo' ? 'btn-danger' : 'btn-secondary'}`}
          >
            <AlertTriangle className="w-3 h-3" />
            Bajo Stock
          </button>
          <button
            onClick={() => setFiltro('ok')}
            className={`btn btn-sm ${filtro === 'ok' ? 'btn-success' : 'btn-secondary'}`}
          >
            <CheckCircle2 className="w-3 h-3" />
            OK
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left p-4 text-sm font-semibold text-[var(--muted)]">
                Insumo
              </th>
              <th className="text-center p-4 text-sm font-semibold text-[var(--muted)]">
                Stock Actual
              </th>
              <th className="text-center p-4 text-sm font-semibold text-[var(--muted)]">
                Stock Mínimo
              </th>
              <th className="text-center p-4 text-sm font-semibold text-[var(--muted)]">
                Estado
              </th>
              <th className="text-right p-4 text-sm font-semibold text-[var(--muted)]">
                Precio Unit.
              </th>
              <th className="text-left p-4 text-sm font-semibold text-[var(--muted)]">
                Proveedor
              </th>
              <th className="text-left p-4 text-sm font-semibold text-[var(--muted)]">
                Fecha y Hora
              </th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((insumo) => {
              const esBajo = insumo.stockActual <= insumo.stockMinimo;
              const porcentaje = Math.min(
                (insumo.stockActual / insumo.stockMinimo) * 100,
                100
              );
              return (
                <tr
                  key={insumo.id}
                  className={`border-b border-[var(--border)] hover:bg-[var(--card-hover)] transition-colors ${
                    esBajo ? 'bg-red-500/5' : ''
                  }`}
                >
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-[var(--background)] flex items-center justify-center">
                        <Package className="w-4 h-4 text-[var(--muted)]" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">
                          {insumo.nombre}
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          {insumo.unidad}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    {editandoId === insumo.id ? (
                      <div className="flex items-center justify-center gap-2">
                        <input
                          type="number"
                          value={stockEdit}
                          onChange={(e) =>
                            setStockEdit(parseFloat(e.target.value) || 0)
                          }
                          className="input w-20 text-center py-1"
                          autoFocus
                        />
                        <button
                          onClick={() => actualizarStock(insumo)}
                          className="btn btn-sm btn-success"
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => setEditandoId(null)}
                          className="btn btn-sm btn-secondary"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditandoId(insumo.id);
                          setStockEdit(insumo.stockActual);
                        }}
                        className={`font-bold text-sm cursor-pointer hover:underline ${
                          esBajo
                            ? 'text-[var(--danger)]'
                            : 'text-[var(--foreground)]'
                        }`}
                      >
                        {insumo.stockActual} {insumo.unidad}
                      </button>
                    )}
                  </td>
                  <td className="p-4 text-center text-sm text-[var(--muted)]">
                    {insumo.stockMinimo} {insumo.unidad}
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-24 h-2 rounded-full bg-[var(--background)] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            esBajo ? 'bg-[var(--danger)]' : 'bg-[var(--success)]'
                          }`}
                          style={{ width: `${porcentaje}%` }}
                        />
                      </div>
                      <span
                        className={`text-xs font-medium ${
                          esBajo
                            ? 'text-[var(--danger)]'
                            : 'text-[var(--success)]'
                        }`}
                      >
                        {esBajo ? 'Bajo' : 'OK'}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 text-right text-sm font-semibold">
                    ${insumo.precioUnitario.toLocaleString()}
                  </td>
                  <td className="p-4 text-sm text-[var(--muted)]">
                    {insumo.proveedor?.nombre || '—'}
                  </td>
                  <td className="p-4 text-sm text-[var(--muted)]">
                    {insumo.updatedAt ? (
                      <div className="flex flex-col">
                        <span>{formatDate(insumo.updatedAt)}</span>
                        <span className="text-[10px] uppercase">Por: Admin</span>
                      </div>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
