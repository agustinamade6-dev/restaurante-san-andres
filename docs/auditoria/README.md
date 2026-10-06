# Auditoría técnica del backend — Restaurante San Andrés

Documentación de los cambios hechos en la rama `backend`, **un documento por commit**, con la
plantilla de hallazgos acordada. Sirve para que quien trabaja en el frontend sepa qué cambió, por qué
y qué debe tener en cuenta.

## Commits documentados

| # | Commit | Documento | Hallazgos |
|---|--------|-----------|-----------|
| 1 | `fix(cobro): cobro atómico e idempotente, sin ventas duplicadas` | [commit-01-cobro.md](commit-01-cobro.md) | AT-03, AT-05, AT-06 (parcial), AT-08 (parcial) |
| 2 | `fix(pedidos): precios y totales calculados en el servidor` | [commit-02-precios-pedidos.md](commit-02-precios-pedidos.md) | AT-04, AT-06 (parcial), AT-08 (parcial) |
| 3 | `feat(seguridad): sesión firmada, roles en toda la API y PIN con hash` | [commit-03-autenticacion.md](commit-03-autenticacion.md) | AT-01, AT-02, AT-07, AT-15, AT-10/11/14 (parcial) |
| 4 | `fix(pedidos): estados finales, cancelación segura y anulación de ventas` | [commit-04-estados-anulacion.md](commit-04-estados-anulacion.md) | AT-18, AT-09, AT-06 (completo), AT-14 (parcial) |
| 5 | `fix(mesas): reglas de negocio, SSE sin fugas y subida de imágenes validada` | [commit-05-mesas-sse-uploads.md](commit-05-mesas-sse-uploads.md) | AT-14 (completo), AT-10, AT-11 |
| 6 | `fix(validacion): productos, costos, proveedores, inventario y consultas con entrada validada` | [commit-06-validacion-catalogo.md](commit-06-validacion-catalogo.md) | AT-08 (completo), AT-19 (hallado) |
| 7 | `fix(caja): período "Hoy" correcto, datos del comercio configurables y limpieza del repositorio` | [commit-07-periodo-caja-y-limpieza.md](commit-07-periodo-caja-y-limpieza.md) | AT-19, AT-16, AT-17 (parcial) |
| 8 | `chore(repo): eliminar temp.tsx, copia sin uso de la pantalla de Comandas` | [commit-08-borrar-temp.md](commit-08-borrar-temp.md) | AT-17 (completo) |

## Estado de los hallazgos

| ID | Hallazgo | Impacto | Estado |
|----|----------|---------|--------|
| AT-01 | Sesión forjable (cookie JSON sin firma, legible por JS) | Muy Alto | ✅ Commit 3 |
| AT-02 | API sin autenticación ni autorización | Muy Alto | ✅ Commit 3 |
| AT-03 | Doble registro de ventas (entregado + cobro) | Muy Alto | ✅ Commit 1 |
| AT-04 | Precios y totales definidos por el cliente | Alto | ✅ Commit 2 |
| AT-05 | Carreras en el cobro (doble cobro, ticket repetido) | Alto | ✅ Commit 1 |
| AT-06 | Operaciones multi-paso sin transacción | Alto | ✅ Commits 1, 2 y 4 |
| AT-07 | PIN en texto plano y sin límite de intentos | Alto | ✅ Commit 3 |
| AT-08 | Sin validación de entrada | Alto | ✅ Commits 1, 2, 4, 5 y 6 |
| AT-09 | Cancelación sin controles (pedido pagado, stock, venta) | Alto | 🟡 Commit 4 (estado y transacción). Pendiente: reintegro de stock (AT-12) |
| AT-10 | SSE sin autenticación y fuga de temporizadores | Medio | ✅ Commits 3 y 5 |
| AT-11 | Subida de archivos débil | Medio | ✅ Commits 3 y 5 |
| AT-12 | Inventario desconectado de las ventas | Medio | ⏳ Pendiente |
| AT-13 | Dinero en `Float` | Medio | 🟡 Redondeo a centavos. Pendiente: tipo de columna |
| AT-14 | Mesas: estado libre y borrado sin validar | Medio | ✅ Commits 3, 4 y 5 |
| AT-15 | Múltiples instancias de `PrismaClient` | Medio | ✅ Commit 3 |
| AT-16 | Datos del comercio fijos en el ticket | Bajo | ✅ Commit 7 |
| AT-17 | Residuos (`temp.tsx`, README genérico, UTF-16) | Bajo | ✅ Commits 7 y 8 |
| AT-18 | Pedido cobrado reabrible y sin anulación de ventas (hallado en prueba manual) | Muy Alto | ✅ Commit 4 (falta el botón en el frontend) |
| AT-19 | "Hoy" en Caja incluye las ventas de ayer (período desplazado un día) | Medio | ✅ Commit 7 |

## Convenciones

- **Impacto** y **Esfuerzo**: Muy Alto | Alto | Medio | Bajo | Muy Bajo.
- **Contrato con el frontend:** mismas rutas, métodos y forma de respuesta. Cada documento lista
  los cambios visibles (códigos de error nuevos, campos ignorados, permisos).
- **Tests:** `npm test`. Los tests usan una base simulada en memoria (un solo escritor con
  rollback). No sustituyen una prueba contra SQLite real: cada documento indica la prueba manual.
