'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Un aviso que se borra solo. Mostrar otro cancela el temporizador del anterior: si no,
 * el temporizador viejo borraba antes de tiempo el aviso nuevo.
 */
export function crearAvisoTemporal<T>(asignar: (valor: T | null) => void) {
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  const cancelar = () => {
    if (temporizador) clearTimeout(temporizador);
    temporizador = null;
  };
  return {
    /** Sin `ms`, el aviso queda hasta que se oculte o se muestre otro. */
    mostrar(valor: T, ms?: number) {
      cancelar();
      asignar(valor);
      if (ms !== undefined) {
        temporizador = setTimeout(() => {
          temporizador = null;
          asignar(null);
        }, ms);
      }
    },
    ocultar() {
      cancelar();
      asignar(null);
    },
    /** Al desmontar la pantalla: cancela sin tocar el estado. */
    cancelar,
  };
}

export function useAviso<T>() {
  const [aviso, setAviso] = useState<T | null>(null);
  const control = useMemo(() => crearAvisoTemporal<T>(setAviso), []);
  useEffect(() => control.cancelar, [control]);
  const mostrar = useCallback((valor: T, ms?: number) => control.mostrar(valor, ms), [control]);
  const ocultar = useCallback(() => control.ocultar(), [control]);
  return { aviso, mostrar, ocultar };
}
