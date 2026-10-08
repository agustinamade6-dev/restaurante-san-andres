import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = join(__dirname, '..');
const leer = (ruta: string) => readFileSync(join(src, ruta), 'utf8');

describe('identidad visual de AKROS Café', () => {
  const pantallasConMarca = ['app/page.tsx', 'app/cocina/page.tsx', 'app/comandas/page.tsx', 'app/admin/layout.tsx'];

  it.each(pantallasConMarca)('%s muestra la marca de agua y la deja detrás del contenido (isolate)', (ruta) => {
    const codigo = leer(ruta);
    expect(codigo).toContain('<MarcaDeAgua />');
    // Sin un contexto de apilamiento propio, el -z-10 la manda detrás del fondo de la página y desaparece.
    expect(codigo).toMatch(/className="[^"]*\bisolate\b[^"]*">\s*<MarcaDeAgua \/>/);
  });

  it('la imagen de la marca de agua existe', () => {
    expect(existsSync(join(src, '..', 'public', 'logo-taza-dorada.png'))).toBe(true);
  });

  it('globals.css redefine las familias de Tailwind con la paleta de la marca', () => {
    const css = leer('app/globals.css');
    expect(css).toMatch(/--color-amber-500:\s*#d4a656/); // caramelo dorado, el de la taza
    expect(css).toMatch(/--color-purple-700:\s*#02399e/); // azul real de "AKROS"
    expect(css).toMatch(/--accent:\s*#d4a656/);
  });
});
