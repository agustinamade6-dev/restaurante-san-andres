'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { formatDate } from '@/lib/formatDate';
import {
  ArrowLeft,
  Search,
  Plus,
  Minus,
  Send,
  MessageSquare,
  X,
  Users,
  CheckCircle2,
  AlertCircle,
  Utensils,
  Coffee,
  Beer,
  History,
  LogOut,
  Settings2,
  Save,
  XCircle,
  Pencil,
  Trash2,
  Banknote,
  CreditCard,
  Receipt,
  Printer,
} from 'lucide-react';
import { useSSE } from '@/hooks/useSSE';
import { enviarJson } from '@/lib/api-cliente';
import { useApi } from '@/hooks/useApi';
import Logo from '@/components/Logo';
import { useAviso } from '@/hooks/useAviso';
import { useEnvio } from '@/hooks/useEnvio';
import { useSesion } from '@/hooks/useSesion';
import { conservarPosiciones } from '@/utils/mesas';
import { documentoImpresion, html, imprimir } from '@/utils/html';
import { formatPesos } from '@/utils/dinero';
import { useDialogo } from '@/hooks/useDialogo';

interface HistorialPedido {
  id: number;
  pedidoId: number;
  accion: string;
  detalle: string;
  motivo: string;
  createdAt: string;
}

interface Producto {
  id: number;
  nombre: string;
  descripcion: string;
  precio: number;
  categoriaId: number;
  disponible: boolean;
  imagen: string;
  categoria: { id: number; nombre: string };
}

// Tickets que devuelve POST /api/checkout/pay (montos en pesos)
interface LineaTicket {
  nombre: string;
  cantidad: number;
  precioUnit: number;
  subtotal: number;
}

interface Ticket {
  tipo: string;
  numeroTicket: string;
  numeroControlInterno?: string;
  fecha: string;
  mesa: number;
  sector?: string;
  items: LineaTicket[];
  subtotal: number;
  propina: number;
  total: number;
  metodoPago: string;
  mensaje?: string;
  restaurante?: string;
  cuit?: string;
  direccion?: string;
  ventaId?: number;
  operadorId?: number;
}

interface Mesa {
  id: number;
  numero: number;
  capacidad: number;
  estado: string;
  sector: string;
  forma: string;
  posX: number;
  posY: number;
  pedidos: Array<{
    id: number;
    estado: string;
    total: number;
    historial: HistorialPedido[];
    items: Array<{ producto: Producto; cantidad: number }>;
  }>;
}

interface ItemComanda {
  productoId: number;
  nombre: string;
  precio: number;
  cantidad: number;
  notas: string;
  imagen: string;
}

interface Categoria {
  id: number;
  nombre: string;
  _count: { productos: number };
}

