'use client';

import { useState } from 'react';
import { useApi } from '@/hooks/useApi';
import AvisoError from '@/components/AvisoError';
import ErrorDeCarga from '@/components/ErrorDeCarga';
import { enviar, enviarJson } from '@/lib/api-cliente';
import { useEnvio } from '@/hooks/useEnvio';
import { useDialogo } from '@/hooks/useDialogo';
import {
  Plus,
  Pencil,
  Trash2,
  Truck,
  Phone,
  Mail,
  MapPin,
  X,
  Save,
  Package,
} from 'lucide-react';

interface Proveedor {
  id: number;
  nombre: string;
  contacto: string;
  telefono: string;
  email: string;
  direccion: string;
  notas: string;
  _count: { insumos: number };
}

export default function ProveedoresPage() {
  const [modal, setModal] = useState(false);
  const { ejecutar, enviando } = useEnvio();
  const dlgProveedor = useDialogo('Proveedor', () => setModal(false));
  // Errores de la API: el del modal deja el formulario abierto; el de la lista va arriba de ella.
  const [errorModal, setErrorModal] = useState('');
  const [errorLista, setErrorLista] = useState('');
  const [editando, setEditando] = useState<Proveedor | null>(null);
  const [form, setForm] = useState({
    nombre: '',
    contacto: '',
    telefono: '',
    email: '',
    direccion: '',
    notas: '',
  });

  const { data: proveedores, error: errorCarga, recargar: fetchProveedores } = useApi<Proveedor[]>('/api/proveedores', []);

  const abrirModal = (prov?: Proveedor) => {
    if (prov) {
      setEditando(prov);
      setForm({
        nombre: prov.nombre,
        contacto: prov.contacto,
        telefono: prov.telefono,
        email: prov.email,
        direccion: prov.direccion,
        notas: prov.notas,
      });
    } else {
      setEditando(null);
      setForm({
        nombre: '',
        contacto: '',
        telefono: '',
        email: '',
        direccion: '',
        notas: '',
      });
    }
    setErrorModal('');
    setModal(true);
  };

  const guardar = () => ejecutar(async () => {
    setErrorModal('');
    const error = editando
      ? await enviarJson('/api/proveedores', 'PUT', { id: editando.id, ...form }, 'No se pudo guardar el proveedor')
      : await enviarJson('/api/proveedores', 'POST', form, 'No se pudo crear el proveedor');
    if (error) return setErrorModal(error);
    setModal(false);
    fetchProveedores();
  });

  const eliminar = async (id: number) => {
    if (!confirm('¿Eliminar este proveedor?')) return;
    setErrorLista('');
    const error = await enviar(`/api/proveedores?id=${id}`, { method: 'DELETE' }, 'No se pudo eliminar el proveedor');
    if (error) return setErrorLista(error);
    fetchProveedores();
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Proveedores</h1>
          <p className="text-[var(--muted)] text-sm mt-1">
            {proveedores.length} proveedores registrados
          </p>
        </div>
        <button onClick={() => abrirModal()} className="btn btn-primary">
          <Plus className="w-4 h-4" />
          Nuevo Proveedor
        </button>
      </div>

      <ErrorDeCarga error={errorCarga} que="los proveedores" onReintentar={fetchProveedores} />
      <AvisoError mensaje={errorLista} onCerrar={() => setErrorLista('')} />

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {proveedores.map((prov) => (
          <div key={prov.id} className="glass-card p-5 animate-fade-in">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center">
                  <Truck className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-bold">{prov.nombre}</h3>
                  <p className="text-sm text-[var(--muted)]">
                    {prov.contacto}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => abrirModal(prov)}
                  className="w-8 h-8 rounded-lg bg-[var(--info-bg)] text-[var(--info)] flex items-center justify-center hover:bg-[var(--info)] hover:text-white transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => eliminar(prov.id)}
                  className="w-8 h-8 rounded-lg bg-[var(--danger-bg)] text-[var(--danger)] flex items-center justify-center hover:bg-[var(--danger)] hover:text-white transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              {prov.telefono && (
                <div className="flex items-center gap-2 text-[var(--muted)]">
                  <Phone className="w-4 h-4" />
                  {prov.telefono}
                </div>
              )}
              {prov.email && (
                <div className="flex items-center gap-2 text-[var(--muted)]">
                  <Mail className="w-4 h-4" />
                  {prov.email}
                </div>
              )}
              {prov.direccion && (
                <div className="flex items-center gap-2 text-[var(--muted)]">
                  <MapPin className="w-4 h-4" />
                  {prov.direccion}
                </div>
              )}
            </div>

            {prov.notas && (
              <div className="mt-3 p-2 rounded-lg bg-[var(--background)] text-xs text-[var(--muted)]">
                📝 {prov.notas}
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center gap-2">
              <Package className="w-4 h-4 text-[var(--muted)]" />
              <span className="text-xs text-[var(--muted)]">
                {prov._count.insumos} insumos asociados
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {modal && (
        <div {...dlgProveedor} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card w-full max-w-md p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Truck className="w-5 h-5 text-amber-400" />
                {editando ? 'Editar Proveedor' : 'Nuevo Proveedor'}
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
                  Nombre de la Empresa
                </label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, nombre: e.target.value }))
                  }
                  className="input"
                />
              </div>
              <div>
                <label className="text-sm text-[var(--muted)] mb-1 block">
                  Persona de Contacto
                </label>
                <input
                  type="text"
                  value={form.contacto}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, contacto: e.target.value }))
                  }
                  className="input"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-[var(--muted)] mb-1 block">
                    Teléfono
                  </label>
                  <input
                    type="text"
                    value={form.telefono}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, telefono: e.target.value }))
                    }
                    className="input"
                  />
                </div>
                <div>
                  <label className="text-sm text-[var(--muted)] mb-1 block">
                    Email
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, email: e.target.value }))
                    }
                    className="input"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm text-[var(--muted)] mb-1 block">
                  Dirección
                </label>
                <input
                  type="text"
                  value={form.direccion}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, direccion: e.target.value }))
                  }
                  className="input"
                />
              </div>
              <div>
                <label className="text-sm text-[var(--muted)] mb-1 block">
                  Notas
                </label>
                <input
                  type="text"
                  value={form.notas}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notas: e.target.value }))
                  }
                  className="input"
                  placeholder="Notas internas"
                />
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
