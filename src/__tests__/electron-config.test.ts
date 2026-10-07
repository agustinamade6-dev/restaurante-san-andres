import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const { DEFAULT_CONFIG, migrarNegocio } = createRequire(import.meta.url)('../../electron/config.js');

const VIEJO = { nombre: 'Restaurante San Andrés', cuit: '30-12345678-9', direccion: 'Av. San Martín 1234, San Andrés' };

describe('config de la app de escritorio — cambio de nombre a AKROS Café', () => {
  it('REGRESIÓN: un config.json con los datos de ejemplo viejos pasa a los nuevos, conservando el resto', () => {
    const { config, cambio } = migrarNegocio({ port: 3100, lan: true, negocio: { ...VIEJO } });

    expect(cambio).toBe(true);
    expect(config).toEqual({ port: 3100, lan: true, negocio: DEFAULT_CONFIG.negocio });
  });

  it('no pisa lo que el comercio editó (solo reemplaza los campos que siguen siendo los de ejemplo)', () => {
    const { config, cambio } = migrarNegocio({ negocio: { ...VIEJO, nombre: 'La Parrilla', cuit: '20-1-2' } });

    expect(cambio).toBe(true);
    expect(config.negocio).toEqual({ nombre: 'La Parrilla', cuit: '20-1-2', direccion: DEFAULT_CONFIG.negocio.direccion });
  });

  it('sin nada que migrar devuelve el mismo objeto y cambio=false (no reescribe el archivo)', () => {
    const actual = { negocio: { nombre: 'AKROS Café', cuit: '1', direccion: 'X' } };
    const r = migrarNegocio(actual);

    expect(r.cambio).toBe(false);
    expect(r.config).toBe(actual);
  });

  it('tolera un config sin sección negocio o con una sección inválida', () => {
    expect(migrarNegocio({ port: 3000 }).cambio).toBe(false);
    expect(migrarNegocio({ negocio: null }).cambio).toBe(false);
    expect(migrarNegocio(null).cambio).toBe(false);
  });

  it('el nombre por defecto es AKROS Café', () => {
    expect(DEFAULT_CONFIG.negocio.nombre).toBe('AKROS Café');
  });
});
