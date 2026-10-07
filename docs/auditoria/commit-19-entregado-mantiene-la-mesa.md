# Commit 19 — "Entregado" mantiene la mesa ocupada hasta el cobro (AT-39)

`fix(mesas): un pedido entregado y sin cobrar mantiene la mesa ocupada hasta el cobro o la cancelación`

**Rama:** `fix/entregado-mantiene-mesa` (encima de `fix/migraciones-intermitente`).
**Archivos principales:** `src/lib/mesas.ts`, `src/app/api/pedidos/route.ts`, `src/__tests__/pedidos-estados.test.ts`,
`src/__tests__/mesas.test.ts`, `e2e/flujo-critico.spec.ts`.

## Hallazgo AT-39 — La mesa volvía a "libre" al marcar el pedido como entregado, sin haberlo cobrado
**Ubicación:** API | `PATCH /api/pedidos` (estado `entregado`), `src/lib/mesas.ts`
**Tipo:** Regla de negocio
**Descripción:** al pasar un pedido a `entregado`, la mesa se marcaba `libre` si no tenía otros pedidos activos. Pero "entregado" significa
servido, no pagado: el cliente sigue sentado hasta el cobro. Lo detectó Agustín al documentar el flujo y lo confirmó el backend en el código
(`PEDIDOS_QUE_OCUPAN_MESA` no incluía `entregado` y un test lo daba por bueno).
**Consecuencias:** un mozo podía sentar gente nueva en una mesa que todavía tenía una cuenta sin cobrar; el plano mostraba mal la ocupación.
**Decisión (del usuario, 2026-10-07):** `entregado` mantiene la mesa ocupada hasta el cobro (`pagado`) o la cancelación.
**Arreglo:**
- `PEDIDOS_QUE_OCUPAN_MESA` incluye `entregado` (y `PEDIDOS_QUE_BLOQUEAN_BORRADO` pasa a ser la misma lista).
- Al pasar a `entregado`, la mesa queda `ocupada` (antes: `libre` o sin cambio).
- Consecuencias en el resto, sin tocar su código: el cobro libera la mesa solo si no quedan otros pedidos sin cobrar; cancelar un pedido
  entregado la libera solo si no quedan otros; y `PATCH /api/mesas` ya no deja marcar `libre` a mano una mesa con un pedido entregado sin cobrar.
**Tests:** `REGRESIÓN:` entregado mantiene la mesa ocupada y recién el cobro la libera; `REGRESIÓN:` cancelar un entregado libera la mesa solo si no
quedan otros sin cobrar; `REGRESIÓN:` no se puede marcar libre a mano una mesa con un entregado. Los 5 tests nuevos o cambiados fallan sin el arreglo.
El e2e de punta a punta ahora comprueba mesa `ocupada` tras entregar y `libre` tras cobrar.
**Impacto:** Medio · **Esfuerzo estimado:** Bajo

## Cambios visibles para el frontend
- **`mesa.estado` tras marcar `entregado`:** ahora `ocupada` (antes `libre`). El evento `mesa:actualizada` se emite con ese estado.
- **Plano de Comandas:** los contadores "Ocupadas/Libres" cuentan como ocupadas las mesas servidas sin cobrar. La pantalla ya abre el pedido de
  toda mesa que no está `libre` (`mesa.estado !== 'libre'`) y cobra sobre `pedidos[0]`, así que no necesita cambios; conviene revisarlo con una prueba manual.
- **`PATCH /api/mesas` con `estado: 'libre'`:** responde 400 si la mesa tiene un pedido entregado sin cobrar.
- **Datos ya guardados:** una mesa que hoy figura `libre` con un pedido entregado sin cobrar (hecho antes de este cambio) no se corrige sola; se normaliza
  al cobrar o al volver a tocar el pedido. La app aún no se usa con datos reales, por eso no se agregó una migración.

## Verificación
Ejecutado el 2026-10-07 sobre este commit: `tsc` sin errores; `eslint` 0 errores; `npm run test:cobertura` **32 archivos, 892 tests verdes**, líneas 95,55 %; `npm run build` verde; `npm run test:e2e` **36 verdes dos veces seguidas**.

## Prueba intermitente que apareció al verificar
Una de las ocho pruebas de accesibilidad de `/admin` (escritorio) falló 1 de cada 6 veces con `color-contrast: 1`: se medía a mitad del fade-in de entrada, porque justo después de navegar la lista de animaciones estaba vacía y la espera de `e2e/accesibilidad.spec.ts` pasaba de inmediato. Ahora se congelan animaciones y transiciones antes de medir; **24 de 24 repeticiones** en verde y 36 e2e verdes dos veces. Lección L-078.

## Pendientes
- Prueba manual del plano de Comandas con una mesa servida sin cobrar (Agustín).
