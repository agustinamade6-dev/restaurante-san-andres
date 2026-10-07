import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * En JSX, `é` escrito como texto de la pantalla (entre etiquetas) NO se convierte en "é": se muestra tal cual.
 * Dentro de comillas o de un template de JavaScript sí se convierte, así que esos casos no se revisan.
 */
function archivosTsx(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'api' ? [] : archivosTsx(ruta);
    return e.name.endsWith('.tsx') ? [ruta] : [];
  });
}

/** Texto entre `>` y `<` (o `{`) que contiene una secuencia \uXXXX. */
const ESCAPE_EN_TEXTO = />[^<>{}]*\\u[0-9a-fA-F]{4}[^<>{}]*</;

describe('textos de las pantallas', () => {
  const raiz = join(__dirname, '..');
  const archivos = [...archivosTsx(join(raiz, 'app')), ...archivosTsx(join(raiz, 'components'))];

  it('hay pantallas para revisar', () => {
    expect(archivos.length).toBeGreaterThan(10);
  });

  it('REGRESIÓN: ningún texto de pantalla tiene escapes \\uXXXX sin convertir (Cobro mostraba "M\\u00e9todo de Pago")', () => {
    const hallazgos = archivos.flatMap((archivo) =>
      readFileSync(archivo, 'utf8')
        .split(/\r?\n/)
        .map((linea, i) => ({ linea, n: i + 1 }))
        .filter(({ linea }) => ESCAPE_EN_TEXTO.test(linea))
        .map(({ n, linea }) => `${relative(raiz, archivo)}:${n}: ${linea.trim()}`)
    );
    expect(hallazgos).toEqual([]);
  });

  it('el patrón detecta el caso del error y respeta los textos entre comillas', () => {
    expect(ESCAPE_EN_TEXTO.test('<h3 className="x">M\\u00e9todo de Pago</h3>')).toBe(true);
    expect(ESCAPE_EN_TEXTO.test("mostrarAviso({ msg: 'Error de conexi\\u00f3n' })")).toBe(false);
  });
});
