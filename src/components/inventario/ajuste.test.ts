import { describe, expect, it } from 'vitest';
import { leerCantidad, validarAjuste } from './ajuste';

describe('leerCantidad', () => {
  it('acepta coma o punto decimal', () => {
    expect(leerCantidad('2')).toBe(2);
    expect(leerCantidad('1,5')).toBe(1.5);
    expect(leerCantidad(' 0.25 ')).toBe(0.25);
  });

  it('rechaza vacío, texto, negativos y formatos raros', () => {
    for (const t of ['', '  ', 'abc', '-2', '1,5,2', '1e3', '2kg']) expect(leerCantidad(t)).toBeNaN();
  });
});

describe('validarAjuste', () => {
  const base = { cantidad: '3', sentido: 'sumar' as const, motivo: 'Compra al proveedor' };

  it('sumar da un delta positivo y el stock que va a quedar', () => {
    expect(validarAjuste(base, 10)).toEqual({ ok: true, delta: 3, motivo: 'Compra al proveedor', stockNuevo: 13, quedaNegativo: false });
  });

  it('restar da un delta negativo', () => {
    const r = validarAjuste({ ...base, sentido: 'restar', motivo: 'Rotura' }, 10);
    expect(r).toMatchObject({ ok: true, delta: -3, stockNuevo: 7 });
  });

  it('avisa si el stock queda negativo, pero lo permite (pudo venderse antes de registrar la compra)', () => {
    expect(validarAjuste({ ...base, sentido: 'restar', cantidad: '5' }, 2)).toMatchObject({ ok: true, stockNuevo: -3, quedaNegativo: true });
  });

  it('redondea el stock resultante a 3 decimales', () => {
    expect(validarAjuste({ ...base, cantidad: '0,2' }, 0.1)).toMatchObject({ stockNuevo: 0.3 });
  });

  it('el motivo se envía sin espacios de más', () => {
    expect(validarAjuste({ ...base, motivo: '  Merma  ' }, 1)).toMatchObject({ motivo: 'Merma' });
  });

  it('rechaza cantidad vacía, cero o demasiado grande (igual que el servidor)', () => {
    expect(validarAjuste({ ...base, cantidad: '' }, 1)).toMatchObject({ ok: false });
    expect(validarAjuste({ ...base, cantidad: '0' }, 1)).toEqual({ ok: false, error: 'La cantidad tiene que ser mayor a 0' });
    expect(validarAjuste({ ...base, cantidad: '1000001' }, 1)).toEqual({ ok: false, error: 'La cantidad es demasiado grande' });
    expect(validarAjuste({ ...base, cantidad: '1000000' }, 1)).toMatchObject({ ok: true });
  });

  it('el motivo es obligatorio: 3 a 200 caracteres, sin contar espacios', () => {
    expect(validarAjuste({ ...base, motivo: '  ab ' }, 1)).toMatchObject({ ok: false });
    expect(validarAjuste({ ...base, motivo: 'abc' }, 1)).toMatchObject({ ok: true });
    expect(validarAjuste({ ...base, motivo: 'x'.repeat(201) }, 1)).toMatchObject({ ok: false });
    expect(validarAjuste({ ...base, motivo: 'x'.repeat(200) }, 1)).toMatchObject({ ok: true });
  });
});
