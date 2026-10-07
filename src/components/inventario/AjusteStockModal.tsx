'use client';

import { useId, useState } from 'react';
import { AlertTriangle, Minus, Plus, SlidersHorizontal, X } from 'lucide-react';
import { useDialogo } from '@/hooks/useDialogo';
import { useEnvio } from '@/hooks/useEnvio';
import { enviarJson } from '@/lib/api-cliente';
import { MAX_MOTIVO, validarAjuste, type Sentido } from './ajuste';

interface InsumoAjustable {
  id: number;
  nombre: string;
  unidad: string;
  stockActual: number;
}

/**
 * Ajuste manual de stock: suma o resta una cantidad con un motivo (POST /api/inventario/ajuste).
 * No se escribe el valor final a propósito: calcular la diferencia acá pisaría las ventas
 * que descuenten stock mientras el modal está abierto.
 */
export default function AjusteStockModal({
  insumo,
  onCerrar,
  onAjustado,
}: {
  insumo: InsumoAjustable;
  onCerrar: () => void;
  onAjustado: () => void;
}) {
  const [sentido, setSentido] = useState<Sentido>('sumar');
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [intentoEnviar, setIntentoEnviar] = useState(false);
  const { ejecutar, enviando } = useEnvio();
  const dialogo = useDialogo(`Ajustar stock de ${insumo.nombre}`, onCerrar);
  const id = useId();

  const resultado = validarAjuste({ cantidad, sentido, motivo }, insumo.stockActual);
  // El error de validación se muestra recién después del primer intento, para no retar mientras se escribe.
  const errorVisible = error || (intentoEnviar && !resultado.ok ? resultado.error : '');

  const confirmar = () =>
    ejecutar(async () => {
      setIntentoEnviar(true);
      setError('');
      if (!resultado.ok) return;
      const fallo = await enviarJson(
        '/api/inventario/ajuste',
        'POST',
        { insumoId: insumo.id, delta: resultado.delta, motivo: resultado.motivo },
        'No se pudo ajustar el stock'
      );
      if (fallo) return setError(fallo);
      onAjustado();
    });

  const botonSentido = (valor: Sentido, texto: string, Icono: typeof Plus) => (
    <button
      type="button"
      onClick={() => setSentido(valor)}
      aria-pressed={sentido === valor}
      className={`flex-1 btn ${
        sentido === valor
          ? valor === 'sumar'
            ? 'btn-success'
            : 'btn-danger'
          : 'btn-secondary'
      }`}
    >
      <Icono className="w-4 h-4" aria-hidden="true" /> {texto}
    </button>
  );

  return (
    <div {...dialogo} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass-card w-full max-w-md p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-amber-400" aria-hidden="true" />
            Ajustar stock
          </h2>
          <button
            aria-label="Cerrar"
            onClick={onCerrar}
            className="w-8 h-8 rounded-lg bg-[var(--background)] flex items-center justify-center min-w-11 min-h-11"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm mb-4">
          <span className="font-bold">{insumo.nombre}</span>
          <span className="text-[var(--muted)]">
            {' '}
            — stock actual: {insumo.stockActual} {insumo.unidad}
          </span>
        </p>

        <div className="space-y-4">
          <div className="flex gap-2" role="group" aria-label="Tipo de ajuste">
            {botonSentido('sumar', 'Sumar', Plus)}
            {botonSentido('restar', 'Restar', Minus)}
          </div>

          <div>
            <label htmlFor={`${id}-cantidad`} className="text-sm text-[var(--muted)] mb-1 block">
              Cantidad ({insumo.unidad})
            </label>
            <input
              id={`${id}-cantidad`}
              type="text"
              inputMode="decimal"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className="input"
              placeholder="Ej: 2 o 1,5"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor={`${id}-motivo`} className="text-sm text-[var(--muted)] mb-1 block">
              Motivo
            </label>
            <input
              id={`${id}-motivo`}
              type="text"
              value={motivo}
              maxLength={MAX_MOTIVO}
              onChange={(e) => setMotivo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmar();
              }}
              className="input"
              placeholder="Ej: compra al proveedor, rotura, conteo"
            />
          </div>

          {resultado.ok && (
            <p className="text-sm" aria-live="polite">
              Va a quedar en{' '}
              <span className={`font-bold ${resultado.quedaNegativo ? 'text-[var(--danger-text)]' : ''}`}>
                {resultado.stockNuevo} {insumo.unidad}
              </span>
            </p>
          )}
          {resultado.ok && resultado.quedaNegativo && (
            <p className="text-sm text-[var(--warning)] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
              El stock va a quedar negativo. Revisá que la cantidad sea correcta.
            </p>
          )}
          {errorVisible && (
            <p role="alert" className="text-sm text-[var(--danger-text)]">
              {errorVisible}
            </p>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onCerrar} className="btn btn-secondary flex-1">
            Cancelar
          </button>
          <button onClick={confirmar} disabled={enviando} className="btn btn-primary flex-1 disabled:opacity-50">
            {enviando ? 'Guardando…' : 'Confirmar ajuste'}
          </button>
        </div>
      </div>
    </div>
  );
}
