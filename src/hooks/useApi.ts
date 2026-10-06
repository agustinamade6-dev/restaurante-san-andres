'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Carga datos de la API para una pantalla. El pedido se hace en un efecto y el estado se actualiza en el
 * `.then`, descartando respuestas viejas: si la URL cambia (p. ej., el período de Caja) antes de que llegue
 * la respuesta anterior, esa respuesta no pisa a la nueva.
 *
 * - `recargar()` vuelve a pedir la misma URL (después de guardar o eliminar, o ante un evento SSE).
 * - `cargando` es true hasta que llega la primera respuesta para la URL actual.
 * - `error` trae el mensaje de la API (`{ error }`) o de conexión; `data` conserva lo último cargado.
 */
export function useApi<T>(url: string | null, inicial: T) {
  const [version, setVersion] = useState(0);
  const clave = url === null ? null : `${version}:${url}`;
  const [resultado, setResultado] = useState<{ clave: string | null; data: T; error: string }>({
    clave: null,
    data: inicial,
    error: '',
  });

  useEffect(() => {
    if (url === null) return;
    let vigente = true;
    fetch(url)
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!vigente) return;
        setResultado((prev) =>
          res.ok
            ? { clave, data: json as T, error: '' }
            : { clave, data: prev.data, error: json?.error || 'No se pudieron cargar los datos' }
        );
      })
      .catch(() => {
        if (vigente) setResultado((prev) => ({ clave, data: prev.data, error: 'No se pudo conectar con el servidor' }));
      });
    return () => {
      vigente = false;
    };
  }, [url, clave]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  return { data: resultado.data, error: resultado.error, cargando: resultado.clave !== clave, recargar };
}
