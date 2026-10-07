import { describe, expect, it } from 'vitest';
import { formatPesos } from './dinero';

describe('formatPesos', () => {
  it('usa punto de miles y no muestra decimales si no hay centavos', () => {
    expect(formatPesos(0)).toBe('$0');
    expect(formatPesos(950)).toBe('$950');
    expect(formatPesos(1500)).toBe('$1.500');
    expect(formatPesos(1234567)).toBe('$1.234.567');
  });

  it('muestra los centavos con coma cuando los hay', () => {
    expect(formatPesos(1500.5)).toBe('$1.500,50');
    expect(formatPesos(0.05)).toBe('$0,05');
  });

  it('redondea a centavos (errores de coma flotante incluidos)', () => {
    expect(formatPesos(0.1 + 0.2)).toBe('$0,30');
    expect(formatPesos(99.999)).toBe('$100');
    // Los montos llegan del backend en centavos enteros divididos por 100.
    expect(formatPesos(123456 / 100)).toBe('$1.234,56');
  });

  it('pone el signo antes del $ en los negativos (ventas anuladas)', () => {
    expect(formatPesos(-200)).toBe('-$200');
    expect(formatPesos(-1500.25)).toBe('-$1.500,25');
    expect(formatPesos(-0.001)).toBe('$0');
  });

  it('un valor no numérico se muestra como $0', () => {
    expect(formatPesos(NaN)).toBe('$0');
    expect(formatPesos(Infinity)).toBe('$0');
  });
});
