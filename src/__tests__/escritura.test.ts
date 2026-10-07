import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ default: {} }));

import { escritura } from '@/lib/transaccion';
import { prefijoFecha } from '@/lib/ventas';

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('escritura() — escrituras sueltas en fila', () => {
  it('REGRESIÓN: nunca hay dos escrituras en curso a la vez, aunque se lancen juntas', async () => {
    let activas = 0;
    let maximo = 0;
    const tarea = async (n: number) => {
      activas++;
      maximo = Math.max(maximo, activas);
      await pausa(5);
      activas--;
      return n;
    };

    const resultados = await Promise.all([1, 2, 3, 4, 5].map((n) => escritura(() => tarea(n))));

    expect(maximo).toBe(1);
    expect(resultados).toEqual([1, 2, 3, 4, 5]);
  });

  it('una escritura que falla no bloquea la fila y propaga su error', async () => {
    const fallida = escritura(async () => {
      throw new Error('boom');
    });
    const siguiente = escritura(async () => 'ok');

    await expect(fallida).rejects.toThrow('boom');
    await expect(siguiente).resolves.toBe('ok');
  });
});

describe('helpers de ventas', () => {
  it('prefijoFecha arma AAAAMMDD con ceros', () => {
    expect(prefijoFecha(new Date(2026, 0, 5))).toBe('20260105');
  });
});
