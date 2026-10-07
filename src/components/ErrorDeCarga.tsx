'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Aviso de que no se pudieron cargar los datos de una pantalla (el `error` de useApi).
 * Sin esto, una falla de la API se ve como una lista vacía o en $0, como si no hubiera datos.
 */
export default function ErrorDeCarga({
  error,
  que,
  onReintentar,
}: {
  /** Mensaje de useApi; vacío = no se muestra nada. */
  error: string;
  /** Qué se estaba cargando, en minúscula: "los pedidos", "las métricas". */
  que: string;
  onReintentar: () => void;
}) {
  if (!error) return null;
  return (
    <div role="alert" className="glass-card p-4 mb-4 flex items-center gap-3 border-red-500/30">
      <AlertTriangle className="w-5 h-5 text-[var(--danger)] shrink-0" aria-hidden="true" />
      <p className="text-sm flex-1">
        No se pudieron cargar {que}: {error}
      </p>
      <button onClick={onReintentar} className="btn btn-sm btn-primary whitespace-nowrap min-h-[44px] flex items-center gap-1.5">
        <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Reintentar
      </button>
    </div>
  );
}
