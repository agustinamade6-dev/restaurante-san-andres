# Resumen de Traspaso del Proyecto: Restaurante San Andrés POS

_Última actualización: 2026-10-06 (`master`, versión 0.1.1)._

## 1. Stack Tecnológico
- **Framework:** Next.js 16 (App Router, Tailwind CSS, TypeScript), React 19.
- **Base de Datos:** SQLite local con Prisma ORM (`prisma/schema.prisma`).
- **Escritorio:** Electron + electron-builder (instalador NSIS para Windows x64).
- **Tests:** Vitest (`npm test`) y una prueba de tiempo real con Electron (`npm run test:sse`).
- **Objetivo:** ejecutable `.exe` nativo y offline para una terminal táctil de restaurante, sin terminal ni dependencias externas para el usuario final. **Funciona** (ver sección 3).

## 2. Estado Actual del Código
- **Vistas** (`src/app/`): salón/comandas (`/comandas`), cocina (`/cocina`) y administración (`/admin`: caja, menú, inventario, costos, proveedores, historial, usuarios).
- **Sesión y roles:** cookie firmada con HMAC-SHA256 (`src/lib/session.ts`), 12 horas. Roles `ADMIN`, `MOZO`, `COCINERO`.
  - Páginas protegidas por `src/proxy.ts` (en Next 16 `middleware.ts` se llama `proxy.ts`).
  - Cada ruta de `/api` valida con `requireAuth` (`src/lib/auth.ts`).
  - PIN de 4 dígitos guardado con hash scrypt (`src/lib/pin.ts`); los PIN en texto plano de bases viejas se aceptan y se migran al entrar.
  - Requiere `SESSION_SECRET` (mín. 32 caracteres) en producción; sin él el servidor falla cerrado. Ver `.env.example`.
- **Cobro** (`/api/checkout/pay`): transacción atómica e idempotente (no hay ventas duplicadas), total calculado desde los ítems guardados, rechaza pedidos vacíos. El cobro directo en el salón no pide PIN; el PIN de administrador queda para secciones críticas.
- **Tiempo real (SSE):** `/api/events` + `src/lib/events.ts`. Se emiten eventos al crear/modificar/cancelar pedidos, al cobrar y al cambiar mesas, para que comanderas y cocina se actualicen sin recargar.
- **Auditoría del backend:** `docs/auditoria/README.md` lista los hallazgos, qué se resolvió y qué sigue pendiente.

## 3. Empaquetado `.exe` (resuelto)
Los fallos anteriores (pantalla en blanco, `ERR_CONNECTION_REFUSED`, "Could not find a production build") ya no ocurren. Cómo funciona ahora:
- `next.config.ts` usa `output: 'standalone'`.
- `scripts/prepare-desktop.mjs` arma `desktop-build/`: el servidor Next autónomo (`server/`) y `template.db` (esquema actual + `prisma/seed-production.ts`: 3 usuarios, 20 mesas, 4 categorías).
- `electron/main.js` levanta ese servidor con `utilityProcess` y abre la ventana. Datos del usuario en `%APPDATA%\restaurante-san-andres\`:
  - `pos.db`: se crea desde la plantilla en el primer arranque; en cada arranque se guarda una copia en `backups/` (se conservan 15).
  - `config.json`: puerto (3000 por defecto) y `lan` (escuchar en la red local).
  - `session.key`: secreto de sesión generado una vez por instalación.
  - `logs/main.log`: registro de arranque y errores.
- Comandos:
  - `npm run desktop:test`: build + prepare + abre la app con Electron sin empaquetar.
  - `npm run dist:win`: genera `release\Restaurante San Andrés POS Setup <versión>.exe`.

**Cuidado al probar:** el `.exe` instalado siempre usa el `pos.db` real del usuario. Antes de probar contra la app instalada, hacer backup de `pos.db` y `config.json` y restaurarlos después. Para pruebas de rutina usar `npm run test:sse`, que usa una base temporal (requiere `npm run build && npm run desktop:prepare`).

## 4. Pendientes
- Hallazgos abiertos de la auditoría (`docs/auditoria/README.md`): validación de entrada en el resto de rutas, inventario desconectado de las ventas y reintegro de stock al cancelar, heartbeat de SSE, validación de subida de archivos, dinero en `Float`, borrado de mesas con pedidos activos, datos del comercio fijos en el ticket.
- `package.json#prisma` está deprecado (Prisma 7 pide `prisma.config.ts`).
- `README.md` sigue siendo el genérico de create-next-app.

## 5. Archivos Clave del Repositorio
- `package.json`: scripts y dependencias de Electron / Next / Prisma.
- `next.config.ts`: `output: 'standalone'`.
- `prisma/schema.prisma`: esquema SQLite. `prisma/seed-production.ts`: datos iniciales del `.exe`.
- `electron/main.js`: proceso principal (base, backups, secreto de sesión, arranque del servidor). `electron/preload.js`, `electron/after-pack.js`: copia `desktop-build/` al paquete y falla el build si falta algo.
- `scripts/prepare-desktop.mjs`: arma `desktop-build/`. `scripts/test-sse-comandas.js`: prueba de tiempo real.
- `src/proxy.ts`, `src/lib/session.ts`, `src/lib/auth.ts`, `src/lib/pin.ts`: autenticación.
- `src/app/`: vistas de salón, comandas, cocina y administración; `src/app/api/`: API.
