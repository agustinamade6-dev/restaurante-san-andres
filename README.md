# Restaurante San Andrés — POS

Sistema de punto de venta para restaurante: **Sala** (mesas y comandas), **Cocina** (pedidos y estados) y
**Administración** (caja, menú, inventario, proveedores, costos, personal). Next.js + Prisma + SQLite, con
empaquetado de escritorio para Windows (Electron).

## Requisitos
- Node.js 20.9 o superior
- Git

## Puesta en marcha (desarrollo)
```bash
npm install
cp .env.example .env          # en PowerShell/CMD: copy .env.example .env
```
Edita `.env` y completa `SESSION_SECRET` (mínimo 32 caracteres; sin él, en desarrollo se usa un valor inseguro
con un aviso). Para generar uno: `openssl rand -hex 32`.
```bash
npm run db:setup              # crea la base de datos de ejemplo
npm run dev                   # http://localhost:3000
```

### Usuarios de ejemplo
Los datos de ejemplo (`prisma/seed.ts`) crean un usuario por rol: **ADMIN**, **COCINERO** y **MOZO**, con PIN de
4 dígitos. **Cambia los PIN antes de usar el sistema con datos reales** (Admin → Personal).

## Comandos
| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Tests (Vitest) |
| `npm run build` | Compila y revisa los tipos |
| `npm run db:setup` | Crea la base y carga los datos de ejemplo |
| `npm run db:studio` | Explorador visual de la base de datos |
| `npm run dist:win` | Genera el instalador de Windows |

## Roles y permisos
| Rol | Pantalla | Puede |
|---|---|---|
| `MOZO` | Sala (`/comandas`) | Tomar pedidos, cobrar |
| `COCINERO` | Cocina (`/cocina`) | Cambiar estados, cancelar, editar ítems |
| `ADMIN` | Todo, incl. Administración (`/admin`) | Caja, menú, inventario, proveedores, costos, personal, anular ventas, editar el plano de mesas |

La matriz completa de permisos por endpoint está en `docs/auditoria/commit-03-autenticacion.md`.

## Configuración del comercio
Los datos que se imprimen en los tickets (nombre, CUIT, dirección) se configuran con las variables
`NEGOCIO_NOMBRE`, `NEGOCIO_CUIT` y `NEGOCIO_DIRECCION` (ver `.env.example`). En la app de escritorio, en la
sección `negocio` del archivo `config.json` de la carpeta de datos. **Los valores por defecto son de ejemplo:
reemplázalos por los reales.**

## Documentación
- **`docs/conocimiento/`** — **base de conocimiento para quien recién llega**: qué es el sistema, cómo está armado,
  primeros pasos, reglas del negocio, pantallas, API, app de escritorio, pruebas, trabajo en equipo y problemas
  frecuentes. Empezar por `docs/conocimiento/README.md`.
- `docs/auditoria/README.md` — auditoría técnica del backend: hallazgos, estado y un documento por cambio.
- `ARCHITECTURE.md` — arquitectura general.
- `CLAUDE_HANDOFF.md` — notas de traspaso del proyecto.

## Tests
`npm test` ejecuta la suite. Usa una base de datos simulada en memoria (un solo escritor con *rollback*): valida la
lógica de las rutas, pero **no sustituye una prueba con SQLite real**; tras cambios importantes conviene correr
también `npm run build` y recorrer el flujo Sala → Cocina → Cobro → Caja en desarrollo.
La excepción es `migraciones.test.ts`, que sí usa SQLite real para probar las migraciones de esquema.

## Base de datos: montos y migraciones
- **Dinero en centavos enteros:** la base guarda $1.250,50 como `125050`; la API responde y recibe pesos
  (conversión en `src/lib/money.ts`).
- **Migraciones automáticas:** al arrancar, el servidor aplica los cambios de esquema pendientes
  (`src/lib/migraciones.ts`, invocado desde `src/instrumentation.ts`). Con una `dev.db` vieja, arrancar `npm run dev`
  **antes** de usar `npm run db:push`.
