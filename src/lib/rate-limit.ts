/**
 * Límite de intentos fallidos de PIN, en memoria (se reinicia al reiniciar el servidor).
 * Con PIN de 4 dígitos (10.000 combinaciones) y 10 fallos / 5 min, probarlos todos llevaría días.
 *
 * Clave = IP indicada por un proxy (x-forwarded-for) o "local". Sin proxy, en modo LAN todos los
 * equipos comparten la clave "local": un atacante podría bloquear temporalmente el login de todos.
 * Es una compensación aceptada y documentada.
 */
export const MAX_FALLOS = 10;
export const VENTANA_MS = 5 * 60 * 1000;
export const BLOQUEO_MS = 60 * 1000;

interface Entrada {
  fallos: number;
  desde: number;
  bloqueadoHasta: number;
}

const g = globalThis as unknown as { __loginIntentos?: Map<string, Entrada> };
const intentos: Map<string, Entrada> = (g.__loginIntentos ??= new Map());

export function claveCliente(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0].trim() || 'local';
}

/** Segundos que faltan para poder reintentar (0 = no bloqueado). */
export function segundosBloqueado(clave: string, ahora: number = Date.now()): number {
  const e = intentos.get(clave);
  if (!e || e.bloqueadoHasta <= ahora) return 0;
  return Math.ceil((e.bloqueadoHasta - ahora) / 1000);
}

export function registrarFallo(clave: string, ahora: number = Date.now()): void {
  if (intentos.size > 1000) {
    for (const [k, v] of intentos) if (v.bloqueadoHasta <= ahora && ahora - v.desde > VENTANA_MS) intentos.delete(k);
  }
  let e = intentos.get(clave);
  if (!e || ahora - e.desde > VENTANA_MS) {
    e = { fallos: 0, desde: ahora, bloqueadoHasta: 0 };
    intentos.set(clave, e);
  }
  e.fallos += 1;
  if (e.fallos >= MAX_FALLOS) {
    e.bloqueadoHasta = ahora + BLOQUEO_MS;
    e.fallos = 0;
    e.desde = ahora;
  }
}

export function registrarExito(clave: string): void {
  intentos.delete(clave);
}

/** Solo para tests. */
export function reiniciarLimites(): void {
  intentos.clear();
}
