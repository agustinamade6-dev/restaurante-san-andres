'use client';

import { useCallback, useMemo, useState } from 'react';

type Clave = string | number;

/**
 * Evita el doble envío: mientras una acción con cierta clave está en curso, otra con la misma
 * clave se ignora. Se usa un Set propio (no el estado de React) para que el segundo clic,
 * que llega antes del re-render que deshabilita el botón, también se descarte.
 */
export function crearCandado(alCambiar: (ocupadas: ReadonlySet<Clave>) => void) {
  const ocupadas = new Set<Clave>();
  return async function ejecutar<T>(clave: Clave, accion: () => Promise<T>): Promise<T | undefined> {
    if (ocupadas.has(clave)) return undefined;
    ocupadas.add(clave);
    alCambiar(new Set(ocupadas));
    try {
      return await accion();
    } finally {
      ocupadas.delete(clave);
      alCambiar(new Set(ocupadas));
    }
  };
}

const UNICA = '__unica__';

/**
 * `ejecutar(accion)` bloquea toda la pantalla; `ejecutar(accion, id)` solo esa clave (p. ej., un pedido).
 * `enviando` / `ocupado(id)` sirven para deshabilitar los botones.
 */
export function useEnvio() {
  const [ocupadas, setOcupadas] = useState<ReadonlySet<Clave>>(new Set());
  const candado = useMemo(() => crearCandado(setOcupadas), []);
  const ejecutar = useCallback(
    <T,>(accion: () => Promise<T>, clave: Clave = UNICA) => candado(clave, accion),
    [candado]
  );
  const ocupado = useCallback((clave: Clave = UNICA) => ocupadas.has(clave), [ocupadas]);
  return { ejecutar, ocupado, enviando: ocupadas.has(UNICA) };
}
