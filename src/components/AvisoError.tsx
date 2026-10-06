'use client';

import { AlertTriangle, X } from 'lucide-react';

/** Aviso de error de la API sobre una tabla o lista, con botón para cerrarlo y, opcionalmente, una acción. */
export default function AvisoError({
  mensaje,
  onCerrar,
  accion,
}: {
  mensaje: string;
  onCerrar: () => void;
  accion?: { texto: string; onClick: () => void };
}) {
  if (!mensaje) return null;
  return (
    <div role="alert" className="glass-card p-4 mb-4 flex items-center gap-3 border-red-500/30">
      <AlertTriangle className="w-5 h-5 text-[var(--danger)] shrink-0" />
      <p className="text-sm flex-1">{mensaje}</p>
      {accion && (
        <button onClick={accion.onClick} className="btn btn-sm btn-primary whitespace-nowrap">
          {accion.texto}
        </button>
      )}
      <button onClick={onCerrar} className="btn btn-sm btn-secondary" aria-label="Cerrar aviso">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
