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
    this.listeners.get(event)?.forEach((listener) => listener(payload));
    // Also emit to wildcard listeners
    this.listeners.get('*')?.forEach((listener) =>
      listener(JSON.stringify({ event, data }))
    );
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
