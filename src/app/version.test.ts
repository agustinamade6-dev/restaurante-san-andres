import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

function archivosTsx(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'api' ? [] : archivosTsx(ruta);
    return e.name.endsWith('.tsx') ? [ruta] : [];
  });
}

describe('versión de la app en pantalla', () => {
  const src = join(__dirname, '..');

  it('REGRESIÓN: ninguna pantalla escribe la versión a mano (el inicio decía "v1.2.0-POS" con la app en 0.1.1)', () => {
    const hallazgos = [...archivosTsx(join(src, 'app')), ...archivosTsx(join(src, 'components'))].flatMap((archivo) =>
      readFileSync(archivo, 'utf8')
        .split(/\r?\n/)
        .map((linea, i) => ({ linea, n: i + 1 }))
        .filter(({ linea }) => /[>"'`\s]v\d+\.\d+\.\d+/.test(linea))
        .map(({ n, linea }) => `${relative(src, archivo)}:${n}: ${linea.trim()}`)
    );
    expect(hallazgos).toEqual([]);
  });

  it('next.config expone la versión de package.json como NEXT_PUBLIC_APP_VERSION', () => {
    const config = readFileSync(join(src, '..', 'next.config.ts'), 'utf8');
    expect(config).toMatch(/NEXT_PUBLIC_APP_VERSION:\s*packageJson\.version/);
  });
});
