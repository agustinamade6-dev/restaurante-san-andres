import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { conectarSSE } from './useSSE';

/** EventSource falso: el test decide cuándo abre, cuándo llega un mensaje y cuándo se corta. */
class FuenteFalsa {
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  cerrada = false;
  close() {
    this.cerrada = true;
  }
  abrir() {
    this.onopen?.(new Event('open'));
  }
  mensaje(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
  cortar() {
    this.onerror?.(new Event('error'));
  }
}

function preparar() {
  const fuentes: FuenteFalsa[] = [];
  const onMessage = vi.fn();
  const onReconnect = vi.fn();
  const alFallar = vi.fn();
  const alVencerSesion = vi.fn();
  const cerrar = conectarSSE({
    onMessage,
    onReconnect,
    alFallar,
    alVencerSesion,
    crearFuente: () => {
      const f = new FuenteFalsa();
      fuentes.push(f);
      return f;
    },
  });
  return { fuentes, onMessage, onReconnect, alFallar, alVencerSesion, cerrar, actual: () => fuentes[fuentes.length - 1] };
}

describe('conectarSSE', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('la primera conexión no cuenta como reconexión', () => {
    const { actual, onReconnect } = preparar();
    actual().abrir();
    expect(onReconnect).not.toHaveBeenCalled();
  });

  it('pasa los eventos y descarta heartbeat, connected y JSON inválido', () => {
    const { actual, onMessage } = preparar();
    actual().abrir();
    actual().mensaje({ type: 'connected' });
    actual().mensaje({ type: 'heartbeat' });
    actual().onmessage?.({ data: 'no es json' } as MessageEvent);
    actual().mensaje({ event: 'pedido:nuevo', data: { id: 1 } });
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({ event: 'pedido:nuevo', data: { id: 1 } });
  });

  it('tras un corte reconecta a los 3 s y avisa para volver a pedir los datos', () => {
    const { fuentes, actual, onReconnect, alFallar } = preparar();
    actual().abrir();
    actual().cortar();

    expect(fuentes[0].cerrada).toBe(true);
    expect(alFallar).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2999);
    expect(fuentes).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(fuentes).toHaveLength(2);

    expect(onReconnect).not.toHaveBeenCalled();
    actual().abrir();
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('varios intentos fallidos seguidos avisan una sola vez, cuando por fin conecta', () => {
    const { actual, onReconnect } = preparar();
    actual().abrir();
    actual().cortar();
    vi.advanceTimersByTime(3000);
    actual().cortar();
    vi.advanceTimersByTime(3000);
    actual().abrir();
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('avisa en cada reconexión, no solo en la primera', () => {
    const { actual, onReconnect } = preparar();
    actual().abrir();
    for (let i = 0; i < 2; i++) {
      actual().cortar();
      vi.advanceTimersByTime(3000);
      actual().abrir();
    }
    expect(onReconnect).toHaveBeenCalledTimes(2);
  });

  it('si la primera conexión falla, avisa al conectar para cargar lo que se perdió', () => {
    const { actual, onReconnect } = preparar();
    actual().cortar();
    vi.advanceTimersByTime(3000);
    actual().abrir();
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('REGRESIÓN: ante "sesion-vencida" cierra, vuelve al inicio y no reintenta (antes reconectaba con 401 cada 3 s)', () => {
    const { fuentes, actual, onMessage, alVencerSesion } = preparar();
    actual().abrir();
    actual().mensaje({ type: 'sesion-vencida' });

    expect(onMessage).not.toHaveBeenCalled();
    expect(fuentes[0].cerrada).toBe(true);
    expect(alVencerSesion).toHaveBeenCalledTimes(1);

    // Aunque después llegue un error de la conexión cerrada, no se vuelve a conectar.
    actual().cortar();
    vi.advanceTimersByTime(10_000);
    expect(fuentes).toHaveLength(1);
  });

  it('al cerrar la pantalla cierra la conexión actual y cancela el reintento pendiente', () => {
    const { fuentes, actual, cerrar } = preparar();
    actual().abrir();
    actual().cortar();
    cerrar();
    vi.advanceTimersByTime(10_000);
    expect(fuentes).toHaveLength(1);
    expect(fuentes[0].cerrada).toBe(true);
  });
});
