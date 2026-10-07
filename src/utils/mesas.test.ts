import { describe, expect, it } from 'vitest';
import { conservarPosiciones } from './mesas';

const mesa = (id: number, posX: number, posY: number, estado = 'libre') => ({ id, posX, posY, estado });

describe('conservarPosiciones', () => {
  it('toma el estado nuevo del servidor pero conserva las posiciones movidas en el editor', () => {
    const enPantalla = [mesa(1, 80, 20), mesa(2, 30, 40)];
    const nuevas = [mesa(1, 10, 10, 'ocupada'), mesa(2, 30, 40)];
    expect(conservarPosiciones(enPantalla, nuevas)).toEqual([mesa(1, 80, 20, 'ocupada'), mesa(2, 30, 40)]);
  });

  it('una mesa nueva aparece con la posición del servidor', () => {
    expect(conservarPosiciones([mesa(1, 80, 20)], [mesa(1, 10, 10), mesa(3, 50, 50)])).toEqual([
      mesa(1, 80, 20),
      mesa(3, 50, 50),
    ]);
  });

  it('una mesa eliminada en el servidor desaparece', () => {
    expect(conservarPosiciones([mesa(1, 80, 20), mesa(2, 30, 40)], [mesa(2, 0, 0)])).toEqual([mesa(2, 30, 40)]);
  });
});
