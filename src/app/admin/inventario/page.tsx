'use client';

import { useState } from 'react';
import { useApi } from '@/hooks/useApi';
import {
  Package,
  AlertTriangle,
  CheckCircle2,
  Search,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { formatDate } from '@/lib/formatDate';
import AvisoError from '@/components/AvisoError';
import ErrorDeCarga from '@/components/ErrorDeCarga';
import { enviar, enviarJson } from '@/lib/api-cliente';
import { useEnvio } from '@/hooks/useEnvio';
import { formatPesos } from '@/utils/dinero';
import { useDialogo } from '@/hooks/useDialogo';

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

const UNIDADES = ['kg', 'litro', 'unidad', 'paquete'];
const insumoVacio = { nombre: '', unidad: 'kg', stockActual: '', stockMinimo: '', precioUnitario: '', proveedorId: '' };

export default function InventarioPage() {
  const [busqueda, setBusqueda] = useState('');
  const { ejecutar, enviando } = useEnvio();
  const [filtro, setFiltro] = useState<'todos' | 'bajo' | 'ok'>('todos');
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [stockEdit, setStockEdit] = useState<number>(0);
  const [nuevo, setNuevo] = useState<typeof insumoVacio | null>(null);
  const dlgInsumo = useDialogo('Nuevo insumo', () => setNuevo(null));
  const [proveedores, setProveedores] = useState<{ id: number; nombre: string }[]>([]);
  const [errorNuevo, setErrorNuevo] = useState('');
  const [errorTabla, setErrorTabla] = useState('');

  const { data: insumos, error: errorCarga, recargar: fetchInsumos } = useApi<Insumo[]>('/api/inventario', []);

  const actualizarStock = async (insumo: Insumo) => {
    setErrorTabla('');
    const error = await enviarJson('/api/inventario', 'PUT', { ...insumo, stockActual: stockEdit }, 'No se pudo actualizar el stock');
    if (error) return setErrorTabla(error);
    setEditandoId(null);
    fetchInsumos();
  };

  const eliminarInsumo = async (insumo: Insumo) => {
    if (!confirm(`¿Eliminar el insumo "${insumo.nombre}"?`)) return;
    setErrorTabla('');
    const error = await enviar(`/api/inventario?id=${insumo.id}`, { method: 'DELETE' }, 'No se pudo eliminar el insumo');
    if (error) return setErrorTabla(error);
    fetchInsumos();
  };

  const abrirNuevo = async () => {
    setErrorNuevo('');
    setNuevo({ ...insumoVacio });
    // Si no cargan, el insumo se puede crear igual "Sin proveedor".
    const res = await fetch('/api/proveedores').catch(() => null);
    if (res?.ok) setProveedores(await res.json().catch(() => []));
  };

  const crearInsumo = () => ejecutar(async () => {
    if (!nuevo) return;
    setErrorNuevo('');
    const numero = (v: string) => (v.trim() === '' ? 0 : Number(v.replace(',', '.')));
    const error = await enviarJson(
      '/api/inventario',
      'POST',
      {
        nombre: nuevo.nombre,
        unidad: nuevo.unidad,
        stockActual: numero(nuevo.stockActual),
        stockMinimo: numero(nuevo.stockMinimo),
        precioUnitario: numero(nuevo.precioUnitario),
        proveedorId: nuevo.proveedorId ? Number(nuevo.proveedorId) : null,
      },
      'No se pudo crear el insumo'
    );
    if (error) return setErrorNuevo(error);
    setNuevo(null);
    fetchInsumos();
  });

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
        <button onClick={abrirNuevo} className="btn btn-primary">
          <Plus className="w-4 h-4" />
          Nuevo insumo
        </button>
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

      <ErrorDeCarga error={errorCarga} que="los insumos" onReintentar={fetchInsumos} />
      <AvisoError mensaje={errorTabla} onCerrar={() => setErrorTabla('')} />

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
              <th className="p-4" />
            </tr>
          </thead>
          <tbody>
            {filtrados.map((insumo) => {
              const esBajo = insumo.stockActual <= insumo.stockMinimo;
              // Con stock mínimo 0 la barra va llena; un stock negativo (ventas sin stock cargado) la deja vacía.
              const porcentaje =
                insumo.stockMinimo > 0
                  ? Math.max(0, Math.min((insumo.stockActual / insumo.stockMinimo) * 100, 100))
                  : 100;
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
                    {formatPesos(insumo.precioUnitario)}
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
                  <td className="p-4 text-right">
                    <button
                      onClick={() => eliminarInsumo(insumo)}
                      className="btn btn-sm btn-secondary text-[var(--danger)]"
                      title="Eliminar insumo"
                      aria-label={`Eliminar ${insumo.nombre}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {nuevo && (
        <div {...dlgInsumo} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card w-full max-w-md p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Package className="w-5 h-5 text-amber-400" />
                Nuevo insumo
              </h2>
              <button
                onClick={() => setNuevo(null)}
                className="w-8 h-8 rounded-lg bg-[var(--background)] flex items-center justify-center hover:bg-[var(--card-hover)] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-[var(--muted)] mb-1 block">Nombre</label>
                <input
                  type="text"
                  value={nuevo.nombre}
                  onChange={(e) => setNuevo((n) => n && { ...n, nombre: e.target.value })}
                  className="input"
                  placeholder="Ej.: Carne picada"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-[var(--muted)] mb-1 block">Unidad</label>
                  <select
                    value={nuevo.unidad}
                    onChange={(e) => setNuevo((n) => n && { ...n, unidad: e.target.value })}
                    className="input"
                  >
                    {UNIDADES.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-[var(--muted)] mb-1 block">Precio por {nuevo.unidad} ($)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={nuevo.precioUnitario}
                    onChange={(e) => setNuevo((n) => n && { ...n, precioUnitario: e.target.value })}
                    className="input"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-sm text-[var(--muted)] mb-1 block">Stock actual</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={nuevo.stockActual}
                    onChange={(e) => setNuevo((n) => n && { ...n, stockActual: e.target.value })}
                    className="input"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-sm text-[var(--muted)] mb-1 block">Stock mínimo</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={nuevo.stockMinimo}
                    onChange={(e) => setNuevo((n) => n && { ...n, stockMinimo: e.target.value })}
                    className="input"
                    placeholder="0"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm text-[var(--muted)] mb-1 block">Proveedor (opcional)</label>
                <select
                  value={nuevo.proveedorId}
                  onChange={(e) => setNuevo((n) => n && { ...n, proveedorId: e.target.value })}
                  className="input"
                >
                  <option value="">Sin proveedor</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {errorNuevo && <p className="text-sm text-[var(--danger)] mt-4">{errorNuevo}</p>}

            <div className="flex gap-3 mt-6">
              <button onClick={() => setNuevo(null)} className="btn btn-secondary flex-1">
                Cancelar
              </button>
              <button onClick={crearInsumo} disabled={!nuevo.nombre.trim() || enviando} className="btn btn-primary flex-1 disabled:opacity-50">
                <Save className="w-4 h-4" />
                Crear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
