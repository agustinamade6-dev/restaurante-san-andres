import { describe, expect, it } from 'vitest';
import { destinoTab } from './useDialogo';

describe('destinoTab (el foco no sale del modal)', () => {
  it('Tab en el último vuelve al primero', () => {
    expect(destinoTab(2, 3, false)).toBe(0);
  });

  it('Shift+Tab en el primero va al último', () => {
    expect(destinoTab(0, 3, true)).toBe(2);
  });

  it('en el medio deja que el navegador siga solo', () => {
    expect(destinoTab(1, 3, false)).toBeNull();
    expect(destinoTab(1, 3, true)).toBeNull();
  });

  it('con el foco en el contenedor entra por el primero (o por el último con Shift)', () => {
    expect(destinoTab(-1, 3, false)).toBe(0);
    expect(destinoTab(-1, 3, true)).toBe(2);
  });

  it('un modal sin elementos enfocables no hace nada', () => {
    expect(destinoTab(-1, 0, false)).toBeNull();
  });

  it('con un solo elemento, Tab y Shift+Tab se quedan en él', () => {
    expect(destinoTab(0, 1, false)).toBe(0);
    expect(destinoTab(0, 1, true)).toBe(0);
  });
});
