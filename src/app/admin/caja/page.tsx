'use client';

import { useState, useEffect } from 'react';
import { 
  Banknote, 
  CreditCard, 
  Receipt, 
  Users, 
  CalendarDays,
  TrendingUp,
  Clock,
  Printer
} from 'lucide-react';
import { formatDate } from '@/lib/formatDate';

export default function CajaPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState('1'); // days

  const fetchCaja = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/caja?days=${periodo}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCaja();
  }, [periodo]);

  const imprimirCierre = () => {
    if (!data) return;
    const w = window.open('', '_blank', 'width=320,height=600');
    if (!w) return;
    
    w.document.write(`<!DOCTYPE html><html><head><title>Cierre de Caja</title><style>body{font-family:monospace;font-size:12px;width:280px;margin:0 auto;padding:10px}table{width:100%;border-collapse:collapse}td{padding:4px 0}.sep{border-top:1px dashed #000;margin:10px 0}.center{text-align:center}.bold{font-weight:bold}.right{text-align:right}</style></head><body>`);
    
    w.document.write(`<div class="center bold" style="font-size:16px">CIERRE DE CAJA</div>`);
    w.document.write(`<div class="center">Periodo: ${data.resumen.periodo}</div>`);
    w.document.write(`<div class="center">Fecha: ${formatDate(new Date(), true)}</div>`);
    w.document.write(`<div class="sep"></div>`);
    
    w.document.write(`<table>`);
    w.document.write(`<tr><td>Total Recaudado</td><td class="right bold">$${data.resumen.totalRecaudado.toLocaleString()}</td></tr>`);
    w.document.write(`<tr><td>Total Propinas</td><td class="right">$${data.resumen.totalPropinas.toLocaleString()}</td></tr>`);
    w.document.write(`<tr><td>Cant. Ventas</td><td class="right">${data.resumen.cantidadVentas}</td></tr>`);
    w.document.write(`</table>`);
    
    w.document.write(`<div class="sep"></div>`);
    w.document.write(`<div class="bold">DESGLOSE POR M\u00c9TODO</div>`);
    w.document.write(`<table>`);
    Object.entries(data.resumen.porMetodo).forEach(([metodo, stats]: [string, any]) => {
      w.document.write(`<tr><td>${metodo.toUpperCase()} (${stats.count})</td><td class="right">$${stats.total.toLocaleString()}</td></tr>`);
    });
    w.document.write(`</table>`);
    
    w.document.write(`<div class="sep"></div>`);
    w.document.write(`<div style="margin-top:40px;border-top:1px solid #000;text-align:center;padding-top:4px">Firma Responsable</div>`);
    
    w.document.write(`</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
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
              <p className="text-3xl font-black text-amber-500 font-mono">${data.resumen.totalRecaudado.toLocaleString()}</p>
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
              <p className="text-3xl font-black text-emerald-500 font-mono">${(data.resumen.porMetodo['efectivo']?.total || 0).toLocaleString()}</p>
            </div>
            <div className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-purple-500/10 rounded-lg"><CreditCard className="w-5 h-5 text-purple-500" /></div>
                <h3 className="font-bold text-sm text-[var(--muted)]">Digital</h3>
              </div>
              <p className="text-3xl font-black text-purple-500 font-mono">
                ${((data.resumen.porMetodo['tarjeta']?.total || 0) + (data.resumen.porMetodo['transferencia']?.total || 0)).toLocaleString()}
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {data.ventas.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-[var(--muted)]">No hay ventas en este periodo</td>
                    </tr>
                  ) : (
                    data.ventas.map((v: any) => (
                      <tr key={v.id} className="hover:bg-[var(--background)] transition-colors">
                        <td className="p-4 whitespace-nowrap">{formatDate(v.fechaCobro)}</td>
                        <td className="p-4 font-bold">Mesa {v.mesa?.numero ?? v.pedido?.mesa?.numero ?? v.mesaNumero ?? 'S/N'}</td>
                        <td className="p-4 text-[var(--muted)] font-mono">{v.numeroTicket || `#T-${v.id.toString().padStart(5, '0')}`}</td>
                        <td className="p-4">
                          <span className="bg-neutral-800 px-2 py-1 rounded text-xs font-semibold uppercase tracking-wider">
                            {v.metodoPago}
                          </span>
                        </td>
                        <td className="p-4 text-right text-[var(--muted)]">${v.propina.toLocaleString()}</td>
                        <td className="p-4 text-right font-black text-amber-500 font-mono">${v.total.toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}


    </div>
  );
}
