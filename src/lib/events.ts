// Simple SSE event emitter for real-time updates between sala and cocina
type Listener = (data: string) => void;

class EventEmitter {
  private listeners: Map<string, Set<Listener>> = new Map();

  on(event: string, listener: Listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return () => this.off(event, listener);
  }

  off(event: string, listener: Listener) {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string, data: unknown) {
    const payload = JSON.stringify(data);
    // Un listener que falla (p. ej. un cliente SSE ya desconectado) no debe cortar a los demás
    // ni hacer fallar al código que emite el evento después de haber guardado en la base.
    const enviar = (listener: Listener, texto: string) => {
      try {
        listener(texto);
      } catch (error) {
        console.error('[events] un listener falló:', error);
      }
    };
    this.listeners.get(event)?.forEach((listener) => enviar(listener, payload));
    // Also emit to wildcard listeners
    this.listeners.get('*')?.forEach((listener) => enviar(listener, JSON.stringify({ event, data })));
  }

  /** Cantidad de listeners suscritos a un evento (diagnóstico y tests). */
  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

const globalForEmitter = globalThis as unknown as {
  eventEmitter: EventEmitter | undefined;
};

export const eventEmitter =
  globalForEmitter.eventEmitter ?? new EventEmitter();

if (process.env.NODE_ENV !== 'production')
  globalForEmitter.eventEmitter = eventEmitter;

export default eventEmitter;
