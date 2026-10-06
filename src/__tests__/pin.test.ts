/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from './helpers/fakeDb';

let db: ReturnType<typeof createFakeDb>;
vi.mock('@/lib/prisma', () => ({
  default: new Proxy({}, { get: (_t, prop) => (db.prisma as any)[prop] }),
}));

import { autenticarPin, hashPin, pinEnUso, verificarPin } from '@/lib/pin';

describe('hash de PIN', () => {
  it('genera un hash con sal: el mismo PIN produce hashes distintos y no contiene el PIN', async () => {
    const a = await hashPin('1234');
    const b = await hashPin('1234');

    expect(a).not.toBe(b);
    expect(a.startsWith('scrypt1$')).toBe(true);
    expect(a).not.toContain('1234');
  });

  it('verifica el PIN correcto y rechaza el incorrecto', async () => {
    const h = await hashPin('1234');
    expect(await verificarPin('1234', h)).toBe(true);
    expect(await verificarPin('1235', h)).toBe(false);
    expect(await verificarPin('', h)).toBe(false);
  });

  it('sigue aceptando PIN en texto plano heredado (bases anteriores)', async () => {
    expect(await verificarPin('1111', '1111')).toBe(true);
    expect(await verificarPin('1112', '1111')).toBe(false);
    expect(await verificarPin('11', '1111')).toBe(false); // distinta longitud
  });

  it('un valor guardado corrupto no verifica ni lanza', async () => {
    expect(await verificarPin('1234', 'scrypt1$')).toBe(false);
    expect(await verificarPin('1234', 'scrypt1$zz$')).toBe(false);
  });
});

describe('autenticarPin', () => {
  beforeEach(async () => {
    db = createFakeDb({
      usuarios: [
        { id: 1, nombre: 'Admin', pin: '1111', rol: 'ADMIN', activo: true }, // legado en texto plano
        { id: 2, nombre: 'Cocina', pin: await hashPin('2222'), rol: 'COCINERO', activo: true },
        { id: 3, nombre: 'Baja', pin: await hashPin('3333'), rol: 'MOZO', activo: false },
      ],
    });
  });

  it('autentica con un PIN hasheado', async () => {
    expect((await autenticarPin('2222'))?.id).toBe(2);
  });

  it('autentica con PIN legado y lo migra a hash en ese momento', async () => {
    const u = await autenticarPin('1111');

    expect(u?.id).toBe(1);
    expect(db.state.usuarios[0].pin.startsWith('scrypt1$')).toBe(true);
    expect(db.state.usuarios[0].pin).not.toBe('1111');
    expect((await autenticarPin('1111'))?.id).toBe(1); // sigue funcionando ya migrado
  });

  it('un PIN incorrecto no autentica ni migra a nadie', async () => {
    expect(await autenticarPin('9999')).toBeNull();
    expect(db.state.usuarios[0].pin).toBe('1111');
  });

  it('un usuario inactivo no puede autenticarse', async () => {
    expect(await autenticarPin('3333')).toBeNull();
  });
});

describe('pinEnUso', () => {
  beforeEach(async () => {
    db = createFakeDb({
      usuarios: [
        { id: 1, nombre: 'Admin', pin: '1111', rol: 'ADMIN', activo: true },
        { id: 2, nombre: 'Cocina', pin: await hashPin('2222'), rol: 'COCINERO', activo: true },
        { id: 3, nombre: 'Baja', pin: await hashPin('3333'), rol: 'MOZO', activo: false },
      ],
    });
  });

  it('detecta PIN repetido, sea legado o con hash, incluso de un usuario inactivo', async () => {
    expect(await pinEnUso('1111')).toBe(true);
    expect(await pinEnUso('2222')).toBe(true);
    expect(await pinEnUso('3333')).toBe(true);
  });

  it('un PIN libre no está en uso', async () => {
    expect(await pinEnUso('4444')).toBe(false);
  });

  it('excluye al propio usuario (puede "cambiar" a su mismo PIN)', async () => {
    expect(await pinEnUso('2222', 2)).toBe(false);
    expect(await pinEnUso('2222', 1)).toBe(true);
  });
});
