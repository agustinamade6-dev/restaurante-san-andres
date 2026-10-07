'use client';

import { useEffect, useRef } from 'react';
import { irAlLogin, verificarSesion } from '@/lib/sesion-vencida';

export type MensajeSSE = { event: string; data: unknown };

type FuenteEventos = Pick<EventSource, 'close' | 'onopen' | 'onmessage' | 'onerror'>;

export interface OpcionesConexion {
  onMessage: (data: MensajeSSE) => void;
  /**
   * Se llama cada vez que la conexión vuelve después de un corte. Los eventos emitidos
   * mientras estuvo caída se perdieron, así que la pantalla tiene que volver a pedir sus datos.
   */
  onReconnect?: () => void;
  crearFuente?: () => FuenteEventos;
  alFallar?: () => void;
  /** El servidor avisó que la sesión venció (o el usuario fue desactivado): no se reintenta. */
  alVencerSesion?: () => void;
  esperaReintentoMs?: number;
}

/** Abre /api/events y reconecta sola. Devuelve la función que la cierra. */
export function conectarSSE({
  onMessage,
  onReconnect,
  crearFuente = () => new EventSource('/api/events'),
  alFallar = verificarSesion,
  alVencerSesion = irAlLogin,
  esperaReintentoMs = 3000,
}: OpcionesConexion): () => void {
  let activo = true;
  let fuente: FuenteEventos | null = null;
  let reintento: ReturnType<typeof setTimeout> | null = null;
  let huboCorte = false;

  function conectar() {
    fuente = crearFuente();

    fuente.onopen = () => {
      if (!huboCorte) return;
      huboCorte = false;
      onReconnect?.();
    };

    fuente.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'heartbeat' || data.type === 'connected') return;
        if (data.type === 'sesion-vencida') {
          // El servidor cierra la conexión después de este aviso: reconectar daría 401 cada 3 s.
          activo = false;
          fuente?.close();
          alVencerSesion();
          return;
        }
        onMessage(data);
      } catch {
        // Ignore parse errors
      }
    };

    fuente.onerror = () => {
      fuente?.close();
      huboCorte = true;
      // Si el error es porque la sesión venció, esto vuelve al inicio en vez de reintentar para siempre.
      alFallar();
      // Reconectar a los 3 s, salvo que la pantalla ya se haya cerrado.
      if (activo) reintento = setTimeout(conectar, esperaReintentoMs);
    };
  }

  conectar();
  return () => {
    // Cierra la conexión ACTUAL (no solo la primera) y cancela un reintento pendiente.
    activo = false;
    if (reintento) clearTimeout(reintento);
    fuente?.close();
  };
}

export function useSSE(onMessage: (data: MensajeSSE) => void, onReconnect?: () => void) {
  // La conexión se abre una sola vez; los callbacks se leen de refs para usar siempre los últimos.
  const onMessageRef = useRef(onMessage);
  const onReconnectRef = useRef(onReconnect);
  useEffect(() => {
    onMessageRef.current = onMessage;
    onReconnectRef.current = onReconnect;
  }, [onMessage, onReconnect]);

  useEffect(
    () =>
      conectarSSE({
        onMessage: (data) => onMessageRef.current(data),
        onReconnect: () => onReconnectRef.current?.(),
      }),
    []
  );
}
