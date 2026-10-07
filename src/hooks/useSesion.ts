'use client';

import type { SessionUser } from '@/lib/session';
import { useApi } from '@/hooks/useApi';

/**
 * Usuario logueado en esta terminal según el servidor (GET /api/auth/session), o null si no hay sesión.
 * El servidor valida en la base que el usuario siga activo y devuelve su rol actual.
 * Mientras carga (o si la consulta falla) `usuario` es null: no mostrar nada que requiera sesión.
 */
export function useSesion() {
  const { data, cargando, error, recargar } = useApi<{ user: SessionUser | null } | null>('/api/auth/session', null);
  const usuario = data?.user ?? null;
  return { usuario, esAdmin: usuario?.rol === 'ADMIN', cargando, error, recargar };
}
