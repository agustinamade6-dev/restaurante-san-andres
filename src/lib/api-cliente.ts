/**
 * Ayuda para las pantallas: hace un pedido a la API y devuelve el mensaje de error para mostrar,
 * o null si salió bien. Las rutas responden { error: "..." } en los 4xx/5xx.
 */
export async function enviar(url: string, init: RequestInit, porDefecto: string): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    return 'No se pudo conectar con el servidor';
  }
  if (res.ok) return null;
  const data = await res.json().catch(() => null);
  return typeof data?.error === 'string' && data.error ? data.error : porDefecto;
}

/** Atajo para enviar un JSON con el método dado. */
export function enviarJson(url: string, method: string, body: unknown, porDefecto: string): Promise<string | null> {
  return enviar(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, porDefecto);
}
