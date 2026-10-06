# Resumen de Traspaso del Proyecto: Restaurante San Andrés POS

## 1. Stack Tecnológico
- **Framework:** Next.js (App Router, Tailwind CSS, TypeScript).
- **Base de Datos:** SQLite local con Prisma ORM (`prisma/schema.prisma`).
- **Objetivo Final:** Empaquetar la aplicación como un ejecutable `.exe` nativo y offline para Windows (destinado a una terminal táctil de restaurante), sin dependencias externas ni terminal para el usuario final.

## 2. Estado Actual del Código
- **Flujo de Salón / Comandas:**
  - Sistema de gestión de mesas y pedidos.
  - Se eliminó el requisito de PIN/contraseña para cobrar mesas en el salón (el cobro debe ser directo sin trabas ni modales de keypad).
  - El PIN de administrador queda reservado únicamente para configuraciones o ingresos a secciones críticas.
- **Persistencia:** Base de datos SQLite local (`dev.db`).

## 3. Problema Técnico Crítico No Resuelto
- Intentos de empaquetar con `electron-builder`:
  - **Fallo 1:** Pantallas en blanco o fallos `ERR_CONNECTION_REFUSED` al intentar conectar con un servidor de Next.js inexistente en producción.
  - **Fallo 2:** Error `Could not find a production build in the '.next' directory` al intentar arrancar Next.js programáticamente desde Electron.
  - **Fallo 3:** Ventana por defecto de Electron o cierres silenciosos al ejecutar el `.exe` compilado en `dist/win-unpacked`.

## 4. Archivos Clave del Repositorio
- `package.json`: Scripts y dependencias de Electron / Next / Prisma.
- `next.config.ts`: Configuración actual de Next.js.
- `prisma/schema.prisma`: Esquema de datos SQLite.
- `electron/`: Proceso principal (`main.js` / `preload.js`).
- `src/app/`: Vistas de salón, comandas, caja y administración.
