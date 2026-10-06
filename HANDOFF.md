# HANDOFF — rama `fix/revision-pr1` (2026-10-06)
Backend de la revisión del PR #1 (desde `backend`). 7 commits, **sin subir a GitHub**. Detalle por commit: `docs/auditoria/commit-11` a `14`.

## Qué se implementó
- **Seguridad (AT-21..27):** límite de PIN sin confiar en `X-Forwarded-For` (salvo `TRUST_PROXY=1`) y bloqueo escalonado 1→15 min; `sesionVigente()` valida en la base que el usuario siga activo y toma su rol (API, proxy, `/api/auth/session`); SSE revalida la sesión en cada heartbeat; CSRF por `Origin`/`Sec-Fetch-Site`; `check-admin-pin` responde solo `{ success }`; `hub-metrics` exige sesión; secreto de desarrollo aleatorio.
- **Cálculos (AT-28..30):** propinas fuera del ingreso (`propinasMes`, `totalVentas`); costos llevados a su equivalente mensual; montos máx. $10.000.000 y totales verificados (Prisma `Int` es de 32 bits).
- **Pedidos (AT-31..34):** máquina de estados `TRANSICIONES`; `mesa:actualizada` ya actualizada y solo si cambió; cobro idempotente (`reintento: true`); `POST /api/inventario/ajuste` (delta + motivo); el `PUT` ya no reemplaza el stock.
- **Concurrencia (AT-35):** `transaccion()` pone las escrituras en fila. Sin esto, 5 cobros simultáneos en SQLite real daban 4 errores 500.
- Lint del repo sin errores; lecciones aprendidas en `docs/lecciones-aprendidas.md` y `~/.claude/conocimiento/`.

## Archivos principales
`src/lib/`: `auth.ts`, `origen.ts`, `rate-limit.ts`, `session.ts`, `costos.ts`, `money.ts`, `pedidos.ts`, `stock.ts`, `transaccion.ts`, `migraciones.ts` (paso 3: `MovimientoStock.detalle`), `ventas.ts`, `catalogo.ts`.
`src/app/api/`: `auth/*`, `hub-metrics`, `events`, `metricas`, `caja`, `checkout/pay`, `pedidos` (+ `cancel`, `items`, `history`), `inventario` (+ `ajuste/`), y todas las rutas con transacciones.
También: `src/proxy.ts`, `prisma/schema.prisma`, `eslint.config.mjs`, `src/__tests__/` (nuevos: `metricas`, `integracion-sqlite`; helpers con `requestHeaders` y usuarios implícitos).

## Decisiones y por qué
- **Bloqueo de PIN compartido en la red:** sin proxy no hay IP confiable. Se acepta que alguien pueda bloquear el login de todos antes que tener un límite evadible.
- **Rol desde la base en cada petición:** desactivar o degradar a un usuario tiene efecto inmediato. Cuesta una consulta por petición a SQLite local.
- **Cobro repetido = misma venta:** ante un corte de red, reintentar no puede cobrar dos veces ni dar error.
- **Stock por delta:** un valor absoluto pisaba las ventas hechas con la pantalla abierta y no dejaba registro.
- **Escrituras en fila:** SQLite tiene un solo escritor y el servidor es un único proceso.

## Pendiente o roto
- **No mezclar sin el frontend de Inventario:** la pantalla edita el stock por `PUT`, que ahora devuelve 400. Tiene que usar `POST /api/inventario/ajuste`.
- **Frontend (Agus):** Comandas debe usar `check-admin-pin` en el editor de plano, no `verify-pin`; `useSSE` debe tratar `sesion-vencida`.
- Sin probar en la app instalada (`npm run desktop:test`); el empaquetado del `.exe` ya venía fallando (`CLAUDE_HANDOFF.md`).
- Decisiones abiertas: pago dividido (cambio de esquema), si el cocinero cancela pedidos entregados, PIN de 6 dígitos.

## Cómo probarlo
`npm test` (792 tests; `integracion-sqlite` y `migraciones` usan SQLite real) · `npm run build` · `npx eslint .` (0 errores) · `npm run dev` y recorrer Sala → Cocina → Cobro → Caja.

## Cierre de calidad (2026-10-06)
Revisión `code-review` de `master..HEAD`. **Corregido (backend):** ráfaga concurrente saltaba el límite de PIN (`reservarIntento`/`liberarIntento` en `rate-limit.ts`, usado en `verify-pin` y `check-admin-pin`); SSE ahora cierra con error si el heartbeat falla (el cliente reconecta); `/api/auth/session` responde 500 ante error de base en vez de `user: null`; secreto de desarrollo en `globalThis`. Tests `REGRESIÓN:` para ráfaga y sesión. 794 tests, build y eslint (0 errores) OK.
**Sin tocar (decidir/avisar):**
- Frontend: `page.tsx:36` consulta `/api/hub-metrics` sin sesión → 401 y contador siempre en 0 (mostrarlo solo con sesión o endpoint público reducido). Inventario sigue usando `PUT` (ya listado arriba).
- `PATCH /api/mesas/[id]` permite MOZO y puede renumerar/borrar mesas: probablemente debe ser solo ADMIN (cambio de contrato, avisar a Agus).
- Escrituras fuera de `transaccion()` (insumo/producto/proveedor/costoFijo, `pin.ts:41`) compiten por el bloqueo de SQLite.
- `metricas/route.ts`: ~11 consultas secuenciales con rangos solapados.
- Duplicados: `datePrefix`/`prefijoFecha`, listas de estados finales; `toLocaleString()` sin locale guardado en historial.
- Un login correcto de otro usuario borra la escala de bloqueo (clave compartida); `.env.example` aún dice "valor inseguro por defecto".
- No hay backend Python: quick-gate-python no aplica.

### Segunda pasada (2026-10-06)
Hecho: `escritura()` en `transaccion.ts` pone en fila también las escrituras sueltas (proveedores, productos, costos, inventario, PIN); `metricas` usa 1 consulta de ventas en vez de ~11; `ESTADOS_FINALES`, `prefijoFecha` y `formatoPesos` (es-AR) compartidos; tests nuevos (`escritura.test.ts`, SSE ante error de base). 799 tests, build y eslint OK.
Sigue pendiente: restricción de `PATCH /api/mesas/[id]` a ADMIN (decisión), `hub-metrics` en el inicio y Inventario (frontend), decisiones abiertas.
