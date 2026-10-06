/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from './helpers/fakeDb';
import { cookieJar, loginAs, resetCookies } from './helpers/session';
import { reiniciarLimites, MAX_FALLOS, BLOQUEO_MS } from '@/lib/rate-limit';
import { hashPin } from '@/lib/pin';
import { verifySession } from '@/lib/session';

let db: ReturnType<typeof createFakeDb>;
vi.mock('@/lib/prisma', () => ({
  default: new Proxy({}, { get: (_t, prop) => (db.prisma as any)[prop] }),
}));
vi.mock('next/headers', async () => (await import('./helpers/session')).nextHeadersMock());

import { POST as verifyPin } from '@/app/api/auth/verify-pin/route';
import { POST as checkAdminPin } from '@/app/api/auth/check-admin-pin/route';
import { GET as getSession } from '@/app/api/auth/session/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { PATCH as cambiarPin } from '@/app/api/admin/usuarios/[id]/pin/route';
import { GET as listarUsuarios } from '@/app/api/admin/usuarios/route';

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const login = (body: unknown, headers?: Record<string, string>) =>
  verifyPin(post('http://localhost/api/auth/verify-pin', body, headers));

beforeEach(async () => {
  db = createFakeDb({
    usuarios: [
      { id: 1, nombre: 'Admin General', pin: '1111', rol: 'ADMIN', activo: true },
      { id: 2, nombre: 'Cocinero', pin: await hashPin('2222'), rol: 'COCINERO', activo: true },
      { id: 3, nombre: 'Mozo Sala', pin: await hashPin('3333'), rol: 'MOZO', activo: true },
      { id: 4, nombre: 'Baja', pin: await hashPin('4444'), rol: 'MOZO', activo: false },
    ],
  });
  resetCookies();
  reiniciarLimites();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/auth/verify-pin', () => {
  it('login correcto: devuelve el usuario y fija una cookie firmada, httpOnly y sameSite', async () => {
    const res = await login({ pin: '3333' });
    const data = await res.json();
    const cookie = cookieJar.sets[0];

    expect(res.status).toBe(200);
    expect(data).toEqual({ success: true, user: { id: 3, nombre: 'Mozo Sala', rol: 'MOZO' } });
    expect(cookie.name).toBe('session');
    expect(cookie.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 43200 });
    expect(await verifySession(cookie.value)).toEqual(data.user);
  });

  it('la respuesta nunca expone el PIN ni su hash', async () => {
    const text = JSON.stringify(await (await login({ pin: '3333' })).json());
    expect(text).not.toContain('3333');
    expect(text).not.toContain('scrypt');
  });

  it('cookie "secure" solo cuando la petición es HTTPS (el modo LAN usa http)', async () => {
    await login({ pin: '3333' });
    expect(cookieJar.sets[0].options.secure).toBe(false);

    resetCookies();
    await verifyPin(post('https://pos.local/api/auth/verify-pin', { pin: '3333' }));
    expect(cookieJar.sets[0].options.secure).toBe(true);
  });

  it('migra un PIN heredado en texto plano a hash tras un login correcto', async () => {
    expect((await login({ pin: '1111' })).status).toBe(200);
    expect(db.state.usuarios[0].pin).not.toBe('1111');
    expect((await login({ pin: '1111' })).status).toBe(200);
  });

  it.each([
    ['PIN incorrecto', { pin: '9999' }],
    ['usuario inactivo', { pin: '4444' }],
    ['PIN con formato inválido', { pin: 'abcd' }],
    ['PIN de longitud incorrecta', { pin: '12345' }],
    ['PIN no es string', { pin: { $ne: '' } }],
  ])('401 y sin cookie: %s', async (_n, body) => {
    const res = await login(body);

    expect(res.status).toBe(401);
    expect(cookieJar.sets).toHaveLength(0);
  });

  it('400 si falta el PIN o el JSON es inválido', async () => {
    expect((await login({})).status).toBe(400);
    expect((await login('{roto')).status).toBe(400);
  });

  it.each([
    ['admin', '3333'],
    ['cocina', '3333'],
    ['comandas', '2222'],
  ])('403 si el rol no corresponde al módulo %s y no deja sesión', async (modulo, pin) => {
    const res = await login({ pin, module: modulo });

    expect(res.status).toBe(403);
    expect(cookieJar.sets).toHaveLength(0);
  });

  it('el ADMIN entra a todos los módulos', async () => {
    for (const modulo of ['admin', 'cocina', 'comandas']) {
      expect((await login({ pin: '1111', module: modulo })).status).toBe(200);
    }
  });
});

