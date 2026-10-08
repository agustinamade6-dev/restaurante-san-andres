# 5. Pantallas (frontend)

En Next.js, **la carpeta es la URL**: `src/app/cocina/page.tsx` es la pantalla de `/cocina`. Todas las pantallas
empiezan con `'use client'`: corren en el navegador y le piden los datos a la API.

## Las pantallas y lo que usan

| URL | Archivo | Rol | Datos principales |
|---|---|---|---|
| `/` | `src/app/page.tsx` | todos | `verify-pin` para entrar; `hub-metrics` (solo con sesión) |
| `/comandas` | `src/app/comandas/page.tsx` | MOZO, ADMIN | `mesas`, `productos`, `categorias`, `pedidos`, `checkout/pay` |
| `/cocina` | `src/app/cocina/page.tsx` | COCINERO, ADMIN | `pedidos`, `pedidos/{id}/items`, `pedidos/{id}/cancel` |
| `/admin` | `src/app/admin/page.tsx` | ADMIN | `metricas` |
| `/admin/caja` | `src/app/admin/caja/page.tsx` | ADMIN | `caja`, `ventas/{id}/anular` |
| `/admin/menu` | `src/app/admin/menu/page.tsx` | ADMIN | `productos`, `categorias`, `upload`, `productos/{id}/receta` |
| `/admin/inventario` | `src/app/admin/inventario/page.tsx` | ADMIN | `inventario`, `inventario/ajuste`, `proveedores` |
| `/admin/proveedores` | `src/app/admin/proveedores/page.tsx` | ADMIN | `proveedores` |
| `/admin/costos` | `src/app/admin/costos/page.tsx` | ADMIN | `costos` |
| `/admin/historial` | `src/app/admin/historial/page.tsx` | ADMIN | `pedidos/history` |
| `/admin/usuarios` | `src/app/admin/usuarios/page.tsx` | ADMIN | `admin/usuarios`, `admin/usuarios/{id}/pin` |

`src/proxy.ts` revisa la sesión y el rol **antes** de abrir `/comandas`, `/cocina` y `/admin`: sin permiso, vuelve
al inicio.

## Piezas reutilizables

Antes de escribir algo nuevo, fíjate si ya existe. Todas tienen pruebas en el archivo `.test.ts` de al lado.

### Hooks (`src/hooks/`)

| Hook | Para qué |
|---|---|
| `useApi(url, inicial)` | Pide datos a la API. Devuelve `{ data, error, cargando, recargar }`. Descarta respuestas viejas si la URL cambió. |
| `useSSE(alRecibir, alReconectar)` | Escucha los avisos en tiempo real. `alReconectar` vuelve a pedir lo que se perdió durante un corte. |
| `useSesion()` | Quién está logueado: `{ usuario, esAdmin }`. |
| `useEnvio()` | Evita el **doble envío**: mientras una acción está en curso, el segundo clic se ignora. Se puede bloquear por id (un pedido). |
| `useAviso()` | Un mensaje que se borra solo después de unos segundos, sin que un temporizador viejo borre uno nuevo. |
| `useDialogo(nombre, alCerrar)` | Hace accesible un modal: se anuncia como diálogo, se cierra con Escape y el foco no se escapa. |
| `useAhora()` | La hora actual, actualizándose sola (para "hace 5 min"). |

### Componentes (`src/components/`)

| Componente | Para qué |
|---|---|
| `ErrorDeCarga` | Aviso "No se pudieron cargar…" con botón **Reintentar**. Úsalo con el `error` de `useApi`. |
| `AvisoError` | Aviso de error de una acción (guardar, eliminar), con botón para cerrarlo. |
| `DeteccionSesionVencida` | Si alguna llamada a la API responde 401 por sesión vencida, vuelve al inicio. Está en el layout. |
| `inventario/AjusteStockModal` | El modal de "Ajustar stock". |

### Utilidades (`src/utils/`)

| Función | Para qué |
|---|---|
| `formatPesos(monto)` | El **único** formato de dinero: `$1.500`, `$1.500,50`, `-$200`. |
| `html\`...\``, `documentoImpresion`, `imprimir` | Arman el HTML de los tickets **escapando** los datos, para que un nombre de producto no pueda inyectar código. |
| `conservarPosiciones` | En el editor de plano, actualiza las mesas sin perder lo que el admin movió y no guardó. |

### Para mandar datos a la API

`enviarJson(url, método, cuerpo, mensajePorDefecto)` y `enviar(...)` (`src/lib/api-cliente.ts`) devuelven
`null` si salió bien o el **mensaje de error** para mostrar. Ya manejan los errores de red.

## Reglas de las pantallas

- **Mostrar siempre el error** que devuelve la API (`data.error`), nunca fallar en silencio ni mostrar "0" cuando lo
  que pasó fue un error de carga.
- **Leer por id, no guardar copias:** un modal guarda el **id** del pedido o la mesa y lo busca en la lista actual.
  Si guarda una copia, no ve los cambios que llegan en tiempo real.
- **Sin doble envío:** toda acción que guarda pasa por `useEnvio` y deshabilita su botón mientras tanto.
- **Accesibilidad:** cada botón tiene un nombre (texto visible o `aria-label`); cada modal usa `useDialogo`; lo que
  se toca mide al menos 44 × 44 px; los colores de texto cumplen contraste AA. La prueba
  `e2e/accesibilidad.spec.ts` lo revisa.
- **Colores:** usa las variables de `src/app/globals.css`. Para texto en rojo o azul, `--danger-text` e
  `--info-text`; `--danger` e `--info` son para fondos y bordes.
- **Paleta de la marca:** los colores salen del logo y del ícono de AKROS Café. `globals.css` redefine las familias
  de Tailwind con esos tonos: `amber`/`orange`/`yellow` son caramelo dorado, `blue`/`purple`/`indigo` son el azul
  real de "AKROS", `cyan`/`teal` son pizarra verdosa y `neutral`/`slate`/`gray` son pizarra neutra. Escribir
  `amber-500` ya da el color de la marca; no hace falta poner códigos de color a mano. Rojo y verde quedan como
  señales de error y de éxito.
- **Logo:** va como marca de agua (`MarcaDeAgua`, la taza dorada de `public/logo-taza-dorada.png`) detrás del
  contenido. El contenedor de la pantalla lleva la clase `isolate` para que quede debajo de todo.
- Si una pantalla **cambia lo que manda o lo que lee** de la API, hay que actualizar
  `src/__tests__/contratos-pantallas.test.ts` y avisar al responsable del backend.

Siguiente: [Servidor y API](06-servidor-y-api.md).
