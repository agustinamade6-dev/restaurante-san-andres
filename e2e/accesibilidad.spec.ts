import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PIN, ingresarPin } from './ayudas';

/**
 * Accesibilidad automática (axe, WCAG A/AA) de las pantallas de entrada. Es un piso, no una auditoría completa: axe
 * solo detecta una parte de los problemas.
 *
 * Las violaciones que YA existían (medidas el 2026-10-07) se anotan abajo con su cantidad de elementos, para que la
 * prueba falle ante un problema nuevo o ante más elementos afectados, sin bloquear lo pendiente del frontend.
 * Al corregir una, bajar o quitar su entrada: la prueba también falla si hay MENOS de lo anotado (así la lista no
 * queda desactualizada). Ver docs/auditoria/commit-15-calidad-de-pruebas.md ("Cambios visibles para el frontend").
 */
type Conocidas = Record<string, number>;

const CONOCIDAS = {
  // 2026-10-07: sin violaciones de button-name (nombres accesibles y se quitó el botón Power, que no tenía acción).
  inicio: {},
  modalPin: { 'color-contrast': 1 },
  comandas: { 'color-contrast': 4 },
} satisfies Record<string, Conocidas>;

async function violaciones(page: Page): Promise<Conocidas> {
  const resultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return Object.fromEntries(resultado.violations.map((v) => [v.id, v.nodes.length]));
}

test('pantalla de inicio: sin violaciones de accesibilidad distintas de las conocidas', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Restaurante San Andrés' })).toBeVisible();
  expect(await violaciones(page)).toEqual(CONOCIDAS.inicio);
});

test('modal del PIN: sin violaciones de accesibilidad distintas de las conocidas', async ({ page }) => {
  await ingresarPin(page, 'comandas', '12'); // abre el modal y deja el PIN a medias
  expect(await violaciones(page)).toEqual(CONOCIDAS.modalPin);
});

test('Comandas tras el ingreso del mozo: sin violaciones distintas de las conocidas', async ({ page }) => {
  await ingresarPin(page, 'comandas', PIN.MOZO);
  await expect(page).toHaveURL(/\/comandas$/);
  await page.waitForLoadState('networkidle');
  expect(await violaciones(page)).toEqual(CONOCIDAS.comandas);
});
