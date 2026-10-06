/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Usuarios "en la base": por defecto, el del token existe, está activo y tiene el rol del token.
// Un test puede fijar otro estado en `enBase` (desactivado, borrado o con otro rol).
const enBase = new Map<number, { activo: boolean; rol?: string } | null>();
vi.mock('@/lib/prisma', () => ({
  default: {
    usuario: {
      findUnique: async ({ where }: any) => {
        const fijado = enBase.get(where.id);
        if (fijado === null) return null;
        return { id: where.id, nombre: 'T', rol: fijado?.rol ?? rolDelToken, activo: fijado?.activo ?? true };
      },
    },
  },
}));
let rolDelToken = 'ADMIN';

import { proxy } from '@/proxy';
import { signSession } from '@/lib/session';

beforeEach(() => enBase.clear());

const pedir = async (path: string, rol?: string, cookie?: string) => {
  const headers: Record<string, string> = {};
  if (rol) rolDelToken = rol;
  const valor = cookie ?? (rol ? await signSession({ id: 1, nombre: 'T', rol }) : undefined);
  if (valor) headers.cookie = `session=${valor}`;
  return proxy(new NextRequest(`http://localhost${path}`, { headers }));
};

const redirige = (res: Response) => res.status === 307 && new URL(res.headers.get('location')!).pathname === '/';
const pasa = (res: Response) => res.headers.get('x-middleware-next') === '1';

describe('proxy de páginas', () => {
  it.each(['/admin', '/admin/caja', '/cocina', '/comandas'])('sin sesión redirige al inicio: %s', async (p) => {
    expect(redirige(await pedir(p))).toBe(true);
  });

  it('una cookie fabricada (JSON plano con rol ADMIN) ya no abre /admin', async () => {
    const falsa = JSON.stringify({ id: 1, nombre: 'Intruso', rol: 'ADMIN' });
    expect(redirige(await pedir('/admin', undefined, falsa))).toBe(true);
  });

  it('una cookie con rol alterado tras firmar tampoco', async () => {
    const [, firma] = (await signSession({ id: 1, nombre: 'T', rol: 'MOZO' })).split('.');
    const cuerpo = Buffer.from(JSON.stringify({ id: 1, nombre: 'T', rol: 'ADMIN', exp: 9999999999 })).toString('base64url');
    expect(redirige(await pedir('/admin', undefined, `${cuerpo}.${firma}`))).toBe(true);
  });

  it.each([
    ['/admin/caja', 'ADMIN', true],
    ['/admin', 'MOZO', false],
    ['/admin', 'COCINERO', false],
    ['/cocina', 'COCINERO', true],
    ['/cocina', 'ADMIN', true],
    ['/cocina', 'MOZO', false],
    ['/comandas', 'MOZO', true],
    ['/comandas', 'ADMIN', true],
    ['/comandas', 'COCINERO', false],
  ])('%s con rol %s -> permitido: %s', async (p, rol, permitido) => {
    const res = await pedir(p, rol);
    expect(permitido ? pasa(res) : redirige(res)).toBe(true);
  });

  it('un usuario DESACTIVADO no entra aunque su cookie siga vigente', async () => {
    enBase.set(1, { activo: false });
    expect(redirige(await pedir('/admin', 'ADMIN'))).toBe(true);
  });

  it('un usuario BORRADO no entra', async () => {
    enBase.set(1, null);
    expect(redirige(await pedir('/cocina', 'COCINERO'))).toBe(true);
  });

  it('manda el rol de la base: un ADMIN degradado a MOZO ya no entra a /admin', async () => {
    enBase.set(1, { activo: true, rol: 'MOZO' });
    expect(redirige(await pedir('/admin', 'ADMIN'))).toBe(true);
  });
});
