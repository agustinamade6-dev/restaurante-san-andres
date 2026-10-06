'use client';

import { useEffect, useRef } from 'react';
import { verificarSesion } from '@/lib/sesion-vencida';

export function useSSE(onMessage: (data: { event: string; data: unknown }) => void) {
  // La conexión se abre una sola vez; el callback se lee de una ref para usar siempre el último.
  const callbackRef = useRef(onMessage);
  useEffect(() => {
    callbackRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    let activo = true;
    let eventSource: EventSource | null = null;
    let reintento: ReturnType<typeof setTimeout> | null = null;

    function conectar() {
      eventSource = new EventSource('/api/events');

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'heartbeat' || data.type === 'connected') return;
          callbackRef.current(data);
        } catch {
          // Ignore parse errors
        }
      };

      eventSource.onerror = () => {
        eventSource?.close();
        // Si el error es porque la sesión venció, esto vuelve al inicio en vez de reintentar para siempre.
        verificarSesion();
        // Reconectar a los 3 s, salvo que la pantalla ya se haya cerrado.
        if (activo) reintento = setTimeout(conectar, 3000);
      };
    }

    conectar();
    return () => {
      // Cierra la conexión ACTUAL (no solo la primera) y cancela un reintento pendiente.
      activo = false;
      if (reintento) clearTimeout(reintento);
      eventSource?.close();
    };
  }, []);
}
