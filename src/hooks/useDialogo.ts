'use client';

import { useCallback, useEffect, useRef } from 'react';

const ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Con Tab en el primero/último elemento del modal: a cuál ir para no salir del modal.
 * Devuelve null si el navegador puede seguir solo (el foco no está en un extremo).
 */
export function destinoTab(actual: number, total: number, haciaAtras: boolean): number | null {
  if (total === 0) return null;
  if (actual === -1) return haciaAtras ? total - 1 : 0; // el foco está en el contenedor
  if (haciaAtras && actual === 0) return total - 1;
  if (!haciaAtras && actual === total - 1) return 0;
  return null;
}

/**
 * Props para el <div> de fondo de un modal ya existente: `<div {...dialogo} className="fixed inset-0 ...">`.
 * - Lo anuncia como diálogo modal con su nombre (lectores de pantalla).
 * - Escape lo cierra.
 * - Al abrirse lleva el foco adentro; Tab no sale del modal; al cerrarse devuelve el foco al botón que lo abrió.
 */
export function useDialogo(etiqueta: string, onCerrar: () => void) {
  // El ref callback tiene que ser estable (si cambia en cada render, React lo vuelve a montar
  // y el foco saltaría al primer campo en cada tecla). onCerrar se lee de una ref.
  const onCerrarRef = useRef(onCerrar);
  useEffect(() => {
    onCerrarRef.current = onCerrar;
  }, [onCerrar]);

  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const previo = document.activeElement as HTMLElement | null;
    const enfocables = () => Array.from(el.querySelectorAll<HTMLElement>(ENFOCABLES));

    // Si el modal ya tiene un campo con autoFocus, se respeta.
    if (!el.contains(document.activeElement)) (enfocables()[0] ?? el).focus();

    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCerrarRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const lista = enfocables();
      const destino = destinoTab(lista.indexOf(document.activeElement as HTMLElement), lista.length, e.shiftKey);
      if (destino !== null) {
        e.preventDefault();
        lista[destino].focus();
      }
    };
    el.addEventListener('keydown', alTeclear);
    return () => {
      el.removeEventListener('keydown', alTeclear);
      if (previo && document.contains(previo)) previo.focus();
    };
  }, []);

  return { ref, role: 'dialog', 'aria-modal': true, 'aria-label': etiqueta, tabIndex: -1 } as const;
}
