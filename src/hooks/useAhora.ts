'use client';

import { useSyncExternalStore } from 'react';

/**
 * Hora actual (ms) que avanza sola cada `cadaMs` (por defecto 30 s), para tiempos transcurridos ("hace 12 min",
 * demorado) o un reloj. Leer Date.now() durante el render da valores distintos en cada render y no se actualiza
 * si nada más cambia; con este reloj la pantalla se vuelve a dibujar sola. Un intervalo por cada `cadaMs`,
 * compartido por todos los componentes que lo usan. Devuelve 0 en el servidor (antes de hidratar).
 */
interface Reloj {
  ahora: number;
  oyentes: Set<() => void>;
  intervalo: ReturnType<typeof setInterval> | null;
  suscribir: (avisar: () => void) => () => void;
  leer: () => number;
}

const relojes = new Map<number, Reloj>();

function reloj(cadaMs: number): Reloj {
  let r = relojes.get(cadaMs);
  if (r) return r;
  const nuevo: Reloj = {
    ahora: 0,
    oyentes: new Set(),
    intervalo: null,
    suscribir: (avisar) => {
      nuevo.oyentes.add(avisar);
      if (!nuevo.intervalo) {
        nuevo.ahora = Date.now();
        nuevo.intervalo = setInterval(() => {
          nuevo.ahora = Date.now();
          nuevo.oyentes.forEach((o) => o());
        }, cadaMs);
      }
      return () => {
        nuevo.oyentes.delete(avisar);
        if (nuevo.oyentes.size === 0 && nuevo.intervalo) {
          clearInterval(nuevo.intervalo);
          nuevo.intervalo = null;
        }
      };
    },
    leer: () => nuevo.ahora,
  };
  relojes.set(cadaMs, nuevo);
  r = nuevo;
  return r;
}

const enServidor = () => 0;

export function useAhora(cadaMs = 30_000): number {
  const r = reloj(cadaMs);
  return useSyncExternalStore(r.suscribir, r.leer, enServidor);
}
