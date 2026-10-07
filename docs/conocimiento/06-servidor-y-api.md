# 6. Servidor y API (backend)

## Cómo es una ruta

Cada archivo `src/app/api/**/route.ts` exporta una función por método HTTP (`GET`, `POST`, `PATCH`, `PUT`,
`DELETE`). Todas siguen el mismo esquema:

```ts
export async function POST(request: Request) {
  const auth = await requireAuth(['ADMIN', 'MOZO']);   // 1. ¿sesión, usuario activo, rol permitido, mismo origen?
  if (!auth.ok) return auth.response;                  //    si no: 401 / 403

  const parsed = esquema.safeParse(await leerJson(request)); // 2. validar los datos con zod
  if (!parsed.success) return error(mensajeZod(parsed.error), 400);

  const resultado = await transaccion(async (tx) => {  // 3. escribir en fila, todo o nada
    // ...
  });

  eventEmitter.emit('pedido:actualizado', enPesos(resultado)); // 4. avisar por tiempo real
  return NextResponse.json(enPesos(resultado));                // 5. responder (montos en pesos)
}
```

- **Errores:** siempre `{ error: "mensaje legible" }` con el código adecuado (`400` dato inválido, `401` sin sesión,
  `403` sin permiso, `404` no existe, `409` cambió mientras tanto, `429` demasiados intentos). Nunca un `500` para
  un error del usuario.
- **Una ruta nueva** se agrega también a la matriz de permisos de `src/__tests__/api-guards.test.ts`.

## Las rutas

| Ruta | Métodos | Para qué |
|---|---|---|
| `/api/auth/verify-pin` | POST | Iniciar sesión con el PIN |
| `/api/auth/check-admin-pin` | POST | Confirmar el PIN de un admin **sin cambiar la sesión** (editor de plano) |
| `/api/auth/session` | GET | Quién está logueado |
| `/api/auth/logout` | POST | Cerrar sesión |
| `/api/hub-metrics` | GET | Mesas ocupadas/libres y comandas en preparación (inicio) |
| `/api/events` | GET | Conexión de tiempo real (SSE) |
| `/api/mesas`, `/api/mesas/{id}`, `/api/mesas/layout` | GET, POST, PATCH, DELETE, PUT | Mesas y su distribución en el plano |
| `/api/pedidos` | GET, POST, PATCH | Pedidos activos, crear, cambiar estado |
| `/api/pedidos/{id}/items` | PATCH | Agregar, quitar o cambiar la cantidad de un plato |
| `/api/pedidos/{id}/cancel` | PATCH | Cancelar con motivo |
| `/api/pedidos/{id}/history`, `/api/pedidos/history` | GET | Historial de un pedido / pedidos de los últimos días |
| `/api/checkout/pay` | POST | Cobrar (idempotente) |
| `/api/ventas/{id}/anular` | POST | Anular una venta (ADMIN) |
| `/api/caja` | GET | Ventas y resumen de un período |
| `/api/metricas` | GET | Métricas del panel de Admin |
| `/api/productos`, `/api/productos/{id}/receta`, `/api/categorias` | varios | Menú y recetas |
| `/api/inventario`, `/api/inventario/ajuste` | varios | Insumos y ajustes de stock |
| `/api/proveedores`, `/api/costos` | varios | Proveedores y costos |
| `/api/admin/usuarios`, `/api/admin/usuarios/{id}/pin` | varios | Personal y cambio de PIN |
| `/api/upload` | POST | Subir la foto de un producto (PNG, JPG o WebP) |

El detalle de cada contrato (qué recibe, qué responde, qué errores da) está en los documentos de
`docs/auditoria/`, en la sección "Cambios visibles para el frontend".

## La lógica compartida (`src/lib/`)

| Archivo | Qué hace |
|---|---|
| `auth.ts` | `requireAuth`: sesión, usuario activo, rol y origen de la petición |
| `session.ts`, `pin.ts`, `rate-limit.ts` | Cookie firmada, hash del PIN y límite de intentos |
| `origen.ts` | Protección CSRF: rechaza peticiones que vienen de otro sitio |
| `money.ts` | Pesos ↔ centavos y tope de montos |
| `pedidos.ts`, `mesas.ts` | Estados permitidos y qué pedidos ocupan una mesa |
| `stock.ts` | Descontar, reintegrar y ajustar stock (con `MovimientoStock`) |
| `ventas.ts` | Números de ticket y asientos de anulación |
| `transaccion.ts` | `transaccion()` y `escritura()`: escrituras en fila para SQLite |
| `migraciones.ts` | Pasos de actualización de la base que se aplican al arrancar |
| `events.ts` | El emisor de avisos de tiempo real |
| `catalogo.ts`, `validacion.ts` | Esquemas de validación (zod) y lectura segura del JSON |
| `negocio.ts` | Datos del comercio para los tickets (nombre, CUIT, dirección) |
| `uploads.ts`, `imagen.ts` | Dónde se guardan las fotos y validación de su contenido |

## Cambiar la base de datos

1. Editar `prisma/schema.prisma`.
2. Agregar un **paso al final** de `PASOS` en `src/lib/migraciones.ts`, que detecta si hace falta y aplica el SQL
   (se obtiene con `prisma migrate diff`).
3. Agregar su prueba en `src/__tests__/migraciones.test.ts`.
4. No correr `prisma format` sobre el archivo entero.

Así, la base del restaurante se actualiza sola la próxima vez que abre la app.

Siguiente: [La app de escritorio](07-app-de-escritorio.md).
