'use client';

import { useEffect, useCallback, useRef } from 'react';
import { verificarSesion } from '@/lib/sesion-vencida';

export function useSSE(onMessage: (data: { event: string; data: unknown }) => void) {
  const callbackRef = useRef(onMessage);
  callbackRef.current = onMessage;

  const connect = useCallback(() => {
    const eventSource = new EventSource('/api/events');

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
      eventSource.close();
      // Si el error es porque la sesión venció, esto vuelve al inicio en vez de reintentar para siempre.
      verificarSesion();
      // Reconnect after 3 seconds
      setTimeout(connect, 3000);
    };

    return eventSource;
  }, []);

  useEffect(() => {
    const eventSource = connect();
    return () => eventSource.close();
  }, [connect]);
}
