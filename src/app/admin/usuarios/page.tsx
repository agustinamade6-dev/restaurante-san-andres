'use client';

import { useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAviso } from '@/hooks/useAviso';
import ErrorDeCarga from '@/components/ErrorDeCarga';
import { User, CheckCircle2, AlertTriangle, Shield, KeyRound, Eye, EyeOff, X, Delete } from 'lucide-react';

interface Usuario {
  id: number;
  nombre: string;
  pin: string;
  rol: string;
  activo: boolean;
}

export default function UsuariosPage() {
  const { data: usuarios, cargando: loading, error: errorCarga, recargar: fetchUsuarios } = useApi<Usuario[]>('/api/admin/usuarios', []);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Usuario | null>(null);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Toast State
  const { aviso: toastMessage, mostrar: mostrarToast } = useAviso<string>();

  const openPinModal = (user: Usuario) => {
    setSelectedUser(user);
    setNewPin('');
    setConfirmPin('');
    setError('');
    setShowPin(false);
    setModalOpen(true);
  };

  const closePinModal = () => {
    setModalOpen(false);
    setSelectedUser(null);
  };

  const addDigit = (digit: string) => {
    setError('');
    // If we're focusing on confirmPin, maybe append there?
    // Since we don't have focus tracking, let's just use it for newPin if confirmPin is empty and newPin < 4
    if (newPin.length < 4) {
      setNewPin(prev => prev + digit);
    } else if (confirmPin.length < 4) {
      setConfirmPin(prev => prev + digit);
    }
  };

  const removeDigit = () => {
    setError('');
    if (confirmPin.length > 0) {
      setConfirmPin(prev => prev.slice(0, -1));
    } else if (newPin.length > 0) {
      setNewPin(prev => prev.slice(0, -1));
    }
  };

  const savePin = async () => {
    if (!selectedUser) return;
    
    if (newPin.length !== 4) {
      setError('El PIN debe tener exactamente 4 dígitos');
      return;
    }
    if (newPin !== confirmPin) {
      setError('Los PINs no coinciden');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const res = await fetch(`/api/admin/usuarios/${selectedUser.id}/pin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: newPin }),
      });
      const data = await res.json();

      if (res.ok) {
        mostrarToast(`PIN de ${selectedUser.nombre} actualizado con éxito`, 3000);
        closePinModal();
        fetchUsuarios(); // Refresh just in case
      } else {
        setError(data.error || 'Error al actualizar el PIN');
      }
    } catch {
      setError('Error de red al actualizar el PIN');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading && usuarios.length === 0) {
    return <div className="p-6 text-[var(--muted)]">Cargando usuarios...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 animate-fade-in bg-green-500/20 border border-green-500/30 text-green-400 px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg backdrop-blur-sm">
          <CheckCircle2 className="w-5 h-5" />
          {toastMessage}
        </div>
      )}

      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-2">
            <Shield className="w-8 h-8 text-purple-500" />
            Gestión de Personal
          </h1>
          <p className="text-[var(--muted)]">Administra roles y accesos al sistema</p>
        </div>
      </div>

      <ErrorDeCarga error={errorCarga} que="los usuarios" onReintentar={fetchUsuarios} />

      <div className="glass-card overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--background)]">
              <th className="p-4 font-bold text-[var(--muted)]">ID</th>
              <th className="p-4 font-bold text-[var(--muted)]">Nombre</th>
              <th className="p-4 font-bold text-[var(--muted)]">Rol</th>
              <th className="p-4 font-bold text-[var(--muted)]">Estado</th>
              <th className="p-4 font-bold text-[var(--muted)]">PIN</th>
              <th className="p-4 font-bold text-[var(--muted)] text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {usuarios.map(user => (
              <tr key={user.id} className="hover:bg-[var(--card-hover)] transition-colors">
                <td className="p-4 text-sm font-black text-[var(--muted)]">#{user.id}</td>
                <td className="p-4 font-bold flex items-center gap-2">
                  <User className="w-4 h-4 text-[var(--muted)]" />
                  {user.nombre}
                </td>
                <td className="p-4">
                  <span className={`badge px-2 py-1 text-[10px] font-black uppercase rounded ${
                    user.rol === 'ADMIN' ? 'bg-purple-500/20 text-purple-400' :
                    user.rol === 'COCINERO' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-amber-500/20 text-amber-400'
                  }`}>
                    {user.rol}
                  </span>
                </td>
                <td className="p-4">
                  {user.activo ? (
                    <span className="flex items-center gap-1 text-green-500 text-sm font-bold">
                      <CheckCircle2 className="w-4 h-4" /> Activo
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-500 text-sm font-bold">
                      <AlertTriangle className="w-4 h-4" /> Inactivo
                    </span>
                  )}
                </td>
                <td 
                  className="p-4 font-mono font-black text-lg tracking-widest text-[var(--muted)] cursor-pointer hover:text-purple-400 transition-colors"
                  onClick={() => openPinModal(user)}
                  title="Haga clic para modificar el PIN"
                >
                  ****
                </td>
                <td className="p-4 text-right">
                  <button 
                    onClick={() => openPinModal(user)}
                    className="p-2 bg-[var(--background)] border border-[var(--border)] rounded-lg hover:bg-purple-500/10 hover:text-purple-400 hover:border-purple-500/30 transition-all text-[var(--muted)] shadow-sm"
                    title="Modificar PIN"
                  >
                    <KeyRound className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Modificar PIN */}
      {modalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[var(--card)] w-full max-w-sm rounded-3xl border border-[var(--border)] shadow-2xl relative overflow-hidden flex flex-col">
            
            <button 
              onClick={closePinModal}
              className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-white bg-black/20 rounded-full transition-colors z-10"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="p-6 pb-4 text-center border-b border-white/5 bg-purple-500/5">
              <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center mx-auto mb-3 border border-purple-500/30 shadow-inner">
                <KeyRound className="w-6 h-6 text-purple-400" />
              </div>
              <h2 className="text-xl font-black mb-1 tracking-tight">Cambiar PIN</h2>
              <p className="text-sm font-bold text-[var(--muted)]">
                {selectedUser.nombre} <span className="text-xs font-normal opacity-70">({selectedUser.rol})</span>
              </p>
            </div>

            <div className="p-6 flex-1 overflow-y-auto">
              <div className="space-y-4 mb-6">
                
                {/* Nuevo PIN */}
                <div>
                  <label className="block text-xs font-bold text-[var(--muted)] mb-1">Nuevo PIN (4 dígitos)</label>
                  <div className="relative">
                    <input 
                      type={showPin ? "text" : "password"}
                      maxLength={4}
                      value={newPin}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        setNewPin(val);
                        setError('');
                      }}
                      className="w-full h-12 bg-[var(--background)] border border-[var(--border)] rounded-xl text-center text-xl font-mono tracking-widest focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all pr-12"
                      placeholder="••••"
                    />
                    <button 
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                      tabIndex={-1}
                    >
                      {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Confirmar PIN */}
                <div>
                  <label className="block text-xs font-bold text-[var(--muted)] mb-1">Confirmar nuevo PIN</label>
                  <input 
                    type={showPin ? "text" : "password"}
                    maxLength={4}
                    value={confirmPin}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setConfirmPin(val);
                      setError('');
                    }}
                    className="w-full h-12 bg-[var(--background)] border border-[var(--border)] rounded-xl text-center text-xl font-mono tracking-widest focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all"
                    placeholder="••••"
                  />
                </div>

              </div>

              {error && (
                <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold text-center animate-shake">
                  {error}
                </div>
              )}

              {/* Number Pad Opcional */}
              <div className="grid grid-cols-3 gap-2 mb-6">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                  <button
                    key={num}
                    onClick={() => addDigit(num.toString())}
                    type="button"
                    className="h-12 rounded-lg bg-[var(--background)] border border-[var(--border)] text-xl font-bold hover:bg-[var(--card-hover)] active:bg-purple-500/10 active:border-purple-500/30 transition-colors"
                  >
                    {num}
                  </button>
                ))}
                <div className="h-12"></div>
                <button
                  onClick={() => addDigit('0')}
                  type="button"
                  className="h-12 rounded-lg bg-[var(--background)] border border-[var(--border)] text-xl font-bold hover:bg-[var(--card-hover)] active:bg-purple-500/10 active:border-purple-500/30 transition-colors"
                >
                  0
                </button>
                <button
                  onClick={removeDigit}
                  type="button"
                  className="h-12 rounded-lg bg-[var(--background)] border border-[var(--border)] text-lg font-bold hover:bg-[var(--card-hover)] active:bg-red-500/10 active:border-red-500/30 flex items-center justify-center text-[var(--muted)] hover:text-red-400 transition-colors"
                >
                  <Delete className="w-5 h-5" />
                </button>
              </div>

              {/* Botones de acción */}
              <div className="flex gap-3">
                <button 
                  onClick={closePinModal}
                  disabled={isSaving}
                  className="flex-1 btn bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] py-3 font-bold hover:bg-[var(--card-hover)] disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button 
                  onClick={savePin}
                  disabled={isSaving || newPin.length !== 4 || confirmPin.length !== 4}
                  className="flex-1 btn bg-purple-600 text-white py-3 font-black shadow-lg hover:bg-purple-500 active:scale-95 transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
