'use client';

import { useState } from 'react';
import { useApi } from '@/hooks/useApi';
import AvisoError from '@/components/AvisoError';
import ErrorDeCarga from '@/components/ErrorDeCarga';
import { enviar, enviarJson } from '@/lib/api-cliente';
import { useEnvio } from '@/hooks/useEnvio';
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  Save,
  UtensilsCrossed,
  Image as ImageIcon,
  Upload,
  ClipboardList,
} from 'lucide-react';
import RecetaModal from './RecetaModal';

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

interface Categoria {
  id: number;
  nombre: string;
}

export default function MenuPage() {
  const { data: productos, error: errorProductos, recargar: recargarProductos } = useApi<Producto[]>('/api/productos', []);
  const { data: categorias, error: errorCategorias, recargar: recargarCategorias } = useApi<Categoria[]>('/api/categorias', []);
  const [busqueda, setBusqueda] = useState('');
  const { ejecutar, enviando } = useEnvio();
  const [catFiltro, setCatFiltro] = useState<number | null>(null);
  const [modal, setModal] = useState(false);
  // Errores de la API: el del modal deja el formulario abierto; el de la lista va arriba de ella.
  const [errorModal, setErrorModal] = useState('');
  const [errorLista, setErrorLista] = useState('');
  // Producto que no se pudo eliminar: se ofrece marcarlo como no disponible
  const [noEliminado, setNoEliminado] = useState<Producto | null>(null);
  const [editando, setEditando] = useState<Producto | null>(null);
  const [form, setForm] = useState({
    nombre: '',
    descripcion: '',
    precio: 0,
    categoriaId: 0,
    disponible: true,
    imagen: '',
  });
  const [subiendoImagen, setSubiendoImagen] = useState(false);
  const [recetaDe, setRecetaDe] = useState<Producto | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSubiendoImagen(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setForm(f => ({ ...f, imagen: data.url }));
      } else {
        alert(data.error || 'Error al subir la imagen');
      }
    } catch (error) {
      console.error('Error uploading:', error);
      alert('Error de conexión al subir la imagen');
    } finally {
      setSubiendoImagen(false);
      e.target.value = '';
    }
  };

  const fetchData = () => {
    recargarProductos();
    recargarCategorias();
  };

  const abrirModal = (producto?: Producto) => {
    if (producto) {
      setEditando(producto);
      setForm({
        nombre: producto.nombre,
        descripcion: producto.descripcion,
        precio: producto.precio,
        categoriaId: producto.categoriaId,
        disponible: producto.disponible,
        imagen: producto.imagen,
      });
    } else {
      setEditando(null);
      setForm({
        nombre: '',
        descripcion: '',
        precio: 0,
        categoriaId: categorias[0]?.id ?? 0,
        disponible: true,
        imagen: '🍽️',
      });
    }
    setErrorModal('');
    setModal(true);
  };

  const guardar = () => ejecutar(async () => {
    setErrorModal('');
    const error = editando
      ? await enviarJson('/api/productos', 'PUT', { id: editando.id, ...form }, 'No se pudo guardar el producto')
      : await enviarJson('/api/productos', 'POST', form, 'No se pudo crear el producto');
    if (error) return setErrorModal(error);
    setModal(false);
    fetchData();
  });

  const eliminar = async (producto: Producto) => {
    if (!confirm('¿Eliminar este producto?')) return;
    cerrarAvisoLista();
    const error = await enviar(`/api/productos?id=${producto.id}`, { method: 'DELETE' }, 'No se pudo eliminar el producto');
    if (error) {
      setErrorLista(error);
      // Un producto ya vendido no se borra; sacarlo de la venta es marcarlo como no disponible.
      if (producto.disponible) setNoEliminado(producto);
      return;
    }
    fetchData();
  };

  const marcarNoDisponible = async () => {
    if (!noEliminado) return;
    const error = await enviarJson('/api/productos', 'PUT', { id: noEliminado.id, disponible: false }, 'No se pudo marcar como no disponible');
    setNoEliminado(null);
    setErrorLista(error ?? '');
    fetchData();
  };

  const cerrarAvisoLista = () => {
    setErrorLista('');
    setNoEliminado(null);
  };

  // Lo que falta para poder guardar (el servidor lo rechazaría igual)
  const faltaParaGuardar = !form.nombre.trim()
    ? 'Falta el nombre'
    : !(form.precio > 0)
      ? 'El precio debe ser mayor que 0'
      : !categorias.some((c) => c.id === form.categoriaId)
        ? 'Elegí una categoría'
        : '';

  const filtrados = productos.filter((p) => {
    if (catFiltro && p.categoriaId !== catFiltro) return false;
    if (
      busqueda &&
      !p.nombre.toLowerCase().includes(busqueda.toLowerCase())
    )
      return false;
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Menú & Precios</h1>
          <p className="text-[var(--muted)] text-sm mt-1">
            {productos.length} productos en el menú
          </p>
        </div>
        <button onClick={() => abrirModal()} className="btn btn-primary">
          <Plus className="w-4 h-4" />
          Nuevo Producto
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
          <input
            type="text"
            placeholder="Buscar producto..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="input pl-10"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setCatFiltro(null)}
            className={`btn btn-sm ${!catFiltro ? 'btn-primary' : 'btn-secondary'}`}
          >
            Todos
          </button>
          {categorias.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCatFiltro(cat.id)}
              className={`btn btn-sm ${catFiltro === cat.id ? 'btn-primary' : 'btn-secondary'}`}
            >
              {cat.nombre}
            </button>
          ))}
        </div>
      </div>

      <ErrorDeCarga error={errorProductos} que="los productos" onReintentar={recargarProductos} />
      <ErrorDeCarga error={errorCategorias} que="las categorías" onReintentar={recargarCategorias} />
      <AvisoError
        mensaje={errorLista}
        onCerrar={cerrarAvisoLista}
        accion={noEliminado ? { texto: 'Marcar como no disponible', onClick: marcarNoDisponible } : undefined}
      />

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left p-4 text-sm font-semibold text-[var(--muted)]">
                Producto
              </th>
              <th className="text-left p-4 text-sm font-semibold text-[var(--muted)]">
                Categoría
              </th>
              <th className="text-right p-4 text-sm font-semibold text-[var(--muted)]">
                Precio
              </th>
              <th className="text-center p-4 text-sm font-semibold text-[var(--muted)]">
                Estado
              </th>
              <th className="text-right p-4 text-sm font-semibold text-[var(--muted)]">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((p) => (
              <tr
                key={p.id}
                className="border-b border-[var(--border)] hover:bg-[var(--card-hover)] transition-colors"
              >
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[var(--card)] border border-[var(--border)] flex items-center justify-center overflow-hidden shrink-0 relative">
                      {p.imagen && p.imagen !== '🍽️' ? (
                        <img src={p.imagen} alt={p.nombre} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
                      ) : null}
                      <UtensilsCrossed className={`w-4 h-4 text-[var(--muted)] ${p.imagen && p.imagen !== '🍽️' ? 'hidden' : ''} absolute`} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{p.nombre}</p>
                      <p className="text-xs text-[var(--muted)] truncate max-w-[200px]">
                        {p.descripcion}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="p-4">
                  <span className="text-sm text-[var(--muted)]">
                    {p.categoria.nombre}
                  </span>
                </td>
                <td className="p-4 text-right">
                  <span className="font-bold text-amber-400">
                    ${p.precio.toLocaleString()}
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span
                    className={`badge ${
                      p.disponible ? 'badge-libre' : 'badge-ocupada'
                    }`}
                  >
                    {p.disponible ? 'Disponible' : 'No disponible'}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setRecetaDe(p)}
                      title="Receta (insumos que descuenta del stock)"
                      className="w-8 h-8 rounded-lg bg-[var(--background)] text-amber-400 border border-[var(--border)] flex items-center justify-center hover:bg-amber-500 hover:text-white transition-colors"
                    >
                      <ClipboardList className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => abrirModal(p)}
                      className="w-8 h-8 rounded-lg bg-[var(--info-bg)] text-[var(--info)] flex items-center justify-center hover:bg-[var(--info)] hover:text-white transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => eliminar(p)}
                      className="w-8 h-8 rounded-lg bg-[var(--danger-bg)] text-[var(--danger)] flex items-center justify-center hover:bg-[var(--danger)] hover:text-white transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
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
                <UtensilsCrossed className="w-5 h-5 text-amber-400" />
                {editando ? 'Editar Producto' : 'Nuevo Producto'}
              </h2>
              <button
                onClick={() => setModal(false)}
                className="w-8 h-8 rounded-lg bg-[var(--background)] flex items-center justify-center hover:bg-[var(--card-hover)] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-[var(--muted)] mb-1 block">
                  Nombre
                </label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, nombre: e.target.value }))
                  }
                  className="input"
                  placeholder="Nombre del producto"
                />
              </div>
              <div>
                <label className="text-sm text-[var(--muted)] mb-1 block">
                  Descripción
                </label>
                <input
                  type="text"
                  value={form.descripcion}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, descripcion: e.target.value }))
                  }
                  className="input"
                  placeholder="Descripción breve"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-[var(--muted)] mb-1 block">
                    Precio ($)
                  </label>
                  <input
                    type="number"
                    value={form.precio}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        precio: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="input"
                  />
                </div>
                <div>
                  <label className="text-sm text-[var(--muted)] mb-1 block">
                    Categoría
                  </label>
                  <select
                    value={form.categoriaId}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        categoriaId: parseInt(e.target.value),
                      }))
                    }
                    className="input"
                  >
                    {categorias.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div className="bg-[var(--background)] p-4 rounded-xl border border-[var(--border)]">
                  <label className="text-sm font-bold text-[var(--foreground)] mb-3 block">
                    Imagen del Producto
                  </label>
                  
                  <div className="flex gap-4">
                    {/* Previsualización */}
                    <div className="w-24 h-24 rounded-lg bg-[var(--card)] border border-[var(--border)] flex items-center justify-center overflow-hidden shrink-0 relative">
                      {form.imagen ? (
                        <img 
                          src={form.imagen} 
                          alt="Preview" 
                          className="w-full h-full object-cover" 
                          onError={(e) => { 
                            e.currentTarget.style.display = 'none'; 
                            e.currentTarget.nextElementSibling?.classList.remove('hidden'); 
                          }} 
                        />
                      ) : null}
                      <ImageIcon className={`w-8 h-8 text-[var(--muted)] ${form.imagen ? 'hidden' : ''} absolute`} />
                    </div>
                    
                    <div className="flex-1 flex flex-col justify-center space-y-3">
                      {/* Opción 1: Subir Archivo */}
                      <div className="relative">
                        <input 
                          type="file" 
                          accept="image/png, image/jpeg, image/jpg, image/webp" 
                          onChange={handleFileUpload}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
                          disabled={subiendoImagen}
                        />
                        <button type="button" className={`btn btn-secondary w-full flex items-center justify-center gap-2 relative z-0 ${subiendoImagen ? 'opacity-50' : ''}`}>
                          {subiendoImagen ? (
                            <span className="w-4 h-4 border-2 border-[var(--foreground)] border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4" />
                          )}
                          {subiendoImagen ? 'Subiendo...' : 'Subir desde este equipo'}
                        </button>
                      </div>

                      {/* Opción 2: URL externa */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--muted)] w-10 text-center shrink-0">o link</span>
                        <input
                          type="text"
                          value={form.imagen}
                          onChange={(e) => setForm((f) => ({ ...f, imagen: e.target.value }))}
                          className="input flex-1 py-2 text-sm"
                          placeholder="https://... o /uploads/..."
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center">
                  <label className="flex items-center gap-3 cursor-pointer bg-[var(--background)] px-4 py-3 rounded-xl border border-[var(--border)] hover:border-amber-500/50 transition-colors w-full">
                    <input
                      type="checkbox"
                      checked={form.disponible}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          disponible: e.target.checked,
                        }))
                      }
                      className="w-5 h-5 rounded accent-amber-500"
                    />
                    <span className="text-sm font-bold">Disponible para la venta</span>
                  </label>
                </div>
              </div>
            </div>

            {errorModal && <p role="alert" className="text-sm text-[var(--danger)] mt-4">{errorModal}</p>}
            {!errorModal && faltaParaGuardar && <p className="text-sm text-[var(--muted)] mt-4">{faltaParaGuardar}</p>}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setModal(false)}
                className="btn btn-secondary flex-1"
              >
                Cancelar
              </button>
              <button onClick={guardar} disabled={!!faltaParaGuardar || enviando} className="btn btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed">
                <Save className="w-4 h-4" />
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {recetaDe && <RecetaModal producto={recetaDe} onClose={() => setRecetaDe(null)} />}
    </div>
  );
}
