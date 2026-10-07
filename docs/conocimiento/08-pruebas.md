# 8. Pruebas y calidad

Las pruebas son programas que revisan que la app haga lo que tiene que hacer. Se corren solas, en segundos, y
avisan si un cambio rompió algo que antes funcionaba. La guía completa está en [`docs/pruebas.md`](../pruebas.md);
acá va lo esencial para empezar.

## Los tipos de pruebas

| Tipo | Dónde | Qué revisa | Comando |
|---|---|---|---|
| **Unitarias y de rutas** | `src/__tests__/`, y `*.test.ts` junto a hooks y utilidades | La lógica: permisos, reglas de negocio, cálculos, hooks | `npm test` |
| **Contra SQLite real** | `integracion-sqlite`, `migraciones` | Lo que depende del motor: escrituras simultáneas, migraciones | `npm run test:integracion` |
| **De contrato** | `contratos-pantallas.test.ts` | Que la API acepte lo que cada pantalla manda y devuelva lo que lee | `npm test` |
| **De punta a punta (e2e)** | `e2e/` | La app real en un navegador: entrar con PIN, pedido → cocina → cobro → anulación, accesibilidad | `npm run test:e2e` |
| **De mutación** | `stryker.config.json` | Si las pruebas detectan cambios en la lógica | `npm run test:mutacion` |

## Antes de subir un cambio

```bash
npm test
npm run build
npx eslint .
```

Si tocaste pantallas, rutas o el ingreso, además:

```bash
npm run test:e2e
```

(La primera vez hace falta el navegador de pruebas: `npx playwright install chromium`.)

## Reglas

- Cada arreglo lleva una prueba que se llama `REGRESIÓN: ...` y que **falla sin el arreglo**.
- Las pruebas **nunca** usan tu `dev.db`: las de rutas simulan la base y las e2e crean una temporal.
- **Accesibilidad:** `e2e/accesibilidad.spec.ts` revisa todas las pantallas con axe (botones sin nombre, contraste,
  modales...). Hoy **no hay violaciones conocidas**. Si agregas una pantalla de `/admin`, súmala a la lista
  `PANTALLAS_ADMIN` del mismo archivo.
- **CI:** en cada pull request, GitHub corre automáticamente tipos, lint, pruebas con cobertura, build y e2e.

Siguiente: [Trabajo en equipo](09-trabajo-en-equipo.md).
