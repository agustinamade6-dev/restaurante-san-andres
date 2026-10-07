# 3. Primeros pasos

## Lo que necesitas instalado

- **Node.js 20.9 o superior** (incluye `npm`).
- **Git**.
- Un editor; el equipo usa **VS Code**.

> **No trabajes dentro de OneDrive** (ni de otra carpeta sincronizada). OneDrive bloquea archivos mientras se
> compila y aparecen errores `EPERM`. Usa una carpeta local, por ejemplo `C:\dev\restaurante-san-andres`.

## Bajar el proyecto y correrlo

```bash
git clone https://github.com/agustinamade6-dev/restaurante-san-andres.git
cd restaurante-san-andres
npm install
```

Copia el archivo de configuración de ejemplo:

```bash
copy .env.example .env
```

Abre `.env` y completa `SESSION_SECRET` con un texto largo al azar (mínimo 32 caracteres). Es la clave con la que
se firman las sesiones. Sin ella, en desarrollo se usa una temporal y cada reinicio te cierra la sesión.

Crea la base de datos de ejemplo y arranca:

```bash
npm run db:setup
npm run dev
```

Abre **http://localhost:3000** en el navegador.

## Entrar

`npm run db:setup` crea tres usuarios de ejemplo, uno por rol:

| PIN | Rol |
|---|---|
| `1111` | ADMIN |
| `2222` | COCINERO |
| `3333` | MOZO |

Si tu `dev.db` es vieja o ya cambiaste los PIN, puede que no coincidan. Para empezar de cero, borra
`prisma/dev.db` y vuelve a correr `npm run db:setup`.

## Recorrido para entender la app (15 minutos)

1. Entra a **Sala** con `3333`. Toca una mesa libre, agrega dos productos y envía la comanda.
2. Vuelve al inicio, entra a **Cocina** con `2222`. El pedido está en Pendientes: llévalo hasta **Entregado**.
3. Entra a **Sala** otra vez y **cobra** esa mesa. Mira el ticket.
4. Entra a **Administración** con `1111`. Revisa **Caja**: ahí está la venta. Prueba **Anular** con un motivo.
5. En **Inventario**, prueba **Ajustar** el stock de un insumo.

## Comandos que vas a usar

| Comando | Qué hace |
|---|---|
| `npm run dev` | Arranca la app en modo desarrollo (se recarga sola al guardar cambios) |
| `npm run db:setup` | Crea la base de ejemplo |
| `npm run db:studio` | Abre un explorador visual de la base de datos |
| `npm test` | Corre las pruebas automáticas |
| `npm run build` | Compila como para producción (y revisa los tipos) |
| `npx eslint .` | Revisa el estilo y errores comunes del código |
| `npm run test:e2e` | Pruebas con un navegador real (antes: `npm run build`) |
| `npm run dist:win` | Genera el instalador `.exe` |

## Las bases de datos: no confundirlas

| Archivo | Qué es | ¿Se puede borrar? |
|---|---|---|
| `prisma/dev.db` | Tu base de **desarrollo** | Sí, se recrea con `npm run db:setup` |
| `e2e/.tmp/e2e.db` | Base temporal de las pruebas e2e | Sí, se recrea sola |
| `desktop-build/template.db` | La base vacía que se entrega dentro del `.exe` | Sí, se recrea al empaquetar |
| `%APPDATA%\restaurante-san-andres\pos.db` | La base **real** de la app instalada | **No.** Son los datos del restaurante |

Siguiente: [Conceptos clave](04-conceptos-clave.md).
