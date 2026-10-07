# Base de conocimiento — Restaurante San Andrés POS

Esta carpeta explica el proyecto **desde cero**, para quien recién llega. No hace falta conocer el código: cada
documento cuenta qué es cada parte, por qué está hecha así y dónde mirar para seguir.

## En un minuto

Es el **sistema de punto de venta** (POS) de un restaurante. Se usa en tres lugares:

- **Sala:** el mozo ve el plano de mesas, toma pedidos y cobra.
- **Cocina:** el cocinero ve los pedidos en una pantalla y los marca a medida que avanzan.
- **Administración:** el dueño ve la caja, carga el menú, controla el stock, los costos y el personal.

Todo pasa **en tiempo real**: cuando el mozo envía un pedido, aparece al instante en la pantalla de cocina.

El cliente recibe un **instalador `.exe` para Windows** que funciona **sin internet**: la base de datos vive en su
propia computadora.

## Orden de lectura sugerido

| # | Documento | Para qué |
|---|---|---|
| 1 | [Qué es y cómo se usa](01-que-es.md) | Los usuarios, las pantallas y el recorrido de un pedido |
| 2 | [Cómo está armado](02-como-esta-armado.md) | Las piezas del sistema y cómo se hablan entre sí |
| 3 | [Primeros pasos](03-primeros-pasos.md) | Instalar, correr la app en tu PC y entrar |
| 4 | [Conceptos clave](04-conceptos-clave.md) | Las reglas del negocio que el código respeta (dinero, estados, stock, sesión) |
| 5 | [Pantallas (frontend)](05-pantallas.md) | Cada pantalla y las piezas reutilizables |
| 6 | [Servidor y API (backend)](06-servidor-y-api.md) | Las rutas de la API, la base de datos y sus reglas |
| 7 | [La app de escritorio (.exe)](07-app-de-escritorio.md) | Cómo se empaqueta, dónde guarda los datos y cómo se configura |
| 8 | [Pruebas y calidad](08-pruebas.md) | Qué pruebas hay y cuándo correr cada una |
| 9 | [Trabajo en equipo](09-trabajo-en-equipo.md) | Ramas, división de tareas, pull requests y reglas |
| 10 | [Problemas frecuentes](10-problemas-frecuentes.md) | Errores conocidos y cómo resolverlos |
| 11 | [Glosario](11-glosario.md) | Las palabras raras, explicadas |

## Otros documentos del repositorio

- [`README.md`](../../README.md): puesta en marcha rápida, comandos y roles.
- [`docs/auditoria/`](../auditoria/README.md): revisión técnica detallada, un documento por cada grupo de cambios,
  con su sección "Cambios visibles para el frontend".
- [`docs/pruebas.md`](../pruebas.md): guía completa de pruebas.
- [`docs/lecciones-aprendidas.md`](../lecciones-aprendidas.md): errores que ya cometimos, para no repetirlos.
- [`CLAUDE.md`](../../CLAUDE.md): convenciones del proyecto (también las lee el asistente de IA).
- [`ARCHITECTURE.md`](../../ARCHITECTURE.md): la **visión** a futuro (zonas, modificadores, terminales en red). Parte
  todavía no existe; para lo que hay hoy, usa [Cómo está armado](02-como-esta-armado.md).

> **Mantener al día:** si cambias cómo funciona algo que se explica acá, actualiza el documento en el mismo commit.
> Una base de conocimiento desactualizada confunde más que no tener ninguna.
