import { describe, expect, it } from 'vitest';
import { resultadoConError } from './useApi';

describe('resultadoConError', () => {
  const previo = { clave: '0:/api/caja?days=7', url: '/api/caja?days=7', data: { ventas: 12 }, error: '' };

  it('un reintento de la misma url que falla conserva los datos que había', () => {
    const r = resultadoConError(previo, '1:/api/caja?days=7', '/api/caja?days=7', null, 'Falló');
    expect(r).toEqual({ clave: '1:/api/caja?days=7', url: '/api/caja?days=7', data: { ventas: 12 }, error: 'Falló' });
  });

  it('si falla otra url (cambio de período) no muestra los datos de la anterior', () => {
    const r = resultadoConError(previo, '0:/api/caja?days=1', '/api/caja?days=1', null, 'Falló');
    expect(r.data).toBeNull();
    expect(r.error).toBe('Falló');
  });

  it('si la primera carga falla queda el valor inicial', () => {
    const vacio = { clave: null, url: null, data: [] as number[], error: '' };
    expect(resultadoConError(vacio, '0:/api/pedidos', '/api/pedidos', [], 'Sin conexión').data).toEqual([]);
  });
});
