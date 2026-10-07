'use client';

import { useState } from 'react';
import { useApi } from '@/hooks/useApi';
import AvisoError from '@/components/AvisoError';
import ErrorDeCarga from '@/components/ErrorDeCarga';
import { enviar, enviarJson } from '@/lib/api-cliente';
import { useEnvio } from '@/hooks/useEnvio';
import { formatPesos } from '@/utils/dinero';
import {
  Plus,
  Trash2,
  DollarSign,
  TrendingUp,
  TrendingDown,
  X,
  Save,
} from 'lucide-react';

interface CostoFijo {
  id: number;
  concepto: string;
  monto: number;
  tipo: string;
  periodicidad: string;
}

export default function CostosPage() {
  const [modal, setModal] = useState(false);
  // Errores de la API: el del modal deja el formulario abierto; el de la lista va arriba de ella.
  const [errorModal, setErrorModal] = useState('');
  const { ejecutar, enviando } = useEnvio();
  const [errorLista, setErrorLista] = useState('');
  const [form, setForm] = useState({
    concepto: '',
    monto: 0,
    tipo: 'fijo',
    periodicidad: 'mensual',
  });

  const { data: costos, error: errorCarga, recargar: fetchCostos } = useApi<CostoFijo[]>('/api/costos', []);

  const guardar = () => ejecutar(async () => {
    setErrorModal('');
    const error = await enviarJson('/api/costos', 'POST', form, 'No se pudo guardar el costo');
    if (error) return setErrorModal(error);
    setModal(false);
    setForm({ concepto: '', monto: 0, tipo: 'fijo', periodicidad: 'mensual' });
    fetchCostos();
  });

  const eliminar = async (id: number) => {
    if (!confirm('¿Eliminar este costo?')) return;
    setErrorLista('');
    const error = await enviar(`/api/costos?id=${id}`, { method: 'DELETE' }, 'No se pudo eliminar el costo');
    if (error) return setErrorLista(error);
    fetchCostos();
  };

  const totalFijos = costos
    .filter((c) => c.tipo === 'fijo')
    .reduce((sum, c) => sum + c.monto, 0);
  const totalVariables = costos
    .filter((c) => c.tipo === 'variable')
    .reduce((sum, c) => sum + c.monto, 0);
  const totalGeneral = totalFijos + totalVariables;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Gestión de Costos</h1>
          <p className="text-[var(--muted)] text-sm mt-1">
            Costos fijos y variables mensuales
          </p>
        </div>
        <button onClick={() => { setErrorModal(''); setModal(true); }} className="btn btn-primary">
          <Plus className="w-4 h-4" />
          Agregar Costo
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="metric-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-[var(--muted)] mb-1">Costos Fijos</p>
              <p className="text-2xl font-bold text-[var(--info)]">
                {formatPesos(totalFijos)}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[var(--info-bg)] flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-[var(--info)]" />
            </div>
          </div>
        </div>
        <div className="metric-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-[var(--muted)] mb-1">
                Costos Variables
              </p>
              <p className="text-2xl font-bold text-amber-400">
                {formatPesos(totalVariables)}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-amber-400" />
            </div>
          </div>
        </div>
        <div className="metric-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-[var(--muted)] mb-1">Total Mensual</p>
              <p className="text-2xl font-bold text-[var(--danger)]">
                {formatPesos(totalGeneral)}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[var(--danger-bg)] flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-[var(--danger)]" />
            </div>
          </div>
        </div>
      </div>

      <ErrorDeCarga error={errorCarga} que="los costos" onReintentar={fetchCostos} />
      <AvisoError mensaje={errorLista} onCerrar={() => setErrorLista('')} />

      {/* Cost list */}
      <div className="glass-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left p-4 text-sm font-semibold text-[var(--muted)]">
                Concepto
              </th>
              <th className="text-center p-4 text-sm font-semibold text-[var(--muted)]">
                Tipo
              </th>
              <th className="text-center p-4 text-sm font-semibold text-[var(--muted)]">
                Periodicidad
              </th>
              <th className="text-right p-4 text-sm font-semibold text-[var(--muted)]">
                Monto
              </th>
              <th className="text-right p-4 text-sm font-semibold text-[var(--muted)]">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {costos.map((costo) => (
              <tr
                key={costo.id}
                className="border-b border-[var(--border)] hover:bg-[var(--card-hover)] transition-colors"
              >
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        costo.tipo === 'fijo'
                          ? 'bg-[var(--info-bg)]'
                          : 'bg-amber-500/10'
                      }`}
                    >
                      <DollarSign
                        className={`w-4 h-4 ${
                          costo.tipo === 'fijo'
                            ? 'text-[var(--info)]'
                            : 'text-amber-400'
                        }`}
                      />
                    </div>
                    <span className="font-semibold text-sm">
                      {costo.concepto}
                    </span>
                  </div>
                </td>
                <td className="p-4 text-center">
                  <span
                    className={`badge ${
                      costo.tipo === 'fijo'
                        ? 'badge-preparando'
                        : 'badge-pendiente'
                    }`}
                  >
                    {costo.tipo}
                  </span>
                </td>
                <td className="p-4 text-center text-sm text-[var(--muted)] capitalize">
                  {costo.periodicidad}
                </td>
                <td className="p-4 text-right">
                  <span className="font-bold text-[var(--danger)]">
                    {formatPesos(costo.monto)}
                  </span>
                </td>
                <td className="p-4 text-right">
                  <button
                    onClick={() => eliminar(costo.id)}
                    className="w-8 h-8 rounded-lg bg-[var(--danger-bg)] text-[var(--danger)] flex items-center justify-center hover:bg-[var(--danger)] hover:text-white transition-colors ml-auto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card w-full max-w-md p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-amber-400" />
                Agregar Costo
              </h2>
              <button
                onClick={() => setModal(false)}
                className="w-8 h-8 rounded-lg bg-[var(--background)] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-[var(--muted)] mb-1 block">
                  Concepto
                </label>
                <input
                  type="text"
                  value={form.concepto}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, concepto: e.target.value }))
                  }
                  className="input"
                  placeholder="Ej: Alquiler, Seguro..."
                />
              </div>
              <div>
                <label className="text-sm text-[var(--muted)] mb-1 block">
                  Monto ($)
                </label>
                <input
                  type="number"
                  value={form.monto}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      monto: parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="input"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-[var(--muted)] mb-1 block">
                    Tipo
                  </label>
                  <select
                    value={form.tipo}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, tipo: e.target.value }))
                    }
                    className="input"
                  >
                    <option value="fijo">Fijo</option>
                    <option value="variable">Variable</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-[var(--muted)] mb-1 block">
                    Periodicidad
                  </label>
                  <select
                    value={form.periodicidad}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        periodicidad: e.target.value,
                      }))
                    }
                    className="input"
                  >
                    <option value="diario">Diario</option>
                    <option value="semanal">Semanal</option>
                    <option value="mensual">Mensual</option>
                  </select>
                </div>
              </div>
            </div>

            {errorModal && <p role="alert" className="text-sm text-[var(--danger)] mt-4">{errorModal}</p>}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setModal(false)}
                className="btn btn-secondary flex-1"
              >
                Cancelar
              </button>
              <button onClick={guardar} disabled={enviando} className="btn btn-primary flex-1 disabled:opacity-50">
                <Save className="w-4 h-4" />
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
