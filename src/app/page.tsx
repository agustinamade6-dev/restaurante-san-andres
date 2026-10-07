'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutGrid,
  ChefHat,
  ShieldCheck,
  Lock,
  X,
  Delete,
  Power,
  Activity,
  Utensils
} from 'lucide-react';
import { moduloDePagina } from '@/lib/sesion-vencida';
import { useAhora } from '@/hooks/useAhora';
import { useDialogo } from '@/hooks/useDialogo';

export default function HomePage() {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const dlgPin = useDialogo('Ingresar PIN', () => setModalOpen(false));
  const [targetModule, setTargetModule] = useState<'comandas' | 'cocina' | 'admin' | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Real-time info
  // Reloj de la pantalla: avanza cada segundo; null hasta hidratar (en el servidor no hay hora "actual")
  const ahora = useAhora(1000);
  const now = ahora ? new Date(ahora) : null;
  const [metrics, setMetrics] = useState({
    mesas: { ocupadas: 0, libres: 0 },
    cocina: { preparando: 0 }
  });

  // Fetch metrics periodically
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch('/api/hub-metrics');
        if (res.ok) {
          const data = await res.json();
          setMetrics(data);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcuts
  const handleModuleClick = useCallback((module: 'comandas' | 'cocina' | 'admin') => {
    setTargetModule(module);
    setPin('');
    setError('');
    setModalOpen(true);
  }, []);

  // Llegada desde una sesión vencida (lib/sesion-vencida.ts): reabrir el PIN del módulo donde estaba.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('sesion') !== 'vencida') return;
    window.history.replaceState(null, '', '/');
    const modulo = moduloDePagina(`/${params.get('modulo') ?? ''}`);
    // Excepción intencional: esta página se prerenderiza estática, así que la URL solo se puede leer en el
    // navegador, una vez, después de montar; y desde ahí hay que abrir el modal del PIN con el aviso.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (modulo) handleModuleClick(modulo);
    setError('Tu sesión venció. Ingresá tu PIN de nuevo.');
  }, [handleModuleClick]);

  const handlePinSubmit = async (overridePin?: string) => {
    const finalPin = overridePin || pin;
    if (finalPin.length !== 4) {
      setError('El PIN debe tener 4 dígitos');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: finalPin, module: targetModule })
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/${targetModule}`);
      } else {
        setError(data.error || 'Acceso denegado');
        setPin('');
      }
    } catch {
      setError('Error de conexión');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const addDigit = (digit: string) => {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      setError('');
      if (newPin.length === 4) {
        handlePinSubmit(newPin);
      }
    }
  };

  const removeDigit = () => setPin(prev => prev.slice(0, -1));

  // Atajos de teclado (van después de addDigit/removeDigit, que usan)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!modalOpen) {
        if (e.key === '1') handleModuleClick('comandas');
        if (e.key === '2') handleModuleClick('cocina');
        if (e.key === '3') handleModuleClick('admin');
      } else {
        if (e.key === 'Escape') {
          setModalOpen(false);
        } else if (/^[0-9]$/.test(e.key)) {
          addDigit(e.key);
        } else if (e.key === 'Backspace') {
          removeDigit();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen, handleModuleClick, pin, addDigit, removeDigit]);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-[#0a0f1c] to-[#04060a] relative overflow-hidden select-none">
      {/* Background Texture & Glows */}
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 mix-blend-overlay pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Top Header Bar */}
      <header className="relative z-10 w-full px-8 py-5 flex items-center justify-between border-b border-white/5 bg-black/20 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.3)]">
            <Utensils className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white/90">Restaurante San Andrés</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-[10px] font-bold text-green-400 uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                Servidor Local Activo
              </span>
              <span className="text-[10px] text-white/30 font-mono tracking-wider">v1.2.0-POS</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-2xl font-black tracking-tighter font-mono text-white/90">
              {now ? now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'}
            </div>
            <div className="text-xs font-bold text-white/40 uppercase tracking-widest">
              {now ? now.toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'short' }) : '---'}
            </div>
          </div>
          <div className="h-10 w-[1px] bg-white/10 mx-2"></div>
          <button className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 transition-all text-white/50 active:scale-95">
            <Power className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center py-4 px-6 relative z-10 w-full max-w-7xl mx-auto">
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 w-full">
          
          {/* Card 1: Sala / Comandas */}
          <button 
            onClick={() => handleModuleClick('comandas')} 
            className="group relative flex flex-col text-left h-auto min-h-[340px] rounded-3xl bg-gradient-to-b from-[#111625] to-[#0a0d15] border border-white/5 overflow-hidden transition-all duration-300 hover:border-amber-500/50 hover:shadow-[0_0_40px_rgba(245,158,11,0.15)] hover:-translate-y-2 focus:outline-none"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="p-5 md:p-6 flex-1 flex flex-col relative z-10">
              <div className="flex justify-between items-start mb-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/20 flex items-center justify-center group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all duration-500">
                  <LayoutGrid className="w-8 h-8 text-amber-400" />
                </div>
                <div className="w-8 h-8 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center text-xs font-bold text-white/30 font-mono">1</div>
              </div>
              <h2 className="text-2xl font-black mb-2 text-white/90 tracking-tight">Sala / Comandas</h2>
              <p className="text-white/40 text-xs leading-relaxed mb-4 pr-2">
                Plano interactivo de mesas, toma rápida de comandas táctil, edición de órdenes y control de cuentas.
              </p>
              
              <div className="mt-auto">
                <div className="flex items-center gap-3 bg-black/40 border border-white/5 rounded-xl p-3 mb-4">
                  <Activity className="w-5 h-5 text-amber-500" />
                  <div>
                    <div className="text-[10px] text-white/40 font-bold uppercase tracking-wider mb-0.5">Estado en vivo</div>
                    <div className="text-sm font-black text-amber-400">
                      {metrics.mesas.ocupadas} Ocupadas <span className="text-white/20 mx-2">|</span> <span className="text-green-400">{metrics.mesas.libres} Libres</span>
                    </div>
                  </div>
                </div>
                
                <div className="w-full h-12 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center font-black text-base tracking-wide group-hover:bg-amber-500 group-hover:text-black group-hover:border-amber-400 transition-all duration-300">
                  Acceder a Sala
                </div>
              </div>
            </div>
          </button>

          {/* Card 2: Cocina / KDS */}
          <button 
            onClick={() => handleModuleClick('cocina')} 
            className="group relative flex flex-col text-left h-auto min-h-[340px] rounded-3xl bg-gradient-to-b from-[#111625] to-[#0a0d15] border border-white/5 overflow-hidden transition-all duration-300 hover:border-cyan-500/50 hover:shadow-[0_0_40px_rgba(6,182,212,0.15)] hover:-translate-y-2 focus:outline-none"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="p-5 md:p-6 flex-1 flex flex-col relative z-10">
              <div className="flex justify-between items-start mb-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 border border-cyan-500/20 flex items-center justify-center group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all duration-500">
                  <ChefHat className="w-8 h-8 text-cyan-400" />
                </div>
                <div className="w-8 h-8 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center text-xs font-bold text-white/30 font-mono">2</div>
              </div>
              <h2 className="text-2xl font-black mb-2 text-white/90 tracking-tight">Cocina / KDS</h2>
              <p className="text-white/40 text-xs leading-relaxed mb-4 pr-2">
                Monitor interactivo de comandas (Kitchen Display System). Gestión de tickets, alertas de demoras y despacho.
              </p>
              
              <div className="mt-auto">
                <div className="flex items-center gap-3 bg-black/40 border border-white/5 rounded-xl p-3 mb-4">
                  <Activity className="w-5 h-5 text-cyan-500" />
                  <div>
                    <div className="text-[10px] text-white/40 font-bold uppercase tracking-wider mb-0.5">Carga de Trabajo</div>
                    <div className="text-sm font-black text-cyan-400 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></span>
                      {metrics.cocina.preparando} Comandas en preparación
                    </div>
                  </div>
                </div>
                
                <div className="w-full h-12 rounded-xl bg-cyan-500/10 text-cyan-500 border border-cyan-500/20 flex items-center justify-center font-black text-base tracking-wide group-hover:bg-cyan-500 group-hover:text-black group-hover:border-cyan-400 transition-all duration-300">
                  Abrir Monitor KDS
                </div>
              </div>
            </div>
          </button>

          {/* Card 3: Administración */}
          <button 
            onClick={() => handleModuleClick('admin')} 
            className="group relative flex flex-col text-left h-auto min-h-[340px] rounded-3xl bg-gradient-to-b from-[#111625] to-[#0a0d15] border border-white/5 overflow-hidden transition-all duration-300 hover:border-purple-500/50 hover:shadow-[0_0_40px_rgba(168,85,247,0.15)] hover:-translate-y-2 focus:outline-none"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="p-5 md:p-6 flex-1 flex flex-col relative z-10">
              <div className="flex justify-between items-start mb-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-purple-600/10 border border-purple-500/20 flex items-center justify-center group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] transition-all duration-500">
                  <ShieldCheck className="w-8 h-8 text-purple-400" />
                </div>
                <div className="w-8 h-8 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center text-xs font-bold text-white/30 font-mono">3</div>
              </div>
              <h2 className="text-2xl font-black mb-2 text-white/90 tracking-tight">Administración</h2>
              <p className="text-white/40 text-xs leading-relaxed mb-4 pr-2">
                Panel de control gerencial. Métricas financieras, menú, inventario, costos, caja y auditoría de personal.
              </p>
              
              <div className="mt-auto">
                <div className="flex items-center gap-3 bg-black/40 border border-white/5 rounded-xl p-3 mb-4">
                  <Lock className="w-5 h-5 text-purple-500" />
                  <div>
                    <div className="text-[10px] text-white/40 font-bold uppercase tracking-wider mb-0.5">Nivel de Acceso</div>
                    <div className="text-sm font-black text-purple-400">
                      Requiere PIN Administrador
                    </div>
                  </div>
                </div>
                
                <div className="w-full h-12 rounded-xl bg-purple-500/10 text-purple-500 border border-purple-500/20 flex items-center justify-center font-black text-base tracking-wide group-hover:bg-purple-500 group-hover:text-black group-hover:border-purple-400 transition-all duration-300">
                  Entrar al Backoffice
                </div>
              </div>
            </div>
          </button>

        </div>
      </main>

      {/* PIN Modal / Keypad overlay */}
      {modalOpen && (
        <div {...dlgPin} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-fade-in">
          <div className="w-full max-w-sm transform transition-all animate-scale-in">
            <div className="bg-[#111625] rounded-[32px] border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.5)] p-8 relative">
              
              <button 
                onClick={() => setModalOpen(false)}
                className="absolute top-6 right-6 p-2 text-white/40 hover:text-white bg-white/5 rounded-full transition-colors active:scale-95"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="text-center mb-8 mt-2">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 border border-white/10">
                  <Lock className="w-8 h-8 text-white/60" />
                </div>
                <h2 className="text-2xl font-black mb-1 text-white">Identificación</h2>
                <p className="text-sm font-bold text-white/40 uppercase tracking-widest">
                  Ingreso a {targetModule === 'comandas' ? 'Sala' : targetModule === 'cocina' ? 'Cocina' : 'Admin'}
                </p>
              </div>

              {/* PIN Display */}
              <div className="flex justify-center gap-3 mb-8">
                {[...Array(4)].map((_, i) => {
                  const isActive = i < pin.length;
                  let colorClass = 'bg-white/5 border-white/10 text-transparent';
                  if (isActive) {
                    if (targetModule === 'comandas') colorClass = 'bg-amber-500 border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.5)] scale-110 text-black';
                    else if (targetModule === 'cocina') colorClass = 'bg-cyan-500 border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.5)] scale-110 text-black';
                    else colorClass = 'bg-purple-500 border-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.5)] scale-110 text-white';
                  }
                  
                  return (
                    <div 
                      key={i} 
                      className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black transition-all duration-200 border ${colorClass}`}
                    >
                      {isActive ? '●' : ''}
                    </div>
                  );
                })}
              </div>

              {error && (
                <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold text-center animate-shake">
                  {error}
                </div>
              )}

              {/* Number Pad */}
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                  <button
                    key={num}
                    onClick={() => addDigit(num.toString())}
                    disabled={loading}
                    className="h-20 rounded-2xl bg-white/5 border border-white/10 text-3xl font-black hover:bg-white/10 active:bg-white/20 transition-all disabled:opacity-50 text-white/90"
                  >
                    {num}
                  </button>
                ))}
                <div className="h-20"></div>
                <button
                  onClick={() => addDigit('0')}
                  disabled={loading}
                  className="h-20 rounded-2xl bg-white/5 border border-white/10 text-3xl font-black hover:bg-white/10 active:bg-white/20 transition-all disabled:opacity-50 text-white/90"
                >
                  0
                </button>
                <button
                  onClick={removeDigit}
                  disabled={loading || pin.length === 0}
                  className="h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 active:bg-red-500/20 transition-all disabled:opacity-50 text-white/40"
                >
                  <Delete className="w-8 h-8" />
                </button>
              </div>

              {loading && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm rounded-[32px] flex items-center justify-center z-10">
                  <div className={`w-12 h-12 border-4 rounded-full animate-spin ${
                    targetModule === 'comandas' ? 'border-amber-500/30 border-t-amber-500' :
                    targetModule === 'cocina' ? 'border-cyan-500/30 border-t-cyan-500' :
                    'border-purple-500/30 border-t-purple-500'
                  }`}></div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
