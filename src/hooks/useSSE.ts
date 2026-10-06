'use client';

import { useEffect, useCallback, useRef } from 'react';

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