export default function ComandasPage() {
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const { data: productos, recargar: fetchProductos } = useApi<Producto[]>('/api/productos', []);
  const { data: categorias, recargar: fetchCategorias } = useApi<Categoria[]>('/api/categorias', []);
  const [mesaSeleccionadaId, setMesaSeleccionadaId] = useState<number | null>(null);
  const [modalHistoryId, setModalHistoryId] = useState<number | null>(null);
  const [filtroZona, setFiltroZona] = useState<'todas' | 'salon' | 'barra'>('todas');
  const [categoriaActiva, setCategoriaActiva] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [comanda, setComanda] = useState<ItemComanda[]>([]);
  const [notaItem, setNotaItem] = useState<{ [key: number]: string }>({});
  const [mostrarNotas, setMostrarNotas] = useState<number | null>(null);
  // Un solo envío a la vez por acción: el segundo clic (antes del re-render) se ignora.
  const { ejecutar: ejecutarAccion, ocupado } = useEnvio();
  // El editor de plano guarda con rutas solo ADMIN: se ofrece solo si la sesión de esta terminal es de un admin.
  const { esAdmin } = useSesion();
  const enviando = ocupado('comanda');
  const { aviso: notificacion, mostrar: mostrarAviso } = useAviso<{ msg: string; tipo: string }>();

  const [isEditorMode, setIsEditorMode] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinAdmin, setPinAdmin] = useState('');
  const [mesasBackup, setMesasBackup] = useState<Mesa[]>([]);
  const [mesaEditorOpen, setMesaEditorOpen] = useState<Partial<Mesa> | null>(null);

  // Performance: direct DOM manipulation during drag instead of React state
  const dragRef = useRef<{
    element: HTMLDivElement | null;
    containerRect: DOMRect | null;
    mesaId: number | null;
  }>({ element: null, containerRect: null, mesaId: null });
  const [mesaAEliminar, setMesaAEliminar] = useState<Mesa | null>(null);

  // Checkout / Billing state
  const [showCheckout, setShowCheckout] = useState(false);
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [propina, setPropina] = useState(0);
  const procesandoCobro = ocupado('cobro');
  const [ticketData, setTicketData] = useState<{ ticketCliente: Ticket; ticketInterno: Ticket } | null>(null);
  // Modales: Escape los cierra, el foco entra al abrirlos y vuelve al cerrarlos.
  const dlgMesa = useDialogo('Editar mesa', () => setMesaEditorOpen(null));
  const dlgPinEditor = useDialogo('PIN de administrador', () => {
    setShowPinModal(false);
    setPinAdmin('');
  });
  const dlgEliminar = useDialogo('Eliminar mesa', () => setMesaAEliminar(null));
  const dlgHistorial = useDialogo('Historial de la mesa', () => setModalHistoryId(null));
  const dlgCobro = useDialogo('Cobrar mesa', () => {
    if (procesandoCobro) return; // con el cobro en curso no se cierra: llegarían los comprobantes a un modal cerrado
    setShowCheckout(false);
    setTicketData(null);
    if (ticketData) setMesaSeleccionadaId(null);
  });


  // La mesa abierta y la del historial se guardan por id y se leen de la lista actual,
  // así muestran cada cambio que llega por SSE en vez de una copia del momento en que se abrieron.
  const mesaSeleccionada = mesas.find((m) => m.id === mesaSeleccionadaId) ?? null;
  const modalHistoryOpen = mesas.find((m) => m.id === modalHistoryId) ?? null;

  // Refs para leer el estado actual desde fetchMesas sin recrearlo (lo usa la conexión SSE).
  const editandoPlanoRef = useRef(false);
  const mesaSeleccionadaIdRef = useRef<number | null>(null);
  useEffect(() => {
    editandoPlanoRef.current = isEditorMode;
    mesaSeleccionadaIdRef.current = mesaSeleccionadaId;
  }, [isEditorMode, mesaSeleccionadaId]);

  // Las mesas se piden acá y se guardan en estado local, porque el editor del plano las modifica
  // (arrastre, deshacer, eliminar) antes de guardar.
  const pedirMesas = useCallback(async (): Promise<Mesa[]> => {
    const res = await fetch('/api/mesas').catch(() => {
      throw new Error('No se pudo conectar con el servidor');
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(data)) {
      throw new Error(data?.error || 'No se pudieron cargar las mesas');
    }
    return data;
  }, []);

  const aplicarMesas = useCallback((nuevas: Mesa[]) => {
    // Con el editor abierto se conservan las posiciones que el admin movió y todavía no guardó.
    setMesas((prev) => (editandoPlanoRef.current ? conservarPosiciones(prev, nuevas) : nuevas));
    // La mesa abierta ya no existe (la eliminaron desde otra terminal): volver al plano sin arrastrar su comanda.
    const abierta = mesaSeleccionadaIdRef.current;
    if (abierta !== null && !nuevas.some((m) => m.id === abierta)) {
      setMesaSeleccionadaId(null);
      setComanda([]);
      setNotaItem({});
      setShowCheckout(false);
      setTicketData(null);
      mostrarAviso({ msg: 'La mesa que estaba abierta ya no existe', tipo: 'error' }, 4000);
    }
  }, [setShowCheckout, setTicketData, mostrarAviso]);

  const fetchMesas = useCallback(async () => {
    try {
      aplicarMesas(await pedirMesas());
    } catch (e) {
      // Se conservan las mesas que ya estaban en pantalla.
      mostrarAviso({ msg: (e as Error).message, tipo: 'error' }, 4000);
    }
  }, [pedirMesas, aplicarMesas, mostrarAviso]);

  useEffect(() => {
    let vigente = true;
    pedirMesas()
      .then((data) => {
        if (vigente) setMesas(data);
      })
      .catch((e) => {
        if (!vigente) return;
        mostrarAviso({ msg: (e as Error).message, tipo: 'error' });
      });
    return () => {
      vigente = false;
    };
  }, [pedirMesas, mostrarAviso]);

  // SSE for real-time updates
  useSSE(
    useCallback(() => {
      fetchMesas();
    }, [fetchMesas]),
    // Al volver la conexión: lo que pasó mientras estuvo caída no llegó por SSE.
    useCallback(() => {
      fetchMesas();
      fetchProductos();
      fetchCategorias();
    }, [fetchMesas, fetchProductos, fetchCategorias])
  );

  const productosFiltrados = productos.filter((p) => {
    if (!p.disponible) return false;
    if (categoriaActiva && p.categoriaId !== categoriaActiva) return false;
    if (busqueda && !p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
      return false;
    return true;
  });

  const agregarItem = (producto: Producto) => {
    setComanda((prev) => {
      const existe = prev.find((i) => i.productoId === producto.id);
      if (existe) {
        return prev.map((i) =>
          i.productoId === producto.id
            ? { ...i, cantidad: i.cantidad + 1 }
            : i
        );
      }
      return [
        ...prev,
        {
          productoId: producto.id,
          nombre: producto.nombre,
          precio: producto.precio,
          cantidad: 1,
          notas: '',
          imagen: producto.imagen,
        },
      ];
    });
  };

  const cambiarCantidad = (productoId: number, delta: number) => {
    setComanda((prev) =>
      prev
        .map((i) =>
          i.productoId === productoId
            ? { ...i, cantidad: Math.max(0, i.cantidad + delta) }
            : i
        )
        .filter((i) => i.cantidad > 0)
    );
  };

  const totalComanda = comanda.reduce(
    (sum, item) => sum + item.precio * item.cantidad,
    0
  );

  const enviarComanda = () => ejecutarAccion(async () => {
    if (!mesaSeleccionada || comanda.length === 0) return;
    try {
      const itemsConNotas = comanda.map((item) => ({
        ...item,
        notas: notaItem[item.productoId] || '',
      }));

      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mesaId: mesaSeleccionada.id,
          items: itemsConNotas,
        }),
      });

      if (res.ok) {
        mostrarAviso({ msg: '✅ Comanda enviada a cocina!', tipo: 'success' }, 3000);
        setComanda([]);
        setNotaItem({});
        setMesaSeleccionadaId(null);
        fetchMesas();
      } else {
        // La comanda NO llegó a cocina: el mozo tiene que ver por qué (p. ej., un producto dejó de estar disponible).
        const data = await res.json().catch(() => null);
        mostrarAviso({ msg: `❌ ${data?.error || 'No se pudo enviar la comanda'}`, tipo: 'error' }, 5000);
      }
    } catch {
      mostrarAviso({ msg: '❌ Error al enviar comanda', tipo: 'error' }, 3000);
    }
  }, 'comanda');

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, id: number) => {
    if (!isEditorMode) return;
    // Don't start drag if the click originated from a button (edit/delete toolbar)
    const target = e.target as HTMLElement;
    if (target.closest('button[data-editor-action]')) return;
    e.stopPropagation();
    e.preventDefault();
    
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    
    // Cache the container rect once at drag start (avoid layout thrash per frame)
    const container = el.parentElement;
    dragRef.current = {
      element: el,
      containerRect: container ? container.getBoundingClientRect() : null,
      mesaId: id,
    };
    
    // Visual feedback: disable transitions, promote to GPU layer
    el.style.transition = 'none';
    el.style.willChange = 'left, top';
    el.style.zIndex = '100';
    el.style.filter = 'drop-shadow(0 10px 20px rgba(0,0,0,0.6))';
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const { element, containerRect, mesaId } = dragRef.current;
    if (!isEditorMode || mesaId === null || !element || !containerRect) return;
    
    // Direct DOM mutation — no React re-render, runs at native frame rate
    let x = ((e.clientX - containerRect.left) / containerRect.width) * 100;
    let y = ((e.clientY - containerRect.top) / containerRect.height) * 100;
    x = Math.max(2, Math.min(98, x));
    y = Math.max(4, Math.min(96, y));
    
    element.style.left = `${x}%`;
    element.style.top = `${y}%`;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const { element, containerRect, mesaId } = dragRef.current;
    if (!isEditorMode || mesaId === null) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    
    // Read final position from DOM and sync to React state (single re-render)
    if (element && containerRect) {
      const finalX = ((e.clientX - containerRect.left) / containerRect.width) * 100;
      const finalY = ((e.clientY - containerRect.top) / containerRect.height) * 100;
      const clampedX = Math.max(2, Math.min(98, finalX));
      const clampedY = Math.max(4, Math.min(96, finalY));
      
      // Restore visual properties
      element.style.transition = '';
      element.style.willChange = '';
      element.style.zIndex = '';
      element.style.filter = '';
      
      setMesas(prev => prev.map(m => m.id === mesaId ? { ...m, posX: clampedX, posY: clampedY } : m));
    }
    
    dragRef.current = { element: null, containerRect: null, mesaId: null };
  };

  // Confirma el PIN de un admin sin cambiar la sesión (check-admin-pin responde solo { success }).
  const handleVerifyPin = () => ejecutarAccion(async () => {
    const res = await fetch('/api/auth/check-admin-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pinAdmin })
    }).catch(() => null);
    if (!res) {
      mostrarAviso({ msg: 'No se pudo conectar con el servidor', tipo: 'error' }, 3000);
      return;
    }
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success) {
      setIsEditorMode(true);
      setMesasBackup(JSON.parse(JSON.stringify(mesas))); // backup
      setShowPinModal(false);
      setPinAdmin('');
    } else {
      mostrarAviso({ msg: data?.error || 'PIN inválido o sin permisos', tipo: 'error' }, 3000);
      setPinAdmin('');
    }
  }, 'pin');

  const guardarLayout = () => ejecutarAccion(async () => {
    const res = await fetch('/api/mesas/layout', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mesas: mesas.map(m => ({ id: m.id, posX: m.posX, posY: m.posY })) })
    }).catch(() => null);
    if (!res) {
      mostrarAviso({ msg: 'No se pudo conectar con el servidor: la distribución no se guardó', tipo: 'error' }, 4000);
      return;
    }
    if (res.ok) {
      mostrarAviso({ msg: 'Distribución guardada', tipo: 'success' }, 3000);
      editandoPlanoRef.current = false;
      setIsEditorMode(false);
      fetchMesas();
    } else {
      const data = await res.json().catch(() => null);
      mostrarAviso({ msg: data?.error || 'No se pudo guardar la distribución', tipo: 'error' }, 4000);
    }
  }, 'layout');

  const guardarMesa = () => ejecutarAccion(async () => {
    const error = mesaEditorOpen?.id
      ? await enviarJson(`/api/mesas/${mesaEditorOpen.id}`, 'PATCH', mesaEditorOpen, 'No se pudo actualizar la mesa')
      : await enviarJson('/api/mesas', 'POST', { ...mesaEditorOpen, posX: 50, posY: 50 }, 'No se pudo crear la mesa');
    if (error) {
      mostrarAviso({ msg: error, tipo: 'error' }, 4000);
      return;
    }
    fetchMesas();
    setMesaEditorOpen(null);
  }, 'mesa');

  const solicitarEliminarMesa = (mesa: Mesa) => {
    // Client-side validation: can't delete occupied tables
    if (mesa.estado !== 'libre') {
      mostrarAviso({ msg: 'No se puede eliminar una mesa con pedidos activos o comanda abierta', tipo: 'error' }, 3000);
      return;
    }
    setMesaAEliminar(mesa);
  };

  const confirmarEliminacion = () => ejecutarAccion(async () => {
    if (!mesaAEliminar) return;
    try {
      const res = await fetch(`/api/mesas/${mesaAEliminar.id}`, { method: 'DELETE' });
      if (res.ok) {
        // Reactive local state update — instant visual removal
        setMesas(prev => prev.filter(m => m.id !== mesaAEliminar.id));
        mostrarAviso({ msg: `Mesa ${mesaAEliminar.numero} eliminada correctamente`, tipo: 'success' }, 3000);
      } else {
        const errorData = await res.json().catch(() => null);
        mostrarAviso({ msg: errorData?.error || 'No se pudo eliminar la mesa', tipo: 'error' }, 3000);
      }
    } catch {
      mostrarAviso({ msg: 'Error de conexión al eliminar mesa', tipo: 'error' }, 3000);
    }
    setMesaAEliminar(null);
  }, 'eliminar');
  // Checkout / Cobro
  const procesarCobro = () => ejecutarAccion(async () => {
    if (!mesaSeleccionada || !mesaSeleccionada.pedidos?.[0]) return;
    try {
      const pedido = mesaSeleccionada.pedidos[0];
      const res = await fetch('/api/checkout/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pedidoId: pedido.id,
          mesaId: mesaSeleccionada.id,
          metodoPago,
          propina,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        setTicketData({ ticketCliente: data.ticketCliente, ticketInterno: data.ticketInterno });
        mostrarAviso({ msg: `\u2705 Cobro registrado — Mesa ${mesaSeleccionada.numero} liberada`, tipo: 'success' }, 4000);
        fetchMesas();
      } else {
        mostrarAviso({ msg: data?.error || 'Error al procesar cobro', tipo: 'error' }, 3000);
      }
    } catch {
      mostrarAviso({ msg: 'Error de conexi\u00f3n al procesar cobro', tipo: 'error' }, 3000);
    }
  }, 'cobro');

  const imprimirTicket = (tipo: 'cliente' | 'interno') => {
    if (!ticketData) return;
    const ticket = tipo === 'cliente' ? ticketData.ticketCliente : ticketData.ticketInterno;
    // Todo dato va interpolado en `html`, que lo escapa: un nombre de producto no puede inyectar código.
    const encabezado =
      tipo === 'cliente'
        ? html`<div class="center bold" style="font-size:16px">${ticket.restaurante}</div>
<div class="center">${ticket.cuit}</div>
<div class="center">${ticket.direccion}</div>
<div class="sep"></div>
<div>Ticket: ${ticket.numeroTicket}</div>
<div>Fecha: ${formatDate(ticket.fecha, true)}</div>
<div>Mesa: ${ticket.mesa}</div>`
        : html`<div class="center bold" style="font-size:14px">COMPROBANTE INTERNO</div>
<div class="center">Control: ${ticket.numeroControlInterno}</div>
<div class="sep"></div>
<div>Ticket: ${ticket.numeroTicket}</div>
<div>Fecha: ${formatDate(ticket.fecha, true)}</div>
<div>Mesa: ${ticket.mesa} | Sector: ${ticket.sector}</div>
<div>Venta ID: ${ticket.ventaId}</div>`;
    const items = ticket.items.map(
      (i) => html`<tr><td>${i.cantidad}x ${i.nombre}</td><td style="text-align:right">${formatPesos(i.subtotal)}</td></tr>`
    );
    const pie =
      tipo === 'cliente'
        ? html`<div class="sep"></div><div class="center">${ticket.mensaje}</div>`
        : html`<div class="sep"></div><div style="margin-top:30px;border-top:1px solid #000;text-align:center;padding-top:4px">Firma Cajero</div>`;
    imprimir(
      documentoImpresion(
        'Ticket',
        'body{font-family:monospace;font-size:12px;width:280px;margin:0 auto;padding:10px}table{width:100%;border-collapse:collapse}td{padding:2px 0}.sep{border-top:1px dashed #000;margin:6px 0}.center{text-align:center}.bold{font-weight:bold}.right{text-align:right}',
        html`${encabezado}
<div class="sep"></div><table>${items}</table><div class="sep"></div>
<table><tr><td>Subtotal</td><td class="right">${formatPesos(ticket.subtotal)}</td></tr>
${ticket.propina > 0 && html`<tr><td>Propina</td><td class="right">${formatPesos(ticket.propina)}</td></tr>`}
<tr class="bold"><td>TOTAL</td><td class="right">${formatPesos(ticket.total)}</td></tr></table>
<div class="sep"></div><div>Pago: ${ticket.metodoPago.toUpperCase()}</div>
${pie}`
      )
    );
  };

  // Step 1: Select mesa
  // Notificación flotante: va en las dos vistas (plano de mesas y toma de pedido / cobro).
  const avisoFlotante = notificacion && (
    <div
      role={notificacion.tipo === 'error' ? 'alert' : 'status'}
      className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-xl text-sm font-bold shadow-2xl animate-slide-in flex items-center gap-2 ${
        notificacion.tipo === 'success'
          ? 'bg-[var(--success)] text-white'
          : 'bg-[var(--danger)] text-white'
      }`}
    >
      {notificacion.tipo === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
      {notificacion.msg}
    </div>
  );

  if (!mesaSeleccionada) {
    return (
      <div className="min-h-screen flex flex-col p-4 md:p-6 bg-[var(--background)]">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6 shrink-0">
          <button aria-label="Bloquear terminal"
            onClick={async () => {
              // Aunque el servidor no responda, se vuelve al inicio (la cookie vence sola).
              await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
              window.location.href = '/';
            }}
            className="w-12 h-12 rounded-2xl bg-[var(--card)] border border-[var(--border)] flex items-center justify-center hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-colors shadow-sm text-[var(--muted)] min-w-11 min-h-11"
            title="Bloquear Terminal"
          >
            <LogOut className="w-6 h-6" />
          </button>
          <Logo alto={44} />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Floor Plan — Salón</h1>
            <p className="text-[var(--muted)] text-sm mt-0.5">
              Toque una mesa libre para iniciar una sesión (comanda)
            </p>
          </div>
          {/* Filters and Counters */}
          <div className="ml-auto flex flex-col md:flex-row items-center gap-4">
            {isEditorMode ? (
              <div className="flex bg-neutral-900 rounded-xl border border-amber-500/50 p-1.5 gap-2 shadow-[0_0_15px_rgba(245,158,11,0.2)] animate-fade-in">
                <button onClick={() => setMesaEditorOpen({ numero: mesas.length > 0 ? Math.max(...mesas.map(m => m.numero)) + 1 : 1, capacidad: 4, sector: 'salon', forma: 'round' })} className="px-3 py-1.5 text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 rounded-lg flex items-center gap-1 transition-colors">
                  <Plus className="w-4 h-4" /> Agregar Mesa
                </button>
                <button onClick={guardarLayout} disabled={ocupado('layout')} className="px-3 py-1.5 text-xs font-bold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/50 rounded-lg flex items-center gap-1 transition-colors">
                  <Save className="w-4 h-4" /> Guardar
                </button>
                <button onClick={() => { editandoPlanoRef.current = false; setMesas(mesasBackup); setIsEditorMode(false); fetchMesas(); }} className="px-3 py-1.5 text-xs font-bold bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 border border-rose-500/50 rounded-lg flex items-center gap-1 transition-colors">
                  <XCircle className="w-4 h-4" /> Cancelar
                </button>
              </div>
            ) : (
              <div className="flex bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden shadow-inner">
                <button 
                  onClick={() => setFiltroZona('todas')}
                  className={`px-4 py-2 text-xs font-bold transition-colors ${filtroZona === 'todas' ? 'bg-indigo-500/20 text-indigo-300' : 'text-[var(--muted)] hover:bg-[var(--card-hover)]'}`}
                >
                  Todos los Sectores
                </button>
                <button 
                  onClick={() => setFiltroZona('salon')}
                  className={`px-4 py-2 text-xs font-bold transition-colors border-l border-[var(--border)] ${filtroZona === 'salon' ? 'bg-indigo-500/20 text-indigo-300' : 'text-[var(--muted)] hover:bg-[var(--card-hover)]'}`}
                >
                  Salón Principal
                </button>
                <button 
                  onClick={() => setFiltroZona('barra')}
                  className={`px-4 py-2 text-xs font-bold transition-colors border-l border-[var(--border)] ${filtroZona === 'barra' ? 'bg-indigo-500/20 text-indigo-300' : 'text-[var(--muted)] hover:bg-[var(--card-hover)]'}`}
                >
                  Barra
                </button>
                {esAdmin && (
                <button 
                  onClick={() => setShowPinModal(true)}
                  className={`px-4 py-2 text-xs font-bold transition-colors border-l border-[var(--border)] text-amber-500 hover:bg-amber-500/10 flex items-center gap-1`}
                >
                  <Settings2 className="w-4 h-4" /> Modo Editor
                </button>
                )}
              </div>
            )}
            
            <div className="bg-black/40 px-4 py-2 rounded-xl border border-[var(--border)] shadow-inner flex items-center gap-3">
              <span className="text-xs font-bold tracking-widest text-emerald-400">
                {mesas.filter(m => m.estado === 'libre').length} Libres
              </span>
              <span className="text-neutral-600">|</span>
              <span className="text-xs font-bold tracking-widest text-rose-400">
                {mesas.filter(m => m.estado === 'ocupada').length} Ocupadas
              </span>
            </div>
          </div>
        </div>

        {avisoFlotante}

        {/* Floor Plan Engine Canvas 2D */}
        <div className={`flex-1 bg-zinc-900 rounded-3xl border border-zinc-800 relative shadow-[inset_0_0_100px_rgba(0,0,0,0.5)] min-h-[600px] ${isEditorMode ? 'overflow-visible' : 'overflow-hidden'}`}>
          {/* Subtle Grid Overlay */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
          
          {/* Decorative floor elements */}
          {/* Barra Deck */}
          <div className="absolute left-0 top-0 bottom-0 w-[20%] bg-[#2c1d11]/40 border-r-2 border-amber-900/30 shadow-[4px_0_24px_rgba(0,0,0,0.4)] pointer-events-none">
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.2),transparent)]" />
            <span className="absolute top-6 left-6 text-slate-300 font-semibold tracking-wider text-sm opacity-80">SECTOR BARRA</span>
          </div>
          <div className="absolute top-6 left-[25%] pointer-events-none">
            <span className="text-slate-300 font-semibold tracking-wider text-sm opacity-80">SALÓN PRINCIPAL</span>
          </div>

          {mesas.filter(m => {
            if (filtroZona === 'salon' && m.sector !== 'salon') return false;
            if (filtroZona === 'barra' && m.sector !== 'barra') return false;
            return true;
          }).map((mesa) => {
            const isOcupada = mesa.estado === 'ocupada';
            const total = mesa.pedidos.length > 0 ? mesa.pedidos[0].total : 0;
            
            // Colores y texturas (Madera noble para redondas, Metal slate para barra)
            let bgTable = 'bg-gradient-to-br from-[#4a3219] to-[#2a1b12] drop-shadow-2xl border-[#1f1208]'; 
            let innerSurface = 'bg-gradient-to-br from-[#3e2719] to-[#2a1a10]'; 
            let ringClass = '';

            // Anillos sutiles de estado
            if (mesa.estado === 'libre') {
              ringClass = 'ring-2 ring-emerald-500/80 shadow-[0_4px_20px_rgba(16,185,129,0.15)]';
            } else if (mesa.estado === 'ocupada') {
              ringClass = 'ring-2 ring-rose-500/90 shadow-[0_4px_20px_rgba(225,29,72,0.25)]';
            } else if (mesa.estado === 'esperando') {
              ringClass = 'ring-2 ring-amber-500/90 shadow-[0_4px_20px_rgba(245,158,11,0.25)]';
            }

            // Geometría y sillas
            let shapeClass = 'w-24 h-24 rounded-2xl'; // square
            let innerShapeClass = 'w-20 h-20 rounded-xl';
            let chairElements = null;
            
            if (mesa.forma === 'round') {
              shapeClass = 'w-[6.5rem] h-[6.5rem] rounded-full';
              innerShapeClass = 'w-24 h-24 rounded-full';
              // Sillas para 4 (top, bottom, left, right)
              chairElements = (
                <>
                  <div className="absolute -top-3 w-8 h-3 rounded-t-full bg-slate-700/80 border border-slate-600/50 shadow-sm" />
                  <div className="absolute -bottom-3 w-8 h-3 rounded-b-full bg-slate-700/80 border border-slate-600/50 shadow-sm" />
                  <div className="absolute -left-3 w-3 h-8 rounded-l-full bg-slate-700/80 border border-slate-600/50 shadow-sm" />
                  <div className="absolute -right-3 w-3 h-8 rounded-r-full bg-slate-700/80 border border-slate-600/50 shadow-sm" />
                </>
              );
            }
            if (mesa.forma === 'tall-bar') {
              shapeClass = 'w-16 h-32 rounded-xl';
              innerShapeClass = 'w-12 h-28 rounded-lg';
              bgTable = 'bg-gradient-to-br from-[#334155] to-[#1e293b] drop-shadow-2xl border-[#0f172a]'; 
              innerSurface = 'bg-gradient-to-br from-[#475569] to-[#334155]';
              chairElements = (
                <>
                  <div className="absolute -left-3 top-4 w-3 h-6 rounded-l-full bg-slate-800 border border-slate-700 shadow-sm" />
                  <div className="absolute -right-3 top-4 w-3 h-6 rounded-r-full bg-slate-800 border border-slate-700 shadow-sm" />
                  <div className="absolute -left-3 bottom-4 w-3 h-6 rounded-l-full bg-slate-800 border border-slate-700 shadow-sm" />
                  <div className="absolute -right-3 bottom-4 w-3 h-6 rounded-r-full bg-slate-800 border border-slate-700 shadow-sm" />
                </>
              );
            }

            return (
              <div
                key={mesa.id}
                onClick={() => !isEditorMode && setMesaSeleccionadaId(mesa.id)}
                onPointerDown={isEditorMode ? (e) => handlePointerDown(e, mesa.id) : undefined}
                onPointerMove={isEditorMode ? handlePointerMove : undefined}
                onPointerUp={isEditorMode ? handlePointerUp : undefined}
                onPointerCancel={isEditorMode ? handlePointerUp : undefined}
                style={{
                  left: `${mesa.posX}%`,
                  top: `${mesa.posY}%`,
                  transform: 'translate(-50%, -50%)',
                  touchAction: isEditorMode ? 'none' : 'auto'
                }}
                className={`absolute flex flex-col items-center justify-center border-b-[4px] border-r-2 group
                  ${shapeClass} ${bgTable} ${ringClass}
                  ${isEditorMode 
                    ? 'cursor-grab active:cursor-grabbing hover:ring-4 hover:ring-amber-500 z-40' 
                    : `transition-all duration-300 cursor-pointer hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(0,0,0,0.5)] z-10 hover:z-30`
                  }
                `}
              >
                {isEditorMode && (
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex gap-1.5 bg-black/95 rounded-xl p-1.5 z-[60] border border-neutral-600 shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto">
                    <button aria-label={`Editar mesa ${mesa.numero}`} 
                      data-editor-action="edit"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); setMesaEditorOpen(mesa); }} 
                      className="p-2 hover:bg-blue-500/20 rounded-lg text-blue-400 hover:text-blue-300 transition-colors pointer-events-auto min-w-11 min-h-11" 
                      title="Editar Mesa"
                    >
                      <Pencil className="w-4 h-4 pointer-events-none" />
                    </button>
                    <button aria-label={`Eliminar mesa ${mesa.numero}`} 
                      data-editor-action="delete"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); solicitarEliminarMesa(mesa); }} 
                      className="p-2 hover:bg-red-500/20 rounded-lg text-red-400 hover:text-red-300 transition-colors pointer-events-auto min-w-11 min-h-11" 
                      title="Eliminar Mesa"
                    >
                      <Trash2 className="w-4 h-4 pointer-events-none" />
                    </button>
                  </div>
                )}
                {chairElements}
                {/* Superficie interior (mantel/tabla) */}
                <div className={`flex flex-col items-center justify-center relative w-full h-full ${innerShapeClass} ${innerSurface} shadow-[inset_0_2px_10px_rgba(0,0,0,0.3)] z-10`}>
                  
                  {/* Caballete de número acrílico */}
                  <div className="absolute z-20 bg-gradient-to-b from-white to-neutral-200 border border-neutral-300 rounded shadow-[0_4px_10px_rgba(0,0,0,0.4)] w-9 h-9 flex items-center justify-center transform -translate-y-0.5">
                    <span className="text-black font-black text-xl drop-shadow-sm">{mesa.numero}</span>
                  </div>
                </div>

                {/* Cápsula de ocupación y monto */}
                {isOcupada && (
                  <div className="absolute -bottom-5 z-40 bg-neutral-900/95 backdrop-blur-md px-3 py-1.5 rounded-full border border-neutral-700 shadow-xl flex items-center gap-2 whitespace-nowrap group-hover:scale-110 transition-transform">
                    <Users className="w-3 h-3 text-neutral-400" />
                    <span className="text-xs font-bold text-white">{mesa.capacidad} pers.</span>
                    {total > 0 && (
                      <>
                        <span className="text-neutral-500 text-[10px]">●</span>
                        <span className="text-xs font-black text-green-400">{formatPesos(total)}</span>
                      </>
                    )}
                  </div>
                )}

                {/* History button if occupied and has history */}
                {isOcupada && mesa.pedidos?.[0]?.historial?.length > 0 && (
                  <button aria-label={`Historial de la mesa ${mesa.numero}`} 
                    onClick={(e) => { e.stopPropagation(); setModalHistoryId(mesa.id); }}
                    className="absolute -top-3 -right-3 z-40 bg-purple-600 hover:bg-purple-500 text-white p-1.5 rounded-full shadow-lg border border-purple-400 transition-transform hover:scale-110 min-w-11 min-h-11"
                    title="Ver Historial"
                  >
                    <History className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

      {/* Editor/Crear Mesa Modal */}
      {mesaEditorOpen && (
        <div {...dlgMesa} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-[var(--card)] w-full max-w-sm rounded-2xl border border-[var(--border)] shadow-2xl flex flex-col">
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-amber-500" />
                {mesaEditorOpen.id ? 'Editar Mesa' : 'Nueva Mesa'}
              </h2>
              <button aria-label="Cerrar" onClick={() => setMesaEditorOpen(null)} className="p-2 hover:bg-[var(--card-hover)] rounded-lg transition-colors min-w-11 min-h-11">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-1.5 block">Número de Mesa</label>
                <input type="number" className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-white outline-none focus:border-amber-500" value={mesaEditorOpen.numero || ''} onChange={e => setMesaEditorOpen({...mesaEditorOpen, numero: parseInt(e.target.value) || 0})} />
              </div>
              <div>
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-1.5 block">Capacidad (pers.)</label>
                <input type="number" className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-white outline-none focus:border-amber-500" value={mesaEditorOpen.capacidad || ''} onChange={e => setMesaEditorOpen({...mesaEditorOpen, capacidad: parseInt(e.target.value) || 0})} />
              </div>
              <div>
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-1.5 block">Sector</label>
                <select className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-white outline-none focus:border-amber-500" value={mesaEditorOpen.sector || 'salon'} onChange={e => setMesaEditorOpen({...mesaEditorOpen, sector: e.target.value})}>
                  <option value="salon">Salón Principal</option>
                  <option value="barra">Sector Barra</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-1.5 block">Formato</label>
                <select className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-white outline-none focus:border-amber-500" value={mesaEditorOpen.forma || 'round'} onChange={e => setMesaEditorOpen({...mesaEditorOpen, forma: e.target.value})}>
                  <option value="round">Redonda</option>
                  <option value="square">Cuadrada</option>
                  <option value="tall-bar">Barra Alta</option>
                </select>
              </div>
            </div>
            <div className="p-4 border-t border-[var(--border)] flex gap-3">
              <button onClick={() => setMesaEditorOpen(null)} className="flex-1 btn btn-secondary py-2.5">Cancelar</button>
              <button onClick={guardarMesa} disabled={ocupado('mesa')} className="flex-1 btn btn-primary py-2.5 bg-amber-500 hover:bg-amber-400 text-black border-none">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* PIN Admin Modal for Editor Mode */}
      {showPinModal && (
        <div {...dlgPinEditor} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-[var(--card)] w-full max-w-sm rounded-2xl border border-[var(--border)] shadow-2xl flex flex-col p-6">
            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
              <Settings2 className="w-5 h-5 text-amber-500" />
              Autorización Requerida
            </h2>
            <p className="text-sm text-[var(--muted)] mb-6">Ingrese PIN de Administrador para activar el Modo Editor de mesas.</p>
            <input 
              type="password" 
              maxLength={4} 
              autoFocus
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-center text-3xl tracking-[1em] text-white outline-none focus:border-amber-500 font-mono shadow-inner mb-6" 
              value={pinAdmin} 
              onChange={e => setPinAdmin(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => { if (e.key === 'Enter' && pinAdmin.length === 4) handleVerifyPin() }}
            />
            <div className="flex gap-3">
              <button onClick={() => { setShowPinModal(false); setPinAdmin(''); }} className="flex-1 btn btn-secondary">Cancelar</button>
              <button onClick={handleVerifyPin} disabled={pinAdmin.length !== 4 || ocupado('pin')} className="flex-1 btn btn-primary bg-amber-500 hover:bg-amber-400 text-black border-none disabled:opacity-50">Acceder</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {mesaAEliminar && (
        <div {...dlgEliminar} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-[var(--card)] w-full max-w-sm rounded-2xl border border-red-500/30 shadow-2xl flex flex-col overflow-hidden">
            <div className="p-5 border-b border-[var(--border)] bg-red-500/5">
              <h2 className="text-lg font-bold flex items-center gap-2 text-red-400">
                <Trash2 className="w-5 h-5" />
                Eliminar Mesa {mesaAEliminar.numero}
              </h2>
            </div>
            <div className="p-5">
              <p className="text-sm text-[var(--muted)] mb-4">¿Estás seguro de que deseas eliminar la <strong className="text-white">Mesa {mesaAEliminar.numero}</strong> del salón? Esta acción no se puede deshacer.</p>
              <div className="bg-neutral-900/80 rounded-xl p-3 border border-neutral-800 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                  <span className="font-black text-red-400">{mesaAEliminar.numero}</span>
                </div>
                <div className="text-xs">
                  <p className="text-neutral-400">Capacidad: <span className="text-white font-bold">{mesaAEliminar.capacidad} pers.</span></p>
                  <p className="text-neutral-400">Sector: <span className="text-white font-bold">{mesaAEliminar.sector === 'salon' ? 'Salón Principal' : 'Barra'}</span></p>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-[var(--border)] flex gap-3">
              <button onClick={() => setMesaAEliminar(null)} className="flex-1 btn btn-secondary py-2.5">Cancelar</button>
              <button onClick={confirmarEliminacion} disabled={ocupado('eliminar')} className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors">
                <Trash2 className="w-4 h-4" />
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      </div>
    );
  }

  // Step 2: Build comanda
  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {avisoFlotante}
      {/* Left: Product catalog */}
      <div className="flex-1 p-4 md:p-6 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button aria-label="Volver al plano de mesas"
            onClick={() => {
              setMesaSeleccionadaId(null);
              setComanda([]);
              setNotaItem({});
            }}
            className="w-10 h-10 rounded-xl bg-[var(--card)] border border-[var(--border)] flex items-center justify-center hover:bg-[var(--card-hover)] transition-colors min-w-11 min-h-11"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">
              Mesa {mesaSeleccionada.numero}
            </h1>
            <p className="text-[var(--muted)] text-sm">
              Armá la comanda y enviá a cocina
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar producto..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full h-11 bg-[var(--card)] border border-[var(--border)] rounded-xl text-[var(--foreground)] text-sm focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)] outline-none transition-all pl-11 pr-4 shadow-sm"
          />
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          <button
            onClick={() => setCategoriaActiva(null)}
            className={`btn btn-sm whitespace-nowrap ${
              !categoriaActiva ? 'btn-primary' : 'btn-secondary'
            }`}
          >
            Todos
          </button>
          {categorias.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategoriaActiva(cat.id)}
              className={`btn btn-sm whitespace-nowrap ${
                categoriaActiva === cat.id ? 'btn-primary' : 'btn-secondary'
              }`}
            >
              {cat.nombre}
            </button>
          ))}
        </div>

        {/* Products grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {productosFiltrados.map((producto) => {
            const enComanda = comanda.find(
              (i) => i.productoId === producto.id
            );
            return (
              <button
                key={producto.id}
                onClick={() => agregarItem(producto)}
                className={`glass-card flex flex-col text-left transition-all hover:border-amber-500/50 active:scale-[0.98] overflow-hidden group ${
                  enComanda ? 'border-amber-500/50 ring-2 ring-amber-500/20' : ''
                }`}
              >
                <div className="relative w-full h-32 bg-neutral-800 shrink-0 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={producto.imagen} alt={producto.nombre} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
                  <div className="hidden absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-900 flex items-center justify-center text-neutral-600">
                    {producto.categoria?.nombre?.toLowerCase().includes('bebida') ? <Beer className="w-10 h-10" /> : producto.categoria?.nombre?.toLowerCase().includes('caf') ? <Coffee className="w-10 h-10" /> : <Utensils className="w-10 h-10" />}
                  </div>
                  {enComanda && (
                    <div className="absolute top-2 right-2 w-8 h-8 rounded-full bg-amber-500 text-black text-sm font-bold flex items-center justify-center shadow-lg border-2 border-black z-10">
                      {enComanda.cantidad}
                    </div>
                  )}
                  <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-md px-2 py-1 rounded text-amber-400 font-bold text-sm border border-white/10 shadow-sm z-10">
                    {formatPesos(producto.precio)}
                  </div>
                </div>
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-sm line-clamp-1 group-hover:text-amber-400 transition-colors">
                      {producto.nombre}
                    </h3>
                    <p className="text-xs text-[var(--muted)] line-clamp-2 mt-1 leading-snug">
                      {producto.descripcion}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Current order / POS Receipt */}
      <div className="w-full md:w-[400px] bg-neutral-900 border-l-4 border-black flex flex-col shadow-2xl relative z-20">
        <div className="p-5 border-b-2 border-dashed border-neutral-700 bg-neutral-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Utensils className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h2 className="font-black text-xl uppercase tracking-tight text-white">Comanda</h2>
              <p className="text-xs font-bold text-amber-500 uppercase tracking-widest mt-0.5">Mesa {mesaSeleccionada.numero} • {mesaSeleccionada.capacidad} pers.</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-neutral-900">
          {/* Existente (Ya Ordenado) */}
          {mesaSeleccionada.pedidos?.length > 0 && mesaSeleccionada.pedidos[0].items.length > 0 && (
            <div className="mb-6 space-y-3">
              <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-widest border-b border-neutral-700 pb-2">Ya ordenado</h3>
              {mesaSeleccionada.pedidos[0].items.map((item, i: number) => (
                <div key={`exist-${i}`} className="flex justify-between items-center bg-black/30 rounded-lg p-3 border border-neutral-800">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-neutral-800 text-white flex items-center justify-center font-bold text-sm">
                      {item.cantidad}
                    </span>
                    <span className="font-bold text-white text-sm">{item.producto?.nombre || 'Producto'}</span>
                  </div>
                  <span className="font-mono text-amber-500 font-bold text-sm">{formatPesos((item.producto?.precio || 0) * item.cantidad)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center px-2 py-1 text-sm font-bold text-neutral-400">
                <span>Subtotal Ordenado:</span>
                <span className="font-mono text-white">{formatPesos(mesaSeleccionada.pedidos[0].total)}</span>
              </div>
            </div>
          )}

          {/* Nuevos (Comanda actual) */}
          {comanda.length === 0 && (!mesaSeleccionada.pedidos?.length || mesaSeleccionada.pedidos[0].items.length === 0) ? (
            <div className="flex flex-col items-center justify-center h-48 text-[var(--muted)]">
              <AlertCircle className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">Agregá productos del menú</p>
            </div>
          ) : comanda.length > 0 ? (
            <div className="space-y-4">
              {mesaSeleccionada.pedidos?.length > 0 && mesaSeleccionada.pedidos[0].items.length > 0 && (
                <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest border-b border-emerald-900/50 pb-2">Nuevos Productos</h3>
              )}
              {comanda.map((item) => (
                <div
                  key={item.productoId}
                  className="bg-black/40 rounded-xl p-3 border border-neutral-800 relative group transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative w-14 h-14 rounded-lg bg-neutral-800 shrink-0 overflow-hidden border border-neutral-700">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.imagen} alt={item.nombre} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
                      <div className="hidden absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-900 flex items-center justify-center text-neutral-600">
                        <Utensils className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 py-1">
                      <p className="font-black text-[15px] truncate text-white leading-tight">
                        {item.nombre}
                      </p>
                      <p className="text-amber-500 font-black font-mono mt-1 text-sm">
                        {formatPesos(item.precio * item.cantidad)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 bg-black/50 p-1 rounded-lg border border-neutral-800">
                      <button aria-label={`Quitar uno de ${item.nombre}`}
                        onClick={() => cambiarCantidad(item.productoId, -1)}
                        className="w-9 h-9 rounded-md bg-neutral-800 hover:bg-red-500/20 border border-neutral-700 hover:border-red-500/50 hover:text-red-400 transition-all text-white flex items-center justify-center min-w-11 min-h-11"
                      >
                        <Minus className="w-4 h-4 font-bold" />
                      </button>
                      <span className="w-8 text-center font-black text-lg text-white">
                        {item.cantidad}
                      </span>
                      <button aria-label={`Agregar uno de ${item.nombre}`}
                        onClick={() => cambiarCantidad(item.productoId, 1)}
                        className="w-9 h-9 rounded-md bg-neutral-800 hover:bg-green-500/20 border border-neutral-700 hover:border-green-500/50 hover:text-green-400 transition-all text-white flex items-center justify-center min-w-11 min-h-11"
                      >
                        <Plus className="w-4 h-4 font-bold" />
                      </button>
                    </div>
                  </div>

                  {/* Notes toggle */}
                  <div className="mt-3 border-t border-dashed border-neutral-800 pt-3">
                    {mostrarNotas === item.productoId ? (
                      <div className="flex items-center gap-2 animate-fade-in bg-black/40 p-1.5 rounded-lg border border-neutral-800 focus-within:border-amber-500/50">
                        <input
                          type="text"
                          placeholder="Instrucciones para cocina..."
                          value={notaItem[item.productoId] || ''}
                          onChange={(e) =>
                            setNotaItem((prev) => ({
                              ...prev,
                              [item.productoId]: e.target.value,
                            }))
                          }
                          className="bg-transparent border-none text-sm text-white w-full px-2 py-1 focus:outline-none placeholder:text-neutral-600"
                          autoFocus
                        />
                        <button aria-label="Cerrar nota"
                          onClick={() => setMostrarNotas(null)}
                          className="shrink-0 p-2 hover:bg-neutral-800 rounded-md transition-colors min-w-11 min-h-11"
                        >
                          <X className="w-4 h-4 text-neutral-400 hover:text-white" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setMostrarNotas(item.productoId)}
                        className="flex items-center gap-2 text-xs font-bold text-neutral-500 hover:text-amber-500 transition-colors w-full uppercase tracking-wider"
                      >
                        <MessageSquare className="w-4 h-4" />
                        {notaItem[item.productoId] ? (
                          <span className="text-amber-500/90 normal-case italic truncate">{notaItem[item.productoId]}</span>
                        ) : (
                          'Agregar nota'
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Footer with total and send */}
        <div className="p-5 border-t-2 border-dashed border-neutral-700 bg-black">
          {comanda.length > 0 && (
            <div className="flex items-center justify-between mb-5">
              <span className="text-neutral-400 font-bold uppercase tracking-widest text-sm">Total a Enviar</span>
              <span className="text-3xl font-black text-emerald-500 font-mono tracking-tighter">
                {formatPesos(totalComanda)}
              </span>
            </div>
          )}
          {mesaSeleccionada.pedidos?.length > 0 && mesaSeleccionada.pedidos[0].items.length > 0 && comanda.length === 0 && (
            <div className="flex items-center justify-between mb-5">
              <span className="text-neutral-400 font-bold uppercase tracking-widest text-sm">Total Consumo</span>
              <span className="text-3xl font-black text-amber-500 font-mono tracking-tighter">
                {formatPesos(mesaSeleccionada.pedidos[0].total)}
              </span>
            </div>
          )}

          <button
            onClick={enviarComanda}
            disabled={comanda.length === 0 || enviando}
            className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 disabled:from-neutral-800 disabled:to-neutral-800 disabled:text-neutral-500 text-white py-4 rounded-xl font-black text-lg flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(34,197,94,0.3)] disabled:shadow-none active:scale-[0.98]"
          >
            {enviando ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Send className="w-5 h-5" />
                ENVIAR A COCINA
              </>
            )}
          </button>

          {/* Cobrar button — only if mesa has active pedidos */}
          {mesaSeleccionada.pedidos?.length > 0 && mesaSeleccionada.pedidos[0]?.estado !== 'pagado' && (
            <button
              onClick={() => {
                setShowCheckout(true);
                setMetodoPago('efectivo');
                setPropina(0);
                setTicketData(null);
              }}
              className="w-full mt-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black py-4 rounded-xl font-black text-lg flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)] active:scale-[0.98]"
            >
              <Banknote className="w-5 h-5" />
              COBRAR MESA
            </button>
          )}
        </div>
      </div>

      {/* History Modal */}
      {modalHistoryOpen && modalHistoryOpen.pedidos?.[0] && (
        <div {...dlgHistorial} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-[var(--card)] w-full max-w-lg rounded-2xl border border-[var(--border)] shadow-2xl flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <History className="w-5 h-5 text-purple-400" />
                Historial Mesa {modalHistoryOpen.numero}
              </h2>
              <button aria-label="Cerrar" onClick={() => setModalHistoryId(null)} className="p-2 hover:bg-[var(--card-hover)] rounded-lg transition-colors min-w-11 min-h-11">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {modalHistoryOpen.pedidos[0].historial && modalHistoryOpen.pedidos[0].historial.length > 0 ? (
                modalHistoryOpen.pedidos[0].historial.map((log) => (
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

      {/* Checkout / Cobro Modal */}
      {/* Después de cobrar la mesa queda sin pedido, pero los comprobantes tienen que seguir a la vista. */}
      {showCheckout && mesaSeleccionada && (ticketData || mesaSeleccionada.pedidos?.[0]) && (
        <div {...dlgCobro} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="bg-[var(--card)] w-full max-w-lg rounded-2xl border border-[var(--border)] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-[var(--border)] bg-gradient-to-r from-amber-500/10 to-transparent">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-amber-500" />
                  {ticketData ? 'Comprobantes de Pago' : `Cobrar Mesa ${mesaSeleccionada.numero}`}
                </h2>
                <button aria-label="Cerrar" onClick={() => { setShowCheckout(false); setTicketData(null); if (ticketData) { setMesaSeleccionadaId(null); } }} className="p-2 hover:bg-[var(--card-hover)] rounded-lg transition-colors min-w-11 min-h-11">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {!ticketData ? (
              /* Payment form */
              <>
                <div className="p-5 overflow-y-auto flex-1 space-y-5">
                  {/* Items summary */}
                  <div>
                    <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Detalle de Consumo</h3>
                    <div className="space-y-2">
                      {mesaSeleccionada.pedidos[0].items.map((item, i) => (
                        <div key={i} className="flex justify-between items-center text-sm bg-black/30 rounded-lg px-3 py-2 border border-neutral-800">
                          <span className="font-semibold">{item.cantidad}x {item.producto.nombre}</span>
                          <span className="font-bold text-amber-400 font-mono">{formatPesos(item.producto.precio * item.cantidad)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Payment method */}
                  <div>
                    <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Método de Pago</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { value: 'efectivo', label: 'Efectivo', icon: Banknote },
                        { value: 'tarjeta', label: 'Tarjeta', icon: CreditCard },
                        { value: 'transferencia', label: 'Transferencia', icon: Receipt },
                        { value: 'dividido', label: 'Dividido', icon: Users },
                      ].map((m) => (
                        <button
                          key={m.value}
                          onClick={() => setMetodoPago(m.value)}
                          className={`p-3 rounded-xl border text-sm font-bold flex items-center gap-2 transition-all ${
                            metodoPago === m.value
                              ? 'bg-amber-500/20 border-amber-500 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                              : 'bg-black/30 border-neutral-800 text-neutral-400 hover:border-neutral-600'
                          }`}
                        >
                          <m.icon className="w-4 h-4" />
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Propina */}
                  <div>
                    <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Propina (opcional)</h3>
                    <div className="flex gap-2">
                      {[0, 500, 1000, 2000].map((val) => (
                        <button
                          key={val}
                          onClick={() => setPropina(val)}
                          className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-all ${
                            propina === val
                              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                              : 'bg-black/30 border-neutral-800 text-neutral-400 hover:border-neutral-600'
                          }`}
                        >
                          {val === 0 ? 'Sin' : formatPesos(val)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Total */}
                  <div className="bg-black/50 rounded-xl p-4 border border-neutral-700">
                    <div className="flex justify-between text-sm text-neutral-400 mb-1">
                      <span>Subtotal</span>
                      <span className="font-mono">{formatPesos(mesaSeleccionada.pedidos[0].total)}</span>
                    </div>
                    {propina > 0 && (
                      <div className="flex justify-between text-sm text-emerald-400 mb-1">
                        <span>Propina</span>
                        <span className="font-mono">+{formatPesos(propina)}</span>
                      </div>
                    )}
                    <div className="border-t border-neutral-700 mt-2 pt-2 flex justify-between">
                      <span className="font-bold text-lg">TOTAL</span>
                      <span className="font-black text-2xl text-amber-500 font-mono">
                        {formatPesos(mesaSeleccionada.pedidos[0].total + propina)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 border-t border-[var(--border)] flex gap-3">
                  <button onClick={() => setShowCheckout(false)} className="flex-1 btn btn-secondary py-3">Cancelar</button>
                  <button
                    onClick={procesarCobro}
                    disabled={procesandoCobro}
                    className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(245,158,11,0.3)]"
                  >
                    {procesandoCobro ? (
                      <span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    ) : (
                      <>
                        <Banknote className="w-5 h-5" />
                        Confirmar Cobro
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              /* Ticket preview after payment */
              <>
                <div className="p-5 overflow-y-auto flex-1 space-y-4">
                  <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <span className="text-sm font-bold text-emerald-400">Pago registrado correctamente</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Ticket Cliente */}
                    <div className="bg-white text-black rounded-xl p-4 text-xs font-mono space-y-1">
                      <p className="text-center font-bold text-sm">{ticketData.ticketCliente.restaurante}</p>
                      <p className="text-center text-[10px] text-neutral-500">{ticketData.ticketCliente.cuit}</p>
                      <div className="border-t border-dashed border-neutral-300 my-2" />
                      <p>Ticket: {ticketData.ticketCliente.numeroTicket}</p>
                      <p>Mesa: {ticketData.ticketCliente.mesa}</p>
                      <p>{formatDate(ticketData.ticketCliente.fecha, true)}</p>
                      <div className="border-t border-dashed border-neutral-300 my-2" />
                      {ticketData.ticketCliente.items.map((it, i: number) => (
                        <div key={i} className="flex justify-between"><span>{it.cantidad}x {it.nombre}</span><span>{formatPesos(it.subtotal)}</span></div>
                      ))}
                      <div className="border-t border-dashed border-neutral-300 my-2" />
                      <div className="flex justify-between font-bold text-sm"><span>TOTAL</span><span>{formatPesos(ticketData.ticketCliente.total)}</span></div>
                      <p className="text-center text-[9px] text-neutral-400 mt-2">{ticketData.ticketCliente.mensaje}</p>
                    </div>

                    {/* Ticket Interno */}
                    <div className="bg-neutral-100 text-black rounded-xl p-4 text-xs font-mono space-y-1">
                      <p className="text-center font-bold text-sm">CONTROL INTERNO</p>
                      <p className="text-center text-[10px] text-neutral-500">{ticketData.ticketInterno.numeroControlInterno}</p>
                      <div className="border-t border-dashed border-neutral-300 my-2" />
                      <p>Ticket: {ticketData.ticketInterno.numeroTicket}</p>
                      <p>Mesa: {ticketData.ticketInterno.mesa} | {ticketData.ticketInterno.sector}</p>
                      <p>{formatDate(ticketData.ticketInterno.fecha, true)}</p>
                      <div className="border-t border-dashed border-neutral-300 my-2" />
                      {ticketData.ticketInterno.items.map((it, i: number) => (
                        <div key={i} className="flex justify-between"><span>{it.cantidad}x {it.nombre}</span><span>{formatPesos(it.subtotal)}</span></div>
                      ))}
                      <div className="border-t border-dashed border-neutral-300 my-2" />
                      <div className="flex justify-between font-bold text-sm"><span>TOTAL</span><span>{formatPesos(ticketData.ticketInterno.total)}</span></div>
                      <p className="text-center text-[9px] text-neutral-400 mt-2">Pago: {ticketData.ticketInterno.metodoPago.toUpperCase()}</p>
                      {ticketData.ticketInterno.operadorId && (
                        <p className="text-center text-[9px] text-neutral-400 mt-1">Cajero/Autorizó: Op #{ticketData.ticketInterno.operadorId}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-4 border-t border-[var(--border)] flex gap-3">
                  <button onClick={() => imprimirTicket('cliente')} className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors">
                    <Printer className="w-4 h-4" /> Ticket Cliente
                  </button>
                  <button onClick={() => imprimirTicket('interno')} className="flex-1 py-3 bg-neutral-700 hover:bg-neutral-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors">
                    <Printer className="w-4 h-4" /> Comp. Interno
                  </button>
                </div>
                <div className="px-4 pb-4">
                  <button onClick={() => { setShowCheckout(false); setTicketData(null); setMesaSeleccionadaId(null); }} className="w-full btn btn-secondary py-3">
                    Cerrar y Volver al Salón
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}


    </div>
  );
}
