# Commit 21 — Dependencias: producción sin vulnerabilidades conocidas (AT-37)

`fix(dependencias): deepmerge-ts 8 por override y parches de herramientas de desarrollo; riesgo aceptado documentado (AT-37)`

**Rama:** `fix/at37-dependencias` (desde `master`). **Archivos:** `package.json` (bloque `overrides`), `package-lock.json`. No toca código de la app.

## Resultado
| | Antes | Después |
|---|---|---|
| `npm audit --omit=dev` (producción) | 3 altas | **0** |
| `npm audit` (todo el árbol) | 25 (12 moderadas, 9 altas, 4 críticas) | 19 (10 moderadas, 5 altas, 4 críticas), todas de desarrollo |

## Producción — qué había y qué se hizo
Las 3 altas eran una sola cadena: `deepmerge-ts` < 8 (agotamiento de pila con grafos recursivos, GHSA-ggr8-5vv4-36mx) ← `@prisma/config` ← `prisma`.
Es la herramienta de línea de comandos de Prisma (carga de configuración); la app en ejecución no la importa, pero `npm audit` la cuenta porque
`@prisma/client` declara a `prisma` como dependencia. Corrección: `"overrides": { "deepmerge-ts": "^8.0.2" }`. `prisma` y `@prisma/client` siguen
en 6.19.3. Verificado: `prisma validate` y `prisma generate` funcionan.

**No se usó `npm audit fix` a secas para esto:** "arregla" la cadena **bajando `prisma` de 6.19.3 a 6.12.0** (una versión que el aviso no abarca)
mientras `@prisma/client` queda en 6.19.3 y los motores pasan a 6.12.0: un downgrade con versiones desparejadas. Se revirtió.
Con el override en su lugar, `npm audit fix` ya solo aplica parches de herramientas de desarrollo: `electron-builder` 26.15.3 → 26.17.0 (y sus
dependencias), `qs` 6.15.1 → 6.16.0, `http-cache-semantics` 4.2.0 → 4.3.0.

## Riesgo aceptado — 19 avisos que quedan, todos de desarrollo
Ninguna de estas herramientas viaja en la app instalada ni corre con datos del comercio: se ejecutan en la máquina de desarrollo o en el CI, sobre
código propio.

| Paquete (aviso) | Viene de | Por qué no se actualiza |
|---|---|---|
| `tinypool` ≤ 2.1.1 (crítica: contaminación de prototipo → ejecución de código en opciones de workers) y `@vitest/mocker` | `vitest` 3 | El arreglo es `vitest` 5 (cambio mayor): riesgo para los 901 tests, Stryker y la cobertura. Solo corre en desarrollo/CI sobre nuestro propio código. |
| `shell-quote` 1.8.4–1.10.0 (crítica) | `concurrently` | El "arreglo" que propone npm es **bajar** a `concurrently` 9.2.1 (hoy 10). Descartado. |
| `braces` (alta) | `eslint-config-next` | El "arreglo" propone `eslint-config-next` 14 (Next está en 16). Descartado. |
| `sprintf-js` | `electron-builder` | El "arreglo" propone bajar `electron-builder`. Descartado; ya se subió al último parche. |

**Cuándo revisar:** al subir de versión mayor `vitest` (migración propia, con la suite y Stryker), o cuando `concurrently`, `eslint-config-next` o
`electron-builder` publiquen una versión con la dependencia corregida. Volver a correr `npm audit` en cada cambio de dependencias.

## Cambios visibles para el frontend
Ninguno.

## Verificación
`tsc` 0 errores; `eslint` 0 errores (11 avisos de siempre); 901 tests; `npm run build`; 36 e2e verdes. Pendiente: que el CI confirme, y probar
`npm run dist:win` con `electron-builder` 26.17 antes de entregar el instalador.

## Lección
L-080 (ver `docs/lecciones-aprendidas.md`, fila 34).
