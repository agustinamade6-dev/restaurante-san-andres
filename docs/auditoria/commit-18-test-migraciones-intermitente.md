# Commit 18 — Test de migraciones intermitente en el CI

`fix(pruebas): el test de la fila huérfana usa una conexión directa de SQLite (intermitente en el CI)`

**Rama:** `fix/migraciones-intermitente` (encima de `frontend/at38`). **Archivo:** `src/__tests__/migraciones.test.ts`. No toca código de producción.

## Hallazgo — `una fila huérfana que la base YA tenía no bloquea la migración` fallaba a veces
**Evidencia:** la primera ejecución del CI en GitHub falló en el paso de la suite completa de `chore/ajustes-finales` con
`PrismaClientKnownRequestError: Raw query failed. Code: 787. FOREIGN KEY constraint failed` al insertar la fila huérfana; el mismo
código pasó en las otras ramas y en el equipo de desarrollo, y al relanzar el trabajo pasó.
**Causa probable:** el test hacía `PRAGMA foreign_keys = OFF` y después el `INSERT` por `$executeRawUnsafe`. En SQLite los PRAGMA valen
**por conexión**, y Prisma abre un pool: si el `INSERT` cae en otra conexión (con claves foráneas activas), falla. Con eso coincide el error.
**Límite:** no se pudo reproducir en el equipo de desarrollo (60 de 60 intentos sin fallo con el pool normal y con una sola conexión), así
que la causa es coherente con el error pero no está demostrada; el CI dirá si desaparece.
**Corrección:** la fila huérfana se inserta con una conexión directa (`DatabaseSync` de `node:sqlite`, incluido en Node 24), donde el PRAGMA
y el INSERT comparten conexión por construcción, sin depender del pool. Es el único PRAGMA de escritura en los tests.

## Cambios visibles para el frontend
Ninguno.

## Verificación
`npx vitest run migraciones`: 12 tests verdes; `eslint` y `tsc` sin errores. Pendiente: ver que el CI no vuelva a mostrar el fallo.

## Lección
L-071 (ver `docs/lecciones-aprendidas.md`, fila 31).
