'use client';

import { useState, useCallback } from 'react';
import { formatDate } from '@/lib/formatDate';
import {
  ChefHat,
  Clock,
  Flame,
  CheckCircle2,
  Bell,
  MessageSquare,
  Edit,
  History,
  Plus,
  Minus,
  Trash2,
  X,
  CheckCheck,
  LogOut,
  AlertCircle,
} from 'lucide-react';
import { useSSE } from '@/hooks/useSSE';
import { useAhora } from '@/hooks/useAhora';
import { useApi } from '@/hooks/useApi';
import { enviarJson } from '@/lib/api-cliente';

interface HistorialPedido {
  id: number;
  pedidoId: number;
  accion: string;
  detalle: string;
  motivo: string;
  createdAt: string;
}

interface Pedido {
  id: number;
  mesaId: number;
  estado: string;
  total: number;
  notas: string;
  creadoEn: string;
  actualizadoEn: string;
  entregadoEn?: string;
  mesa: { numero: number };
  historial: HistorialPedido[];
  items: Array<{
    id: number;
    cantidad: number;
    notas: string;
    precio: number;
    productoId: number;
    producto: { nombre: string; imagen: string; precio: number };
  }>;
}

export default function CocinaPage() {
  const [nuevoPedido, setNuevoPedido] = useState(false);
  const [modalEditOpen, setModalEditOpen] = useState<Pedido | null>(null);
  const [modalHistoryOpen, setModalHistoryOpen] = useState<Pedido | null>(null);
  const [modalEntregadosOpen, setModalEntregadosOpen] = useState(false);
  const [modalCancelarOpen, setModalCancelarOpen] = useState<Pedido | null>(null);
  const [motivoCambio, setMotivoCambio] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [historialTab, setHistorialTab] = useState<'entregados' | 'cancelados'>('entregados');
  // Errores de la API: aviso flotante para acciones sobre la grilla; el de cancelar va en su modal.
  const [aviso, setAviso] = useState('');
  const [errorCancelar, setErrorCancelar] = useState('');
  // Hora que avanza sola: refresca "hace X min" y la marca de demorado aunque no lleguen eventos
  const ahora = useAhora();

  const mostrarError = useCallback((mensaje: string) => {
    setAviso(mensaje);
    setTimeout(() => setAviso((actual) => (actual === mensaje ? '' : actual)), 5000);
  }, []);

  const { data: pedidos, recargar: fetchPedidos } = useApi<Pedido[]>('/api/pedidos', []);
  const { data: productos } = useApi<Array<{ id: number; nombre: string; precio: number; categoriaId: number }>>('/api/productos', []);
  // Historial de hoy: solo se pide con su modal abierto (y se vuelve a pedir al reabrirlo)
  const { data: entregados, recargar: fetchEntregados } = useApi<Pedido[]>(
    modalEntregadosOpen ? '/api/pedidos/history?days=1' : null,
    []
  );

  // SSE for real-time updates
  useSSE(
    useCallback(
      (data: { event: string }) => {
        if (data.event === 'pedido:nuevo') {
          setNuevoPedido(true);
          setTimeout(() => setNuevoPedido(false), 3000);
        }
        fetchPedidos();
      },
      [fetchPedidos]
    )
  );

  const handleModifyItem = async (pedidoId: number, action: string, data: Record<string, unknown>) => {
    const error = await enviarJson(
      `/api/pedidos/${pedidoId}/items`,
      'PATCH',
      { action, motivo: motivoCambio || 'Modificado desde cocina', ...data },
      'No se pudo modificar el pedido'
    );
    if (error) mostrarError(error);
    setMotivoCambio('');
    fetchPedidos();
  };

  /** Devuelve true si el servidor aceptó el cambio; si no, muestra su error. */
  const cambiarEstado = async (pedidoId: number, nuevoEstado: string): Promise<boolean> => {
    const error = await enviarJson('/api/pedidos', 'PATCH', { id: pedidoId, estado: nuevoEstado }, 'No se pudo cambiar el estado del pedido');
    if (error) mostrarError(error);
    fetchPedidos();
    return !error;
  };

  const handleCancelarPedido = async (pedidoId: number) => {
    setIsCancelling(true);
    setErrorCancelar('');
    try {
      const res = await fetch(`/api/pedidos/${pedidoId}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: motivoCambio }),
      });
      if (res.ok) {
        setMotivoCambio('');
        setModalCancelarOpen(null);
        fetchPedidos();
      } else {
        const data = await res.json().catch(() => null);
        setErrorCancelar(data?.error || 'No se pudo cancelar el pedido');
      }
    } catch {
      setErrorCancelar('No se pudo conectar con el servidor');
    } finally {
      setIsCancelling(false);
    }
  };

  const tiempoTranscurrido = (fecha: string) => {
    const diff = ahora - new Date(fecha).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Ahora';
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  const pedidosPendientes = pedidos.filter((p) => p.estado === 'pendiente');
  const pedidosPreparando = pedidos.filter((p) => p.estado === 'preparando');
  const pedidosListos = pedidos.filter((p) => p.estado === 'listo');

  const renderPedido = (pedido: Pedido) => {
    const minutos = Math.floor((ahora - new Date(pedido.creadoEn).getTime()) / 60000);
    const isDemorado = minutos >= 15 && pedido.estado !== 'listo';

    return (
      <div
        key={pedido.id}
        className={`order-card ${pedido.estado} animate-fade-in ${
          isDemorado ? 'ring-4 ring-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : ''
        }`}
      >
        {/* Header */}
        <div className={`p-4 border-b border-[var(--border)] rounded-t-xl ${isDemorado ? 'bg-red-500/10' : ''}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black shadow-inner ${
                  pedido.estado === 'pendiente'
                    ? 'bg-[var(--warning-bg)] text-[var(--warning)]'
                    : pedido.estado === 'preparando'
                    ? 'bg-[var(--info-bg)] text-[var(--info)]'
                    : 'bg-[var(--success-bg)] text-[var(--success)]'
                }`}
              >
                {pedido.mesa.numero}
              </div>
              <div>
                <div className="font-black text-lg">Mesa {pedido.mesa.numero}</div>
                <div className={`flex items-center gap-1.5 text-sm font-bold ${isDemorado ? 'text-red-400 animate-pulse' : 'text-[var(--muted)]'}`}>
                  <Clock className="w-4 h-4" />
                  {tiempoTranscurrido(pedido.creadoEn)}
                  {isDemorado && <span className="ml-1 uppercase text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-sm">Demorado</span>}
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className={`badge badge-${pedido.estado} px-3 py-1.5 text-xs font-black uppercase tracking-widest`}>
                {pedido.estado === 'pendiente' && '⏳ Pendiente'}
                {pedido.estado === 'preparando' && '🔥 Preparando'}
                {pedido.estado === 'listo' && '✅ Listo'}
              </span>
              <div className="flex gap-2">
                {pedido.historial && pedido.historial.length > 0 && (
                  <span className="text-[10px] bg-purple-500/20 text-purple-400 font-bold px-2 py-1 rounded-md flex items-center">
                    <History className="w-3 h-3 mr-1" />
                    MODIFICADO
                  </span>
                )}
                <button onClick={() => setModalHistoryOpen(pedido)} className="p-1.5 bg-[var(--background)] border border-[var(--border)] rounded-md hover:bg-[var(--card-hover)] transition-colors text-[var(--muted)] hover:text-[var(--foreground)]" title="Historial">
                  <History className="w-4 h-4" />
                </button>
                <button onClick={() => setModalEditOpen(pedido)} className="p-1.5 bg-[var(--background)] border border-[var(--border)] rounded-md hover:bg-[var(--card-hover)] transition-colors text-[var(--muted)] hover:text-[var(--foreground)]" title="Editar Comanda">
                  <Edit className="w-4 h-4" />
                </button>
                <button onClick={() => setModalCancelarOpen(pedido)} className="p-1.5 bg-[var(--background)] border border-[var(--border)] rounded-md hover:bg-red-950/40 transition-colors text-[var(--muted)] hover:text-red-400" title="Cancelar Pedido">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

      {/* Items */}
      <div className="p-4">
        <div className="space-y-3">
          {pedido.items.map((item) => (
            <div key={item.id} className="flex items-start gap-3 bg-[var(--background)] p-3 rounded-xl border border-[var(--border)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.producto.imagen} alt={item.producto.nombre} className="w-12 h-12 rounded-lg object-cover bg-neutral-800 shrink-0 border border-[var(--border)]" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-black text-lg bg-black/20 px-2 py-0.5 rounded-md text-[var(--foreground)]">
                    {item.cantidad}x
                  </span>
                  <span className="text-sm font-bold truncate">{item.producto.nombre}</span>
                </div>
                {item.notas && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs font-bold text-amber-400 bg-amber-500/10 p-1.5 rounded-md">
                    <MessageSquare className="w-4 h-4 shrink-0" />
                    <span className="italic">{item.notas}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        {pedido.notas && (
          <div className="mt-4 p-3 rounded-xl bg-red-500/10 border-2 border-red-500/20 shadow-inner">
            <p className="text-sm text-red-400 font-bold flex items-center gap-2">
              <Bell className="w-4 h-4" /> NOTA GLOBAL: {pedido.notas}
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 pt-0 mt-2">
        {pedido.estado === 'pendiente' && (
          <button
            onClick={() => cambiarEstado(pedido.id, 'preparando')}
            className="btn btn-info w-full text-base py-4 font-black shadow-lg hover:shadow-cyan-500/20 active:scale-95 transition-all"
          >
            <Flame className="w-5 h-5 mr-1" />
            INICIAR PREPARACIÓN
          </button>
        )}
        {pedido.estado === 'preparando' && (
          <button
            onClick={() => cambiarEstado(pedido.id, 'listo')}
            className="btn btn-success w-full text-base py-4 font-black shadow-lg hover:shadow-green-500/20 active:scale-95 transition-all"
          >
            <CheckCircle2 className="w-5 h-5 mr-1" />
            MARCAR COMO LISTO
          </button>
        )}
        {pedido.estado === 'listo' && (
          <button
            onClick={() => cambiarEstado(pedido.id, 'entregado')}
            className="btn btn-primary w-full text-base py-4 font-black shadow-lg hover:shadow-blue-500/20 active:scale-95 transition-all opacity-80"
          >
            <CheckCircle2 className="w-5 h-5 mr-1" />
            CONFIRMAR ENTREGA
          </button>
        )}
      </div>
    </div>
  );
  };

  return (
    <div className="min-h-screen p-4 md:p-6">
      {/* New order notification */}
      {nuevoPedido && (
        <div className="fixed top-4 right-4 z-50 px-6 py-4 rounded-xl bg-amber-500 text-black font-bold animate-shake shadow-lg shadow-amber-500/30 flex items-center gap-3">
          <Bell className="w-5 h-5 animate-bounce" />
          ¡Nuevo pedido recibido!
        </div>
      )}

      {/* Error de la API (debajo del aviso de nuevo pedido para que no se tapen) */}
      {aviso && (
        <div role="alert" className="fixed top-20 right-4 z-50 max-w-sm px-6 py-4 rounded-xl bg-[var(--danger)] text-white text-sm font-bold shadow-2xl animate-slide-in flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="flex-1">{aviso}</span>
          <button onClick={() => setAviso('')} aria-label="Cerrar aviso" className="p-1 rounded hover:bg-white/20">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.href = '/';
          }}
          className="w-10 h-10 rounded-xl bg-[var(--card)] border border-[var(--border)] flex items-center justify-center hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-colors shadow-sm text-[var(--muted)]"
          title="Bloquear Terminal"
        >
          <LogOut className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
            <ChefHat className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Cocina — Monitor KDS</h1>
            <p className="text-[var(--muted)] text-sm">
              {pedidos.length} pedidos activos
            </p>
          </div>
        </div>

        {/* Counters */}
        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--warning-bg)]">
            <span className="w-2 h-2 rounded-full bg-[var(--warning)]" />
            <span className="text-sm font-semibold text-[var(--warning)]">
              {pedidosPendientes.length} Pendientes
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--info-bg)]">
            <span className="w-2 h-2 rounded-full bg-[var(--info)]" />
            <span className="text-sm font-semibold text-[var(--info)]">
              {pedidosPreparando.length} Preparando
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--success-bg)]">
            <span className="w-2 h-2 rounded-full bg-[var(--success)]" />
            <span className="text-sm font-semibold text-[var(--success)]">
              {pedidosListos.length} Listos
            </span>
          </div>
          
          <button
            onClick={() => setModalEntregadosOpen(true)}
            className="ml-4 flex items-center gap-2 px-4 py-2 bg-[var(--card)] hover:bg-[var(--card-hover)] border border-[var(--border)] rounded-xl font-bold transition-colors"
          >
            <CheckCheck className="w-4 h-4 text-green-500" />
            Historial Entregados
          </button>
        </div>
      </div>

      {/* Kanban Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Pendientes */}
        <div>
          <div className="flex items-center gap-2 mb-4 px-2">
            <Clock className="w-5 h-5 text-[var(--warning)]" />
            <h2 className="font-bold text-lg">Pendientes</h2>
            <span className="ml-auto w-7 h-7 rounded-full bg-[var(--warning-bg)] text-[var(--warning)] text-sm font-bold flex items-center justify-center">
              {pedidosPendientes.length}
            </span>
          </div>
          <div className="space-y-4">
            {pedidosPendientes.map(renderPedido)}
            {pedidosPendientes.length === 0 && (
              <div className="glass-card p-8 text-center text-[var(--muted)]">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Sin pedidos pendientes</p>
              </div>
            )}
          </div>
        </div>

        {/* Preparando */}
        <div>
          <div className="flex items-center gap-2 mb-4 px-2">
            <Flame className="w-5 h-5 text-[var(--info)]" />
            <h2 className="font-bold text-lg">En Preparación</h2>
            <span className="ml-auto w-7 h-7 rounded-full bg-[var(--info-bg)] text-[var(--info)] text-sm font-bold flex items-center justify-center">
              {pedidosPreparando.length}
            </span>
          </div>
          <div className="space-y-4">
            {pedidosPreparando.map(renderPedido)}
            {pedidosPreparando.length === 0 && (
              <div className="glass-card p-8 text-center text-[var(--muted)]">
                <Flame className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nada cocinándose</p>
              </div>
            )}
          </div>
        </div>

        {/* Listos */}
        <div>
          <div className="flex items-center gap-2 mb-4 px-2">
            <CheckCircle2 className="w-5 h-5 text-[var(--success)]" />
            <h2 className="font-bold text-lg">Listos para Servir</h2>
            <span className="ml-auto w-7 h-7 rounded-full bg-[var(--success-bg)] text-[var(--success)] text-sm font-bold flex items-center justify-center">
              {pedidosListos.length}
            </span>
          </div>
          <div className="space-y-4">
            {pedidosListos.map(renderPedido)}
            {pedidosListos.length === 0 && (
              <div className="glass-card p-8 text-center text-[var(--muted)]">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nada listo aún</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {modalEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-[var(--card)] w-full max-w-2xl rounded-2xl border border-[var(--border)] shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Edit className="w-5 h-5 text-[var(--primary)]" />
                  Editar Comanda - Mesa {modalEditOpen.mesa.numero}
                </h2>
                <p className="text-sm text-[var(--muted)]">Modifica los platos de la orden activa.</p>
              </div>
              <button onClick={() => setModalEditOpen(null)} className="p-2 hover:bg-[var(--card-hover)] rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1 space-y-6">
              {/* Items Actuales */}
              <div>
                <h3 className="font-bold mb-3">Ítems Actuales</h3>
                <div className="space-y-3">
                  {modalEditOpen.items.map(item => (
                    <div key={item.id} className="flex items-center gap-3 p-3 bg-[var(--background)] rounded-xl border border-[var(--border)]">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold truncate">{item.producto.nombre}</div>
                        <div className="text-xs text-[var(--muted)]">{item.notas || 'Sin notas'}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleModifyItem(modalEditOpen.id, 'UPDATE_QUANTITY', { itemId: item.id, cantidad: Math.max(1, item.cantidad - 1) })} className="p-1.5 bg-[var(--card)] rounded-md hover:bg-red-500/20 text-red-400">
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="font-bold w-6 text-center">{item.cantidad}</span>
                        <button onClick={() => handleModifyItem(modalEditOpen.id, 'UPDATE_QUANTITY', { itemId: item.id, cantidad: item.cantidad + 1 })} className="p-1.5 bg-[var(--card)] rounded-md hover:bg-green-500/20 text-green-400">
                          <Plus className="w-4 h-4" />
                        </button>
                        <div className="w-[1px] h-6 bg-[var(--border)] mx-1"></div>
                        <button onClick={() => { if(confirm('¿Eliminar este plato?')) handleModifyItem(modalEditOpen.id, 'REMOVE_ITEM', { itemId: item.id }) }} className="p-1.5 bg-[var(--card)] rounded-md hover:bg-red-500/20 text-red-500">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Agregar Nuevo */}
              <div>
                <h3 className="font-bold mb-3">Agregar Plato</h3>
                <div className="flex gap-2">
                  <select id="new-item-select" className="flex-1 input bg-[var(--background)] border border-[var(--border)] rounded-xl p-3">
                    <option value="">Seleccionar producto...</option>
                    {productos.map(p => (
                      <option key={p.id} value={p.id}>{p.nombre} - ${p.precio}</option>
                    ))}
                  </select>
                  <button onClick={() => {
                    const sel = document.getElementById('new-item-select') as HTMLSelectElement;
                    if(sel.value) {
                      handleModifyItem(modalEditOpen.id, 'ADD_ITEM', { productoId: parseInt(sel.value, 10), cantidad: 1 });
                      sel.value = '';
                    }
                  }} className="btn btn-primary px-6 rounded-xl">
                    Añadir
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-[var(--border)] bg-[var(--background)] rounded-b-2xl">
              <input type="text" placeholder="Motivo del cambio (opcional)" value={motivoCambio} onChange={(e) => setMotivoCambio(e.target.value)} className="input w-full p-3 bg-[var(--card)] border border-[var(--border)] rounded-xl" />
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {modalHistoryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-[var(--card)] w-full max-w-lg rounded-2xl border border-[var(--border)] shadow-2xl flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <History className="w-5 h-5 text-purple-400" />
                Historial Mesa {modalHistoryOpen.mesa.numero}
              </h2>
              <button onClick={() => setModalHistoryOpen(null)} className="p-2 hover:bg-[var(--card-hover)] rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {modalHistoryOpen.historial && modalHistoryOpen.historial.length > 0 ? (
                modalHistoryOpen.historial.map((log) => (
                  <div key={log.id} className="p-3 border-l-2 border-purple-500 bg-[var(--background)] rounded-r-xl">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold text-sm text-purple-400">{log.accion}</span>
                      <span className="text-xs text-[var(--muted)]">{formatDate(log.createdAt, true)}</span>
                    </div>
                    <p className="text-sm font-semibold">{log.detalle}</p>
                    {log.motivo && <p className="text-xs text-[var(--muted)] mt-1 italic">Motivo: {log.motivo}</p>}
                  </div>
                ))
              ) : (
                <div className="text-center p-6 text-[var(--muted)]">
                  <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>Sin modificaciones registradas</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Entregados Modal */}
      {modalEntregadosOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-[var(--background)] w-full max-w-6xl h-[90vh] rounded-3xl border border-[var(--border)] shadow-2xl flex flex-col overflow-hidden">
            <div className="p-6 bg-[var(--card)] border-b border-[var(--border)] flex items-center justify-between shrink-0 flex-wrap gap-4">
              <h2 className="text-2xl font-bold flex items-center gap-3 text-[var(--foreground)]">
                <History className="w-8 h-8 text-blue-500" />
                Historial de Pedidos
              </h2>
              <div className="flex items-center gap-4">
                <div className="flex bg-[var(--background)] p-1 rounded-xl border border-[var(--border)]">
                  <button
                    onClick={() => setHistorialTab('entregados')}
                    className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${historialTab === 'entregados' ? 'bg-green-500 text-white shadow-md' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}
                  >
                    Entregados
                  </button>
                  <button
                    onClick={() => setHistorialTab('cancelados')}
                    className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${historialTab === 'cancelados' ? 'bg-red-500 text-white shadow-md' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}
                  >
                    Cancelados
                  </button>
                </div>
                <button onClick={() => setModalEntregadosOpen(false)} className="p-3 hover:bg-[var(--card-hover)] rounded-xl transition-colors border border-[var(--border)]">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {entregados.filter(p => historialTab === 'entregados' ? ['entregado', 'pagado'].includes(p.estado) : p.estado === 'cancelado').length > 0 ? (
                entregados
                  .filter(p => historialTab === 'entregados' ? ['entregado', 'pagado'].includes(p.estado) : p.estado === 'cancelado')
                  .map((pedido) => {
                  const end = pedido.entregadoEn ? new Date(pedido.entregadoEn).getTime() : ahora;
                  const start = new Date(pedido.creadoEn).getTime();
                  const durationMins = Math.floor((end - start) / 60000);
                  const isFast = durationMins <= 15;
                  
                  return (
                    <div key={pedido.id} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 flex flex-col gap-4 shadow-lg">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-neutral-800 rounded-xl flex items-center justify-center text-xl font-black text-white">
                            {pedido.mesa.numero}
                          </div>
                          <div>
                            <div className="font-bold">Mesa {pedido.mesa.numero}</div>
                            <div className="text-xs text-[var(--muted)] flex items-center gap-1 mt-1">
                              <Clock className="w-3 h-3" />
                              {formatDate(pedido.creadoEn)}
                              {' - '}
                              {pedido.estado === 'cancelado' 
                                ? `Cancelado ${formatDate(pedido.actualizadoEn)}`
                                : (pedido.entregadoEn ? formatDate(pedido.entregadoEn) : '...')}
                            </div>
                          </div>
                        </div>
                        {pedido.estado !== 'cancelado' && (
                          <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-widest ${isFast ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                            {durationMins} min
                          </span>
                        )}
                      </div>
                      
                      <div className="bg-[var(--background)] rounded-xl p-3 flex-1 overflow-y-auto space-y-2 border border-[var(--border)]/50">
                        {pedido.items.map(item => (
                          <div key={item.id} className="flex justify-between items-center text-sm">
                            <span className="font-bold text-[var(--muted)]">{item.cantidad}x <span className="text-[var(--foreground)]">{item.producto.nombre}</span></span>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-between items-center mt-2">
                        <span className={`badge px-3 py-1 text-[10px] font-black uppercase ${pedido.estado === 'pagado' ? 'bg-blue-500/20 text-blue-400' : pedido.estado === 'cancelado' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                          {pedido.estado}
                        </span>
                        {/* Un pedido pagado no se reabre (para corregir un cobro se anula la venta en Caja) */}
                        {pedido.estado === 'entregado' && (
                          <button 
                            onClick={async () => {
                              if (confirm('¿Estás seguro de reactivar este pedido y enviarlo a Preparando?')) {
                                await cambiarEstado(pedido.id, 'preparando');
                                fetchEntregados();
                              }
                            }}
                            className="text-xs font-bold text-amber-500 hover:text-amber-400 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                          >
                            <History className="w-3 h-3" />
                            Reactivar
                          </button>
                        )}
                      </div>
                      
                      {pedido.estado === 'cancelado' && (
                        <div className="mt-2 bg-red-500/10 border border-red-500/20 p-2 rounded-lg text-xs text-red-400 font-bold">
                          Motivo: {pedido.historial.find(h => h.accion === 'PEDIDO_CANCELADO')?.motivo || 'Cancelado sin motivo especificado'}
                        </div>
                      )}
                    </div>
                  )
                })
              ) : (
                <div className="col-span-full flex flex-col items-center justify-center text-[var(--muted)] p-12">
                  <CheckCheck className="w-16 h-16 opacity-20 mb-4" />
                  <p className="text-xl font-bold">No hay pedidos {historialTab === 'entregados' ? 'entregados' : 'cancelados'} recientemente</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancel Order Modal */}
      {modalCancelarOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[var(--card)] w-full max-w-md rounded-2xl border border-red-500/30 overflow-hidden shadow-2xl flex flex-col">
            <div className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-red-500/10">
              <h3 className="font-black text-xl text-red-500 flex items-center gap-2">
                <Trash2 className="w-6 h-6" />
                Cancelar Pedido Mesa {modalCancelarOpen.mesa.numero}
              </h3>
              <button onClick={() => { setModalCancelarOpen(null); setMotivoCambio(''); setErrorCancelar(''); }} className="p-2 bg-[var(--background)] rounded-lg hover:bg-[var(--card-hover)] text-[var(--muted)] hover:text-[var(--foreground)]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-lg font-bold mb-4 text-[var(--foreground)] text-center">
                ¿Deseas cancelar y eliminar definitivamente este pedido de la Mesa {modalCancelarOpen.mesa.numero}?
              </p>
              <div className="bg-red-500/10 p-4 rounded-xl border border-red-500/20 mb-6">
                <p className="text-sm text-red-400 font-bold mb-2">Esto realizará lo siguiente:</p>
                <ul className="list-disc list-inside text-sm text-red-300/80 space-y-1">
                  <li>Marcará el pedido como Cancelado</li>
                  <li>Liberará la mesa en el plano del salón</li>
                  <li>Registrará el evento en el historial de auditoría</li>
                </ul>
              </div>
              <input 
                type="text" 
                placeholder="Motivo de cancelación (opcional)" 
                value={motivoCambio} 
                onChange={(e) => setMotivoCambio(e.target.value)} 
                className="w-full h-11 bg-[var(--background)] border border-[var(--border)] rounded-xl text-[var(--foreground)] text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all px-4 mb-6" 
              />
              {errorCancelar && (
                <p role="alert" className="text-sm text-red-400 font-bold mb-4 text-center">{errorCancelar}</p>
              )}
              <div className="flex gap-3">
                <button 
                  onClick={() => { setModalCancelarOpen(null); setMotivoCambio(''); setErrorCancelar(''); }} 
                  className="flex-1 btn bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] py-3 font-bold hover:bg-[var(--card-hover)]"
                >
                  Conservar
                </button>
                <button 
                  onClick={() => handleCancelarPedido(modalCancelarOpen.id)} 
                  disabled={isCancelling}
                  className="flex-1 btn bg-red-500 text-white py-3 font-black shadow-lg hover:bg-red-600 active:scale-95 transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-5 h-5" />
                  {isCancelling ? 'CANCELANDO...' : 'SÍ, CANCELAR'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
