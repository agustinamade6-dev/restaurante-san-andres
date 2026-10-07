import { describe, expect, it, vi } from 'vitest';
import { crearCandado } from './useEnvio';

/** Promesa que el test resuelve cuando quiere (simula una respuesta lenta del servidor). */
function pendiente<T>() {
  let resolver!: (v: T) => void;
  let rechazar!: (e: unknown) => void;
  const promesa = new Promise<T>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

describe('crearCandado', () => {
  it('ignora el segundo clic mientras el primero está en curso', async () => {
    const ejecutar = crearCandado(() => {});
    const envio = pendiente<string>();
    const accion = vi.fn(() => envio.promesa);

    const primero = ejecutar('', accion);
    const segundo = await ejecutar('', accion);
    expect(segundo).toBeUndefined();
    expect(accion).toHaveBeenCalledTimes(1);

    envio.resolver('ok');
    expect(await primero).toBe('ok');
  });

  it('después de terminar se puede volver a enviar', async () => {
    const ejecutar = crearCandado(() => {});
    await ejecutar('', async () => 1);
    expect(await ejecutar('', async () => 2)).toBe(2);
  });

  it('claves distintas (dos pedidos) no se bloquean entre sí', async () => {
    const ejecutar = crearCandado(() => {});
    const a = pendiente<string>();
    const primero = ejecutar(1, () => a.promesa);
    expect(await ejecutar(2, async () => 'pedido 2')).toBe('pedido 2');
    a.resolver('pedido 1');
    expect(await primero).toBe('pedido 1');
  });

  it('si la acción falla, libera la clave y propaga el error', async () => {
    const ejecutar = crearCandado(() => {});
    await expect(ejecutar('', async () => Promise.reject(new Error('caída')))).rejects.toThrow('caída');
    expect(await ejecutar('', async () => 'otra vez')).toBe('otra vez');
  });

  it('informa qué claves están ocupadas para deshabilitar botones', async () => {
    const cambios: Array<Array<string | number>> = [];
    const ejecutar = crearCandado((s) => cambios.push([...s]));
    const envio = pendiente<void>();
    const p = ejecutar(7, () => envio.promesa);
    expect(cambios.at(-1)).toEqual([7]);
    envio.resolver();
    await p;
    expect(cambios.at(-1)).toEqual([]);
  });
});
