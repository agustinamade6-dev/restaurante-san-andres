import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { esSesionVencida, moduloDePagina, rutaApi, urlLogin } from '@/lib/sesion-vencida';

const ORIGEN = 'http://127.0.0.1:3000';

describe('esSesionVencida', () => {
  it('un 401 de la API estando en un módulo es sesión vencida', () => {
    expect(esSesionVencida(401, '/api/mesas', ORIGEN, '/comandas')).toBe(true);
    expect(esSesionVencida(401, `${ORIGEN}/api/caja?days=1`, ORIGEN, '/admin/caja')).toBe(true);
  });

  it('otros status no lo son (403 es falta de permiso, no sesión vencida)', () => {
    for (const status of [200, 400, 403, 404, 500]) {
      expect(esSesionVencida(status, '/api/mesas', ORIGEN, '/comandas')).toBe(false);
    }
  });

  it('un PIN incorrecto (401 de verify-pin o check-admin-pin) no es sesión vencida', () => {
    expect(esSesionVencida(401, '/api/auth/verify-pin', ORIGEN, '/comandas')).toBe(false);
    expect(esSesionVencida(401, '/api/auth/check-admin-pin', ORIGEN, '/comandas')).toBe(false);
  });

  it('en el inicio de sesión no redirige (evita un bucle)', () => {
    expect(esSesionVencida(401, '/api/mesas', ORIGEN, '/')).toBe(false);
  });

  it('ignora otros orígenes y rutas que no son /api', () => {
    expect(esSesionVencida(401, 'https://fonts.googleapis.com/css2', ORIGEN, '/comandas')).toBe(false);
    expect(esSesionVencida(401, '/uploads/foto.png', ORIGEN, '/comandas')).toBe(false);
  });
});

describe('rutaApi', () => {
  it('devuelve el pathname de una llamada a /api del mismo origen', () => {
    expect(rutaApi('/api/pedidos/3/items', ORIGEN)).toBe('/api/pedidos/3/items');
    expect(rutaApi(`${ORIGEN}/api/caja?days=7`, ORIGEN)).toBe('/api/caja');
    expect(rutaApi('http://otro:3000/api/caja', ORIGEN)).toBeNull();
  });
});

describe('moduloDePagina y urlLogin', () => {
  it('reconoce el módulo por el primer segmento de la ruta', () => {
    expect(moduloDePagina('/admin/caja')).toBe('admin');
    expect(moduloDePagina('/cocina')).toBe('cocina');
    expect(moduloDePagina('/comandas')).toBe('comandas');
    expect(moduloDePagina('/otra')).toBeNull();
    expect(moduloDePagina('/')).toBeNull();
  });

  it('arma la URL del inicio con el aviso y el módulo para reabrir su PIN', () => {
    expect(urlLogin('/admin/inventario')).toBe('/?sesion=vencida&modulo=admin');
    expect(urlLogin('/otra')).toBe('/?sesion=vencida');
  });
});

describe('instalarDeteccionSesionVencida', () => {
  let assign: ReturnType<typeof vi.fn>;
  let fetchOriginal: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    assign = vi.fn();
    fetchOriginal = vi.fn();
    vi.stubGlobal('window', {
      fetch: fetchOriginal,
      location: { origin: ORIGEN, pathname: '/admin/caja', assign },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('ante un 401 de la API vuelve al inicio una sola vez y devuelve la respuesta igual', async () => {
    const { instalarDeteccionSesionVencida } = await import('@/lib/sesion-vencida');
    fetchOriginal.mockResolvedValue(new Response('{}', { status: 401 }));
    instalarDeteccionSesionVencida();
    instalarDeteccionSesionVencida(); // idempotente: no envuelve dos veces

    const res = await window.fetch('/api/caja?days=1');
    await window.fetch('/api/inventario');

    expect(res.status).toBe(401);
    expect(fetchOriginal).toHaveBeenCalledTimes(2);
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('/?sesion=vencida&modulo=admin');
  });

  it('no redirige con un PIN incorrecto ni con respuestas OK', async () => {
    const { instalarDeteccionSesionVencida } = await import('@/lib/sesion-vencida');
    instalarDeteccionSesionVencida();
    fetchOriginal.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    await window.fetch('/api/auth/check-admin-pin', { method: 'POST' });
    fetchOriginal.mockResolvedValueOnce(new Response('[]', { status: 200 }));
    await window.fetch('/api/caja');
    expect(assign).not.toHaveBeenCalled();
  });

  it('verificarSesion vuelve al inicio solo si el servidor dice que no hay sesión', async () => {
    const { verificarSesion } = await import('@/lib/sesion-vencida');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 1 } }))));
    await verificarSesion();
    expect(assign).not.toHaveBeenCalled();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('sin conexión')));
    await verificarSesion();
    expect(assign).not.toHaveBeenCalled();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ user: null }))));
    await verificarSesion();
    expect(assign).toHaveBeenCalledWith('/?sesion=vencida&modulo=admin');
  });
});
