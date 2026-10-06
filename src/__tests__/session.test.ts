import { afterEach, describe, expect, it } from 'vitest';
import { SESSION_MAX_AGE, signSession, verifySession } from '@/lib/session';

const user = { id: 3, nombre: 'Mozo Sala', rol: 'MOZO' };
const ORIGINAL_SECRET = process.env.SESSION_SECRET;

afterEach(() => {
  process.env.SESSION_SECRET = ORIGINAL_SECRET;
});

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

describe('sesión firmada', () => {
  it('firma y verifica: ida y vuelta', async () => {
    const token = await signSession(user);
    expect(await verifySession(token)).toEqual(user);
  });

  it('el token no es JSON legible con la identidad en claro como antes', async () => {
    const token = await signSession(user);
    expect(() => JSON.parse(token)).toThrow();
    expect(token.split('.')).toHaveLength(2);
  });

  it('rechaza la cookie del formato anterior (JSON plano fabricable)', async () => {
    expect(await verifySession(JSON.stringify({ id: 1, nombre: 'x', rol: 'ADMIN' }))).toBeNull();
  });

  it('rechaza un payload alterado (escalada de MOZO a ADMIN) aunque conserve la firma', async () => {
    const [, firma] = (await signSession(user)).split('.');
    const forjado = b64({ ...user, rol: 'ADMIN', exp: Math.floor(Date.now() / 1000) + 9999 });
    expect(await verifySession(`${forjado}.${firma}`)).toBeNull();
  });

  it('rechaza una firma alterada o ausente', async () => {
    const [body, firma] = (await signSession(user)).split('.');
    const mala = firma.slice(0, -2) + (firma.endsWith('AA') ? 'BB' : 'AA');
    expect(await verifySession(`${body}.${mala}`)).toBeNull();
    expect(await verifySession(`${body}.`)).toBeNull();
    expect(await verifySession(body)).toBeNull();
  });

  it('rechaza un token firmado con otro secreto', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(40);
    const token = await signSession(user);
    process.env.SESSION_SECRET = 'b'.repeat(40);
    expect(await verifySession(token)).toBeNull();
  });

  it('expira a las 12 horas (y no antes)', async () => {
    const t0 = Date.now();
    const token = await signSession(user, t0);
    expect(await verifySession(token, t0 + (SESSION_MAX_AGE - 5) * 1000)).toEqual(user);
    expect(await verifySession(token, t0 + (SESSION_MAX_AGE + 5) * 1000)).toBeNull();
  });

  it.each([undefined, null, '', 'basura', 'a.b', 'a.b.c'])('rechaza token inválido (%s)', async (t) => {
    expect(await verifySession(t as string)).toBeNull();
  });

  it('rechaza un payload firmado con campos de tipo incorrecto', async () => {
    const token = await signSession({ id: '3' as unknown as number, nombre: 'x', rol: 'MOZO' });
    expect(await verifySession(token)).toBeNull();
  });

  it('en producción sin SESSION_SECRET falla cerrado en vez de usar un secreto por defecto', async () => {
    const env = process.env as Record<string, string | undefined>;
    const nodeEnv = env.NODE_ENV;
    try {
      delete env.SESSION_SECRET;
      env.NODE_ENV = 'production';
      await expect(signSession(user)).rejects.toThrow('SESSION_SECRET');
    } finally {
      env.NODE_ENV = nodeEnv;
    }
  });

  it('REGRESIÓN: sin SESSION_SECRET (desarrollo) ya no se acepta una sesión firmada con el texto fijo publicado', async () => {
    delete (process.env as Record<string, string | undefined>).SESSION_SECRET;
    const { createHmac } = await import('node:crypto');
    const cuerpo = b64({ id: 1, nombre: 'Intruso', rol: 'ADMIN', exp: Math.floor(Date.now() / 1000) + 3600 });
    const firma = createHmac('sha256', 'dev-only-insecure-secret-change-me-0123456789').update(cuerpo).digest('base64url');
    expect(await verifySession(`${cuerpo}.${firma}`)).toBeNull();
    // El secreto aleatorio del proceso sigue firmando y verificando normalmente.
    expect(await verifySession(await signSession(user))).toEqual(user);
  });
});
