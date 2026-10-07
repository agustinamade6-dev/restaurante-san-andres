import { scrypt as scryptCb, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import prisma from '@/lib/prisma';
import { escritura } from '@/lib/transaccion';

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const PREFIX = 'scrypt1$';
export const PIN_REGEX = /^\d{4}$/;

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pin, salt, 32);
  return `${PREFIX}${salt.toString('hex')}$${key.toString('hex')}`;
}

function iguales(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Compara un PIN con el valor guardado: hash scrypt, o texto plano heredado de bases antiguas. */
export async function verificarPin(pin: string, guardado: string): Promise<boolean> {
  if (guardado.startsWith(PREFIX)) {
    const [, saltHex, hashHex] = guardado.split('$');
    if (!saltHex || !hashHex) return false;
    const key = await scrypt(pin, Buffer.from(saltHex, 'hex'), 32);
    return iguales(key, Buffer.from(hashHex, 'hex'));
  }
  return iguales(Buffer.from(pin), Buffer.from(guardado));
}

/**
 * Busca al usuario ACTIVO cuyo PIN coincide. El login es solo por PIN, por eso se comparan los
 * usuarios activos uno por uno (los hashes llevan sal, no se puede consultar por igualdad).
 * Si el PIN estaba en texto plano, se migra a hash en este mismo momento.
 */
export async function autenticarPin(pin: string) {
  const usuarios = await prisma.usuario.findMany({ where: { activo: true } });
  for (const u of usuarios) {
    if (await verificarPin(pin, u.pin)) {
      if (!u.pin.startsWith(PREFIX)) {
        const nuevoHash = await hashPin(pin);
        await escritura(() => prisma.usuario.update({ where: { id: u.id }, data: { pin: nuevoHash } }));
      }
      return u;
    }
  }
  return null;
}

/** ¿Algún otro usuario (activo o no) ya usa este PIN? */
export async function pinEnUso(pin: string, excluirId?: number): Promise<boolean> {
  const usuarios = await prisma.usuario.findMany({});
  for (const u of usuarios) {
    if (u.id === excluirId) continue;
    if (await verificarPin(pin, u.pin)) return true;
  }
  return false;
}
