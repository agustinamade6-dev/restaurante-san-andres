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

  it('REGRESIÓN: el gris 400 de la paleta se lee (AA) sobre su propio fondo al 20 % en todos los fondos del tema', () => {
    // La medalla "#2" de "Platos más vendidos" (text-gray-400 sobre bg-gray-400/20) daba 4,26:1 con #86939b y el CI de
    // accesibilidad en móvil falló. Solo aparece cuando hay ventas, por eso no se veía con la base vacía.
    const css = leer('app/globals.css');
    const color = (nombre: string) => css.match(new RegExp(`--${nombre}:\\s*(#[0-9a-f]{6})`))![1];
    const canales = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const luminancia = (rgb: number[]) => {
      const [r, g, b] = rgb.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const gris = canales(color('color-gray-400'));
    for (const fondo of ['background', 'card', 'card-hover'].map((n) => canales(color(n)))) {
      const mezcla = gris.map((v, i) => Math.round(v * 0.2 + fondo[i] * 0.8));
      const contraste = (luminancia(gris) + 0.05) / (luminancia(mezcla) + 0.05);
      expect(contraste).toBeGreaterThanOrEqual(4.5);
    }
  });
});
