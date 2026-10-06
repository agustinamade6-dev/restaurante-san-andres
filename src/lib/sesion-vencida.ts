/**
 * Detección de sesión vencida en el cliente.
 *
 * La cookie de sesión dura 12 horas. Si vence con una pantalla abierta, la API responde 401 y, sin esto,
 * la pantalla parecería no hacer nada. Al detectar el 401 se vuelve al inicio para ingresar el PIN,
 * reabriendo el módulo donde estaba el usuario.
 */

// Responden 401 por PIN incorrecto, no por sesión vencida.
const RUTAS_DE_PIN = ['/api/auth/verify-pin', '/api/auth/check-admin-pin'];
const MODULOS = ['comandas', 'cocina', 'admin'] as const;
export type Modulo = (typeof MODULOS)[number];

/** Ruta de la API (pathname) de una URL de fetch, o null si no es una llamada a /api de este mismo origen. */
export function rutaApi(url: string, origen: string): string | null {
  try {
    const u = new URL(url, origen);
    if (u.origin !== origen || !u.pathname.startsWith('/api/')) return null;
    return u.pathname;
  } catch {
    return null;
  }
}

/** ¿Un 401 de esta URL, estando en esta página, significa que la sesión venció? */
export function esSesionVencida(status: number, url: string, origen: string, paginaActual: string): boolean {
  if (status !== 401) return false;
  if (paginaActual === '/') return false; // ya está en el inicio de sesión
  const ruta = rutaApi(url, origen);
  return ruta !== null && !RUTAS_DE_PIN.includes(ruta);
}

/** Módulo de una página (/admin/caja → admin), para reabrir su PIN al volver al inicio. */
export function moduloDePagina(pagina: string): Modulo | null {
  const primero = pagina.split('/')[1];
  return (MODULOS as readonly string[]).includes(primero) ? (primero as Modulo) : null;
}

/** URL del inicio de sesión con el aviso de sesión vencida. */
export function urlLogin(paginaActual: string): string {
  const modulo = moduloDePagina(paginaActual);
  return modulo ? `/?sesion=vencida&modulo=${modulo}` : '/?sesion=vencida';
}

let redirigiendo = false;

export function irAlLogin(): void {
  if (redirigiendo || window.location.pathname === '/') return;
  redirigiendo = true;
  window.location.assign(urlLogin(window.location.pathname));
}

/**
 * Envuelve window.fetch una sola vez: ante un 401 que indica sesión vencida, vuelve al inicio.
 * La respuesta se devuelve igual, para no romper a quien hizo la llamada mientras la página se va.
 */
export function instalarDeteccionSesionVencida(): void {
  const w = window as Window & { __sesionVencidaInstalada?: boolean };
  if (w.__sesionVencidaInstalada) return;
  w.__sesionVencidaInstalada = true;

  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await original(input, init);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (esSesionVencida(res.status, url, window.location.origin, window.location.pathname)) irAlLogin();
    return res;
  };
}

/** Para useSSE: el EventSource no expone el status; se pregunta si la sesión sigue viva. */
export async function verificarSesion(): Promise<void> {
  try {
    const res = await fetch('/api/auth/session');
    if (!res.ok) return;
    const data = await res.json();
    if (!data.user) irAlLogin();
  } catch {
    // Sin conexión con el servidor: no es una sesión vencida; useSSE seguirá reintentando.
  }
}
