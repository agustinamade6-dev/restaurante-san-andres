import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginAs, logout, resetCookies } from './helpers/session';
import eventEmitter from '@/lib/events';

vi.mock('next/headers', async () => (await import('./helpers/session')).nextHeadersMock());

import { GET } from '@/app/api/events/route';

const decoder = new TextDecoder();
const abrir = (signal?: AbortSignal) => GET(new Request('http://localhost/api/events', { signal }));
const leer = async (reader: ReadableStreamDefaultReader<Uint8Array>) => decoder.decode((await reader.read()).value);

beforeEach(async () => {
  vi.useFakeTimers();
  resetCookies();
  await loginAs('MOZO', 3);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/events (SSE)', () => {
  it('401 sin sesión y no registra ningún listener ni temporizador', async () => {
    logout();
    const res = await abrir();

    expect(res.status).toBe(401);
    expect(eventEmitter.listenerCount('*')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('con sesión: envía "connected", registra un listener y arma el heartbeat', async () => {
    const res = await abrir();
    const reader = res.body!.getReader();

    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(await leer(reader)).toContain('"connected"');
    expect(eventEmitter.listenerCount('*')).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
    await reader.cancel();
  });

  it('envía un heartbeat cada 30 segundos', async () => {
    const res = await abrir();
    const reader = res.body!.getReader();
    await leer(reader);

    vi.advanceTimersByTime(30_000);

    expect(await leer(reader)).toContain('"heartbeat"');
    await reader.cancel();
  });

  it('reenvía a los clientes los eventos que emite el servidor', async () => {
    const res = await abrir();
    const reader = res.body!.getReader();
    await leer(reader);

    eventEmitter.emit('pedido:nuevo', { id: 7 });

    const texto = await leer(reader);
    expect(texto).toContain('pedido:nuevo');
    expect(texto).toContain('"id":7');
    await reader.cancel();
  });

  it('REGRESIÓN: al cerrar la conexión (cancel) se limpian el listener Y el temporizador', async () => {
    const res = await abrir();
    const reader = res.body!.getReader();
    await leer(reader);

    await reader.cancel();

    expect(eventEmitter.listenerCount('*')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('REGRESIÓN: si el cliente se desconecta (abort) también se limpia todo', async () => {
    const ac = new AbortController();
    const res = await abrir(ac.signal);
    expect(eventEmitter.listenerCount('*')).toBe(1);

    ac.abort();

    expect(eventEmitter.listenerCount('*')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    void res;
  });

  it('abrir y cerrar muchas conexiones no deja residuos', async () => {
    for (let i = 0; i < 25; i++) {
      const res = await abrir();
      const reader = res.body!.getReader();
      await leer(reader);
      await reader.cancel();
    }

    expect(eventEmitter.listenerCount('*')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('un cliente desconectado no impide que los demás reciban el evento ni rompe a quien emite', async () => {
    const roto = vi.fn(() => {
      throw new Error('cliente caído');
    });
    const off = eventEmitter.on('*', roto);
    const res = await abrir();
    const reader = res.body!.getReader();
    await leer(reader);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => eventEmitter.emit('mesa:actualizada', { id: 1 })).not.toThrow();

    expect(roto).toHaveBeenCalled();
    expect(await leer(reader)).toContain('mesa:actualizada');
    off();
    await reader.cancel();
  });
});

describe('lib/events', () => {
  it('on() devuelve la función para darse de baja', () => {
    const fn = vi.fn();
    const off = eventEmitter.on('prueba', fn);
    eventEmitter.emit('prueba', { a: 1 });
    off();
    eventEmitter.emit('prueba', { a: 2 });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('{"a":1}');
    expect(eventEmitter.listenerCount('prueba')).toBe(0);
  });

  it('los listeners comodín reciben { event, data }', () => {
    const fn = vi.fn();
    const off = eventEmitter.on('*', fn);
    eventEmitter.emit('x', { n: 1 });
    off();

    expect(JSON.parse(fn.mock.calls[0][0])).toEqual({ event: 'x', data: { n: 1 } });
  });
});
