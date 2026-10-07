'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Resultado<T> = { clave: string | null; url: string | null; data: T; error: string };

/**
 * Estado después de un error. Se conservan los datos anteriores solo si son de la MISMA url
 * (un reintento o una recarga por SSE que falló): mostrar los de otra url, p. ej. el período
 * anterior de Caja con "Hoy" seleccionado, sería mostrar datos equivocados.
 */
export function resultadoConError<T>(
  prev: Resultado<T>,
  clave: string,
  url: string,
  inicial: T,
  error: string
): Resultado<T> {
  return { clave, url, data: prev.url === url ? prev.data : inicial, error };
}

/**
 * Carga datos de la API para una pantalla. El pedido se hace en un efecto y el estado se actualiza en el
 * `.then`, descartando respuestas viejas: si la URL cambia (p. ej., el período de Caja) antes de que llegue
 * la respuesta anterior, esa respuesta no pisa a la nueva.
 *
 * - `recargar()` vuelve a pedir la misma URL (después de guardar o eliminar, o ante un evento SSE).
 * - `cargando` es true hasta que llega la primera respuesta para la URL actual.
 * - `error` trae el mensaje de la API (`{ error }`) o de conexión. `data` conserva lo último cargado
 *   de esa misma URL; si no hay, vuelve a `inicial`. Mostrarlo con <ErrorDeCarga>.
 */
export function useApi<T>(url: string | null, inicial: T) {
  const [version, setVersion] = useState(0);
  const clave = url === null ? null : `${version}:${url}`;
  // `inicial` suele ser un literal ([] o null) nuevo en cada render: se lee de una ref para no relanzar el efecto.
  const inicialRef = useRef(inicial);
  const [resultado, setResultado] = useState<Resultado<T>>({
    clave: null,
    url: null,
    data: inicial,
    error: '',
  });

  useEffect(() => {
    if (url === null || clave === null) return;
    let vigente = true;
    fetch(url)
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!vigente) return;
        setResultado((prev) =>
          res.ok
            ? { clave, url, data: json as T, error: '' }
            : resultadoConError(prev, clave, url, inicialRef.current, json?.error || 'No se pudieron cargar los datos')
        );
      })
      .catch(() => {
        if (vigente) {
          setResultado((prev) => resultadoConError(prev, clave, url, inicialRef.current, 'No se pudo conectar con el servidor'));
        }
      });
    return () => {
      vigente = false;
    };
  }, [url, clave]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  return { data: resultado.data, error: resultado.error, cargando: resultado.clave !== clave, recargar };
}
