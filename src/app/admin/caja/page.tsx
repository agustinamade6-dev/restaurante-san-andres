'use client';

import { useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { 
  Banknote, 
  CreditCard, 
  Receipt,
  TrendingUp,
  Clock,
  Printer,
  Ban,
  X
} from 'lucide-react';
import { formatDate } from '@/lib/formatDate';
import { documentoImpresion, html, imprimir } from '@/utils/html';
import ErrorDeCarga from '@/components/ErrorDeCarga';
import { formatPesos } from '@/utils/dinero';
import { useDialogo } from '@/hooks/useDialogo';

// Lo que el modal de anulación usa de una fila de GET /api/caja (montos en pesos).
interface VentaAnulable {
  id: number;
  numeroTicket?: string;
  total: number;
  mesaNumero?: number | null;
  mesa?: { numero: number } | null;
  pedido?: { mesa?: { numero: number } | null } | null;
}

// Fila de GET /api/caja (montos en pesos) y su resumen neto.
interface VentaCaja extends VentaAnulable {
  fechaCobro: string;
  metodoPago: string;
  propina: number;
  esAnulacion?: boolean;
  anulada?: boolean;
}

interface CajaData {
  ventas: VentaCaja[];
  resumen: {
    totalRecaudado: number;
    totalPropinas: number;
    cantidadVentas: number;
    porMetodo: Record<string, { count: number; total: number }>;
    periodo: string;
  };
}

export default function CajaPage() {
  const [periodo, setPeriodo] = useState('1'); // days
  const { data, cargando: loading, error: errorCaja, recargar: fetchCaja } = useApi<CajaData | null>(`/api/caja?days=${periodo}`, null);
  // Venta a anular (modal abierto) y estado del formulario
  const [anulando, setAnulando] = useState<VentaAnulable | null>(null);
  const [motivo, setMotivo] = useState('');
  const [errorAnular, setErrorAnular] = useState('');
  const [enviando, setEnviando] = useState(false);
  const dlgAnular = useDialogo('Anular venta', () => setAnulando(null));

  const abrirAnular = (venta: VentaAnulable) => {
    setAnulando(venta);
    setMotivo('');
    setErrorAnular('');
  };

  // POST /api/ventas/{id}/anular: registra un asiento inverso; la venta original queda tachada.
  const confirmarAnular = async () => {
    if (!anulando) return;
    const texto = motivo.trim();
    if (texto.length < 3) {
      setErrorAnular('El motivo es obligatorio (mínimo 3 caracteres)');
      return;
    }
    setEnviando(true);
    setErrorAnular('');
    try {
      const res = await fetch(`/api/ventas/${anulando.id}/anular`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: texto }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setErrorAnular(json.error || 'No se pudo anular la venta');
        return;
      }
      setAnulando(null);
      fetchCaja();
    } catch {
      setErrorAnular('No se pudo conectar con el servidor');
    } finally {
      setEnviando(false);
    }
  };

  const imprimirCierre = () => {
    if (!data) return;
    // Todo dato va interpolado en `html`, que lo escapa (los métodos de pago vienen de la base).
    const metodos = Object.entries(data.resumen.porMetodo).map(
      ([metodo, stats]) => html`<tr><td>${metodo.toUpperCase()} (${stats.count})</td><td class="right">${formatPesos(stats.total)}</td></tr>`
    );
    imprimir(
      documentoImpresion(
        'Cierre de Caja',
        'body{font-family:monospace;font-size:12px;width:280px;margin:0 auto;padding:10px}table{width:100%;border-collapse:collapse}td{padding:4px 0}.sep{border-top:1px dashed #000;margin:10px 0}.center{text-align:center}.bold{font-weight:bold}.right{text-align:right}',
        html`<div class="center bold" style="font-size:16px">CIERRE DE CAJA</div>
<div class="center">Periodo: ${data.resumen.periodo}</div>
<div class="center">Fecha: ${formatDate(new Date(), true)}</div>
<div class="sep"></div>
<table>
<tr><td>Total Recaudado</td><td class="right bold">${formatPesos(data.resumen.totalRecaudado)}</td></tr>
<tr><td>Total Propinas</td><td class="right">${formatPesos(data.resumen.totalPropinas)}</td></tr>
<tr><td>Cant. Ventas</td><td class="right">${data.resumen.cantidadVentas}</td></tr>
</table>
<div class="sep"></div>
<div class="bold">DESGLOSE POR MÉTODO</div>
<table>${metodos}</table>
<div class="sep"></div>
<div style="margin-top:40px;border-top:1px solid #000;text-align:center;padding-top:4px">Firma Responsable</div>`
      )
    );
  };



  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Caja y Cobranzas</h1>
          <p className="text-[var(--muted)] mt-1">Resumen de ventas y arqueo de caja</p>
        </div>
        <div className="flex items-center gap-3">
          <select 
            value={periodo} 
            onChange={(e) => setPeriodo(e.target.value)}
            className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-4 py-2 font-semibold outline-none focus:border-amber-500 transition-colors"
          >
            <option value="1">Hoy</option>
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
          </select>

          <button 
            onClick={imprimirCierre}
            disabled={!data || data.ventas.length === 0}
            className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            Imprimir Arqueo
          </button>
        </div>
      </div>

      <ErrorDeCarga error={errorCaja} que="las ventas" onReintentar={fetchCaja} />

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : data ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-amber-500/10 rounded-lg"><TrendingUp className="w-5 h-5 text-amber-500" /></div>
                <h3 className="font-bold text-sm text-[var(--muted)]">Total Recaudado</h3>
              </div>
              <p className="text-3xl font-black text-amber-500 font-mono">{formatPesos(data.resumen.totalRecaudado)}</p>
            </div>
            <div className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-500/10 rounded-lg"><Receipt className="w-5 h-5 text-blue-500" /></div>
                <h3 className="font-bold text-sm text-[var(--muted)]">Cant. Ventas</h3>
              </div>
              <p className="text-3xl font-black font-mono">{data.resumen.cantidadVentas}</p>
            </div>
            <div className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-emerald-500/10 rounded-lg"><Banknote className="w-5 h-5 text-emerald-500" /></div>
                <h3 className="font-bold text-sm text-[var(--muted)]">Efectivo</h3>
              </div>
              <p className="text-3xl font-black text-emerald-500 font-mono">{formatPesos(data.resumen.porMetodo['efectivo']?.total || 0)}</p>
            </div>
            <div className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-purple-500/10 rounded-lg"><CreditCard className="w-5 h-5 text-purple-500" /></div>
                <h3 className="font-bold text-sm text-[var(--muted)]">Digital</h3>
              </div>
              <p className="text-3xl font-black text-purple-500 font-mono">
                {formatPesos((data.resumen.porMetodo['tarjeta']?.total || 0) + (data.resumen.porMetodo['transferencia']?.total || 0))}
              </p>
            </div>
          </div>

          {/* Últimos Cobros */}
          <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
            <div className="p-5 border-b border-[var(--border)]">
              <h2 className="font-bold flex items-center gap-2"><Clock className="w-5 h-5 text-amber-500" /> Historial de Cobros ({data.resumen.periodo})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--background)] text-[var(--muted)] font-semibold uppercase tracking-wider text-xs">
                  <tr>
                    <th className="p-4">Hora</th>
                    <th className="p-4">Mesa</th>
                    <th className="p-4">Ticket</th>
                    <th className="p-4">MÉTODO</th>
                    <th className="p-4 text-right">Propina</th>
                    <th className="p-4 text-right">Total</th>
                    <th className="p-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {data.ventas.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-[var(--muted)]">No hay ventas en este periodo</td>
                    </tr>
                  ) : (
                    data.ventas.map((v) => (
                      <tr
                        key={v.id}
                        className={`hover:bg-[var(--background)] transition-colors ${v.esAnulacion ? 'bg-red-500/5' : ''} ${v.anulada ? 'opacity-60' : ''}`}
                      >
                        <td className="p-4 whitespace-nowrap">{formatDate(v.fechaCobro)}</td>
                        {/* mesaNumero es el número al momento del cobro: no cambia si la mesa se renumera o se archiva */}
                        <td className="p-4 font-bold">Mesa {v.mesaNumero ?? v.mesa?.numero ?? v.pedido?.mesa?.numero ?? 'S/N'}</td>
                        <td className={`p-4 text-[var(--muted)] font-mono ${v.anulada ? 'line-through' : ''}`}>{v.numeroTicket || `#T-${v.id.toString().padStart(5, '0')}`}</td>
                        <td className="p-4">
                          <span className="bg-neutral-800 px-2 py-1 rounded text-xs font-semibold uppercase tracking-wider">
                            {v.metodoPago}
                          </span>
                        </td>
                        <td className="p-4 text-right text-[var(--muted)]">{formatPesos(v.propina)}</td>
                        <td className={`p-4 text-right font-black font-mono ${v.esAnulacion ? 'text-red-500' : 'text-amber-500'} ${v.anulada ? 'line-through' : ''}`}>
                          {formatPesos(v.total)}
                        </td>
                        <td className="p-4 text-right whitespace-nowrap">
                          {v.esAnulacion ? (
                            <span className="text-xs font-semibold uppercase tracking-wider text-red-500">Anulación</span>
                          ) : v.anulada ? (
                            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Anulada</span>
                          ) : (
                            <button
                              onClick={() => abrirAnular(v)}
                              className="px-3 py-1 rounded-lg text-xs font-bold text-red-500 border border-red-500/30 hover:bg-red-500/10 transition-colors inline-flex items-center gap-1"
                            >
                              <Ban className="w-3 h-3" />
                              Anular
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {anulando && (
        <div {...dlgAnular} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Ban className="w-5 h-5 text-red-500" />
                Anular venta
              </h2>
              <button
                onClick={() => setAnulando(null)}
                className="p-1 rounded-lg hover:bg-[var(--background)]"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[var(--background)] rounded-lg p-3 mb-4 text-sm space-y-1">
              <p><span className="text-[var(--muted)]">Ticket:</span> <span className="font-mono">{anulando.numeroTicket || `#${anulando.id}`}</span></p>
              <p><span className="text-[var(--muted)]">Mesa:</span> {anulando.mesaNumero ?? anulando.mesa?.numero ?? anulando.pedido?.mesa?.numero ?? 'S/N'}</p>
              <p><span className="text-[var(--muted)]">Total:</span> <span className="font-bold">{formatPesos(anulando.total)}</span></p>
            </div>

            <p className="text-sm text-[var(--muted)] mb-3">
              La venta no se borra: se registra una anulación por el mismo importe en negativo, que resta del total de caja.
            </p>

            <label htmlFor="motivo-anulacion" className="text-sm font-semibold mb-1 block">Motivo (obligatorio)</label>
            <textarea
              id="motivo-anulacion"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={500}
              rows={3}
              autoFocus
              placeholder="Ej.: se cobró con el método equivocado"
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-red-500 transition-colors resize-none"
            />

            {errorAnular && <p className="text-sm text-red-500 mt-2">{errorAnular}</p>}

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setAnulando(null)}
                className="px-4 py-2 rounded-lg font-semibold bg-[var(--background)] border border-[var(--border)] hover:opacity-80 transition-opacity"
              >
                Volver
              </button>
              <button
                onClick={confirmarAnular}
                disabled={enviando || motivo.trim().length < 3}
                className="px-4 py-2 rounded-lg font-bold bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50"
              >
                {enviando ? 'Anulando…' : 'Anular venta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
