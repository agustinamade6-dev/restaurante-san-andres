/**
 * Protección CSRF: rechaza peticiones que el navegador marca como originadas en OTRO sitio.
 *
 * La cookie de sesión ya es SameSite=Lax, pero "mismo sitio" para una IP incluye cualquier puerto de esa IP
 * (p. ej. otra app en http://192.168.0.10:8080 podría enviar un formulario a http://192.168.0.10:3000). Además, un
 * formulario con enctype="text/plain" puede armar un cuerpo que `request.json()` acepta. Por eso, además de la cookie:
 *   - `Sec-Fetch-Site: cross-site | same-site` → rechazo (los navegadores modernos lo envían siempre).
 *   - `Origin` presente y con un host distinto de `Host` → rechazo.
 * Una petición sin estos encabezados (herramientas, tests, el propio servidor) no se bloquea: no viene de una
 * página de otro sitio.
 */
export function origenPermitido(headers: Headers): boolean {
  const fetchSite = headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site' || fetchSite === 'same-site') return false;

  const origin = headers.get('origin');
  if (origin === null) return true; // sin Origin: no es una petición de otra página
  if (origin === 'null') return false; // origen opaco (iframe sandbox, archivo local)
  const host = (process.env.TRUST_PROXY === '1' && headers.get('x-forwarded-host')) || headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
