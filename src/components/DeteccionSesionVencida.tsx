'use client';

import { useEffect } from 'react';
import { instalarDeteccionSesionVencida } from '@/lib/sesion-vencida';

/** Instala la detección de sesión vencida en todas las pantallas (ver lib/sesion-vencida.ts). */
export default function DeteccionSesionVencida() {
  useEffect(() => {
    instalarDeteccionSesionVencida();
  }, []);
  return null;
}
