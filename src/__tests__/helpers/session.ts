/* eslint-disable @typescript-eslint/no-explicit-any */
import { signSession } from '@/lib/session';

/** Cookie jar compartido con el mock de next/headers (ver vi.mock en cada test). */
export const cookieJar = {
  session: undefined as string | undefined,
  sets: [] as { name: string; value: string; options: any }[],
  deleted: [] as string[],
};

export function makeCookieStore() {
  return {
    get: (name: string) => (name === 'session' && cookieJar.session ? { name, value: cookieJar.session } : undefined),
    set: (name: string, value: string, options: any) => {
      cookieJar.sets.push({ name, value, options });
      if (name === 'session') cookieJar.session = value;
    },
    delete: (name: string) => {
      cookieJar.deleted.push(name);
      if (name === 'session') cookieJar.session = undefined;
    },
  };
}

export async function loginAs(rol: string, id = 1, nombre = 'Test') {
  cookieJar.session = await signSession({ id, nombre, rol });
}

export function logout() {
  cookieJar.session = undefined;
}

export function resetCookies() {
  cookieJar.session = undefined;
  cookieJar.sets.length = 0;
  cookieJar.deleted.length = 0;
}

/** Factoría para vi.mock('next/headers', ...) */
export const nextHeadersMock = async () => ({ cookies: async () => makeCookieStore() });
