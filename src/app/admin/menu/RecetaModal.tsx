'use client';

import { useEffect, useState } from 'react';
import { ClipboardList, Plus, Save, Trash2, X } from 'lucide-react';

interface Insumo {
  id: number;
  nombre: string;
  unidad: string;
  precioUnitario: number;
}

interface Linea {
  insumoId: number;
  cantidad: string; // texto del input: admite "0,2" o "0.2" mientras se escribe
}

interface Props {
  producto: { id: number; nombre: string; precio: number };
  onClose: () => void;
}

const aNumero = (texto: string) => Number(texto.replace(',', '.'));

/**
 * Receta de un producto: qué insumos consume UNA unidad vendida. Al cobrar, el stock de esos insumos se descuenta
 * solo; al anular la venta, se reintegra (ver src/lib/stock.ts).
 */
export default function RecetaModal({ producto, onClose }: Props) {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [resInsumos, resReceta] = await Promise.all([
          fetch('/api/inventario'),
          fetch(`/api/productos/${producto.id}/receta`),
        ]);
        const dataInsumos = await resInsumos.json();
        const dataReceta = await resReceta.json();
        if (cancelado) return;
        if (!resInsumos.ok || !resReceta.ok) {
          setError(dataReceta.error || dataInsumos.error || 'No se pudo cargar la receta');
          return;
        }
        setInsumos(dataInsumos);
        setLineas(
          dataReceta.items.map((i: { insumoId: number; cantidad: number }) => ({
            insumoId: i.insumoId,
            cantidad: String(i.cantidad),
          }))
        );
      } catch {
        if (!cancelado) setError('Error de conexión al cargar la receta');
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [producto.id]);

  const insumoDe = (id: number) => insumos.find((i) => i.id === id);
  const disponibles = (actual: number) =>
    insumos.filter((i) => i.id === actual || !lineas.some((l) => l.insumoId === i.id));

  const costo = lineas.reduce((s, l) => {
    const cantidad = aNumero(l.cantidad);
    const insumo = insumoDe(l.insumoId);
    return insumo && Number.isFinite(cantidad) ? s + cantidad * insumo.precioUnitario : s;
  }, 0);
  const margen = producto.precio - costo;

  const agregar = () => {
    const libre = disponibles(-1)[0];
    if (libre) setLineas((ls) => [...ls, { insumoId: libre.id, cantidad: '1' }]);
  };

  const guardar = async () => {
    setError('');
    const items = lineas.map((l) => ({ insumoId: l.insumoId, cantidad: aNumero(l.cantidad) }));
    if (items.some((i) => !Number.isFinite(i.cantidad) || i.cantidad <= 0)) {
      setError('Cada insumo necesita una cantidad mayor que 0');
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch(`/api/productos/${producto.id}/receta`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo guardar la receta');
        return;
      }
      onClose();
    } catch {
      setError('Error de conexión al guardar la receta');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass-card w-full max-w-lg p-6 animate-fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-amber-400" />
            Receta: {producto.nombre}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[var(--background)] flex items-center justify-center hover:bg-[var(--card-hover)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-[var(--muted)] mb-5">
          Insumos que consume <b>una unidad</b> vendida. Al cobrar se descuentan del inventario; al anular la venta se
          reintegran.
        </p>

        {cargando ? (
          <p className="text-sm text-[var(--muted)]">Cargando...</p>
        ) : insumos.length === 0 && !error ? (
          <p className="text-sm text-[var(--muted)]">
            No hay insumos cargados. Agregalos primero en <b>Inventario</b>.
          </p>
        ) : (
          <div className="space-y-3">
            {lineas.length === 0 && (
              <p className="text-sm text-[var(--muted)]">Sin receta: vender este producto no mueve el stock.</p>
            )}
            {lineas.map((linea, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select
                  value={linea.insumoId}
                  onChange={(e) =>
                    setLineas((ls) => ls.map((l, i) => (i === idx ? { ...l, insumoId: Number(e.target.value) } : l)))
                  }
                  className="input flex-1"
                >
                  {disponibles(linea.insumoId).map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nombre}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  inputMode="decimal"
                  value={linea.cantidad}
                  onChange={(e) =>
                    setLineas((ls) => ls.map((l, i) => (i === idx ? { ...l, cantidad: e.target.value } : l)))
                  }
                  className="input w-24 text-right"
                />
                <span className="text-xs text-[var(--muted)] w-14">{insumoDe(linea.insumoId)?.unidad}</span>
                <button
                  onClick={() => setLineas((ls) => ls.filter((_, i) => i !== idx))}
                  className="w-8 h-8 rounded-lg bg-[var(--danger-bg)] text-[var(--danger)] flex items-center justify-center hover:bg-[var(--danger)] hover:text-white transition-colors shrink-0"
                  title="Quitar"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            <button
              onClick={agregar}
              disabled={disponibles(-1).length === 0}
              className="btn btn-secondary btn-sm disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              Agregar insumo
            </button>

            <div className="bg-[var(--background)] p-3 rounded-xl border border-[var(--border)] text-sm grid grid-cols-3 gap-2">
              <div>
                <p className="text-xs text-[var(--muted)]">Precio</p>
                <p className="font-bold">${producto.precio.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--muted)]">Costo insumos</p>
                <p className="font-bold">${Math.round(costo).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--muted)]">Margen</p>
                <p className={`font-bold ${margen < 0 ? 'text-[var(--danger)]' : 'text-amber-400'}`}>
                  ${Math.round(margen).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-[var(--danger)] mt-4">{error}</p>}

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn btn-secondary flex-1">
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={cargando || guardando || (insumos.length === 0 && lineas.length === 0)}
            className="btn btn-primary flex-1 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {guardando ? 'Guardando...' : 'Guardar receta'}
          </button>
        </div>
      </div>
    </div>
  );
}