describe('límite de intentos de PIN', () => {
  it(`tras ${MAX_FALLOS} fallos bloquea con 429 y Retry-After, incluso con el PIN correcto`, async () => {
    for (let i = 0; i < MAX_FALLOS; i++) expect((await login({ pin: '0000' })).status).toBe(401);

    const res = await login({ pin: '3333' });

    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(cookieJar.sets).toHaveLength(0);
  });

  it('el bloqueo termina pasado el tiempo', async () => {
    vi.useFakeTimers();
    for (let i = 0; i < MAX_FALLOS; i++) await login({ pin: '0000' });
    expect((await login({ pin: '3333' })).status).toBe(429);

    vi.setSystemTime(Date.now() + BLOQUEO_MS + 1000);

    expect((await login({ pin: '3333' })).status).toBe(200);
  });

  it('un login correcto reinicia el contador', async () => {
    for (let i = 0; i < MAX_FALLOS - 1; i++) await login({ pin: '0000' });
    expect((await login({ pin: '3333' })).status).toBe(200);
    for (let i = 0; i < MAX_FALLOS - 1; i++) expect((await login({ pin: '0000' })).status).toBe(401);
  });

  it('los intentos se cuentan por IP cuando hay proxy (x-forwarded-for)', async () => {
    const atacante = { 'x-forwarded-for': '10.0.0.9' };
    for (let i = 0; i < MAX_FALLOS; i++) await login({ pin: '0000' }, atacante);

    expect((await login({ pin: '3333' }, atacante)).status).toBe(429);
    expect((await login({ pin: '3333' }, { 'x-forwarded-for': '10.0.0.5' })).status).toBe(200);
  });
});

describe('GET /api/auth/session y logout', () => {
  it('devuelve el usuario con una sesión válida', async () => {
    await loginAs('MOZO', 3, 'Mozo Sala');
    expect(await (await getSession()).json()).toEqual({ user: { id: 3, nombre: 'Mozo Sala', rol: 'MOZO' } });
  });

  it('sin sesión devuelve user: null', async () => {
    expect(await (await getSession()).json()).toEqual({ user: null });
  });

  it('una cookie fabricada a mano (JSON plano con rol ADMIN) no cuenta como sesión', async () => {
    cookieJar.session = JSON.stringify({ id: 1, nombre: 'Intruso', rol: 'ADMIN' });
    expect(await (await getSession()).json()).toEqual({ user: null });
  });

  it('logout borra la cookie', async () => {
    await loginAs('MOZO', 3);
    expect((await logout()).status).toBe(200);
    expect(cookieJar.deleted).toContain('session');
  });
});

describe('POST /api/auth/check-admin-pin', () => {
  const check = (body: unknown) => checkAdminPin(post('http://localhost/api/auth/check-admin-pin', body));

  it('401 sin sesión: ya no se puede probar PINs de administrador sin autenticarse', async () => {
    expect((await check({ pin: '1111' })).status).toBe(401);
  });

  it('con sesión: acepta el PIN de un administrador y rechaza el de un mozo', async () => {
    await loginAs('MOZO', 3);
    expect((await check({ pin: '1111' })).status).toBe(200);
    expect((await check({ pin: '3333' })).status).toBe(403);
    expect((await check({ pin: '9999' })).status).toBe(401);
  });

  it('comparte el límite de intentos con el login', async () => {
    await loginAs('MOZO', 3);
    for (let i = 0; i < MAX_FALLOS; i++) await check({ pin: '0000' });
    expect((await check({ pin: '1111' })).status).toBe(429);
  });
});

describe('administración de usuarios', () => {
  const cambiar = (id: string, body: unknown) =>
    cambiarPin(
      new Request(`http://localhost/api/admin/usuarios/${id}/pin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) }
    );

  it('listar usuarios: 401 sin sesión, 403 para no-admin, y nunca incluye el PIN', async () => {
    expect((await listarUsuarios()).status).toBe(401);

    await loginAs('MOZO', 3);
    expect((await listarUsuarios()).status).toBe(403);

    await loginAs('ADMIN', 1);
    expect((await listarUsuarios()).status).toBe(200);
  });

  it('cambiar PIN: solo ADMIN', async () => {
    expect((await cambiar('3', { pin: '5555' })).status).toBe(401);
    await loginAs('MOZO', 3);
    expect((await cambiar('3', { pin: '5555' })).status).toBe(403);
    expect(db.state.usuarios[2].pin.startsWith('scrypt1$')).toBe(true); // intacto
  });

  it('cambiar PIN guarda hash y el nuevo PIN funciona para entrar', async () => {
    await loginAs('ADMIN', 1);

    expect((await cambiar('3', { pin: '5555' })).status).toBe(200);
    expect(db.state.usuarios[2].pin).not.toBe('5555');
    resetCookies();
    expect((await login({ pin: '5555' })).status).toBe(200);
    expect((await login({ pin: '3333' })).status).toBe(401);
  });

  it('rechaza un PIN ya usado por otro usuario (hasheado, heredado o de un inactivo)', async () => {
    await loginAs('ADMIN', 1);
    for (const pin of ['1111', '2222', '4444']) {
      const res = await cambiar('3', { pin });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Este PIN ya está en uso por otro usuario');
    }
  });

  it.each([['abc'], ['123'], ['12345'], [1234], [null]])('rechaza PIN inválido (%s)', async (pin) => {
    await loginAs('ADMIN', 1);
    expect((await cambiar('3', { pin })).status).toBe(400);
  });

  it('404 si el usuario no existe y 400 si el id no es válido', async () => {
    await loginAs('ADMIN', 1);
    expect((await cambiar('999', { pin: '5555' })).status).toBe(404);
    expect((await cambiar('abc', { pin: '5555' })).status).toBe(400);
  });
});
