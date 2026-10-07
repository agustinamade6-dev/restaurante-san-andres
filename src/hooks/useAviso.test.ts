import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearAvisoTemporal } from './useAviso';

describe('crearAvisoTemporal', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('muestra el aviso y lo borra al vencer el tiempo', () => {
    const asignar = vi.fn();
    const aviso = crearAvisoTemporal<string>(asignar);
    aviso.mostrar('Guardado', 3000);
    expect(asignar).toHaveBeenLastCalledWith('Guardado');
    vi.advanceTimersByTime(3000);
    expect(asignar).toHaveBeenLastCalledWith(null);
  });

  it('un aviso nuevo no lo borra el temporizador del anterior', () => {
    const asignar = vi.fn();
    const aviso = crearAvisoTemporal<string>(asignar);
    aviso.mostrar('Primero', 3000);
    vi.advanceTimersByTime(2000);
    aviso.mostrar('Segundo', 3000);
    vi.advanceTimersByTime(1500); // acá vencía el del primero
    expect(asignar).toHaveBeenLastCalledWith('Segundo');
    vi.advanceTimersByTime(1500);
    expect(asignar).toHaveBeenLastCalledWith(null);
  });

  it('sin tiempo, el aviso queda hasta ocultarlo', () => {
    const asignar = vi.fn();
    const aviso = crearAvisoTemporal<string>(asignar);
    aviso.mostrar('Sin conexión');
    vi.advanceTimersByTime(60_000);
    expect(asignar).toHaveBeenLastCalledWith('Sin conexión');
    aviso.ocultar();
    expect(asignar).toHaveBeenLastCalledWith(null);
  });

  it('cancelar (al salir de la pantalla) no vuelve a tocar el estado', () => {
    const asignar = vi.fn();
    const aviso = crearAvisoTemporal<string>(asignar);
    aviso.mostrar('Hola', 3000);
    aviso.cancelar();
    vi.advanceTimersByTime(5000);
    expect(asignar).toHaveBeenCalledTimes(1);
  });
});
