# 1. Qué es y cómo se usa

## Quién lo usa

Cada persona entra con un **PIN de 4 dígitos**. El PIN identifica a la persona y su **rol**, y el rol decide qué
puede hacer:

| Rol | Pantalla | Qué hace |
|---|---|---|
| **MOZO** | Sala (`/comandas`) | Abre mesas, toma pedidos, cobra |
| **COCINERO** | Cocina (`/cocina`) | Avanza los pedidos (preparando, listo, entregado), edita ítems, cancela |
| **ADMIN** | Todas, más Administración (`/admin`) | Caja, menú, inventario, proveedores, costos, personal, anular ventas, editar el plano de mesas |

## Las pantallas

- **Inicio (`/`):** tres tarjetas (Sala, Cocina, Administración). Se toca una (o se aprieta `1`, `2` o `3`) y se
  ingresa el PIN. Si alguien ya inició sesión, muestra el estado en vivo: mesas ocupadas y comandas en preparación.
- **Sala (`/comandas`):** el **plano de mesas**, con colores según su estado (libre, ocupada, esperando). Tocando una
  mesa se arma la comanda con los productos del menú y se envía a cocina. Desde ahí también se **cobra** y se
  imprimen los tickets. Un ADMIN puede entrar al **Modo Editor** para mover, crear o borrar mesas.
- **Cocina (`/cocina`):** un tablero con tres columnas (**Pendientes, Preparando, Listos**). Cada pedido muestra el
  tiempo que lleva esperando y se marca en rojo si se demora. A esto se le llama **KDS** (Kitchen Display System).
- **Administración (`/admin`):** un panel con métricas, y secciones de **Caja** (ventas, arqueo, anular ventas),
  **Menú** (productos y recetas), **Inventario** (insumos y stock), **Proveedores**, **Costos**, **Historial** y
  **Personal** (usuarios y PIN).

## El recorrido de un pedido

```mermaid
sequenceDiagram
    participant M as Mozo (Sala)
    participant S as Servidor
    participant C as Cocina
    M->>S: Envía la comanda de la mesa 4
    S-->>C: Aviso en tiempo real: pedido nuevo
    C->>S: "Iniciar preparación"
    C->>S: "Marcar como listo"
    S-->>M: Aviso: la mesa 4 pasa a "esperando" (pedido listo)
    C->>S: "Confirmar entrega"
    M->>S: Cobra la mesa (efectivo, tarjeta...)
    S-->>M: Tickets para imprimir; la mesa queda libre
```

1. El mozo toca una mesa libre, elige productos y envía la comanda. La mesa pasa a **ocupada**.
2. El pedido aparece al instante en **Pendientes** de la cocina.
3. El cocinero lo pasa a **Preparando** y después a **Listo**: la mesa pasa a **esperando** (hay comida para
   llevar). Cuando sale, lo marca **Entregado** y la mesa vuelve a **ocupada**: el cliente sigue sentado hasta
   que paga.
4. El mozo **cobra** la mesa: elige el método de pago y la propina, y se generan el **ticket del cliente** y el
   **comprobante interno**. Cobrar descuenta del stock los insumos de cada plato (si tiene receta) y deja la mesa
   libre.
5. La venta aparece en **Caja**. Si hubo un error, un ADMIN la **anula** con un motivo: queda registrada la
   anulación (en negativo) y el stock vuelve.

## Lo que el cliente necesita

- Un solo archivo: el **instalador `.exe`**. No usa terminal ni necesita Node.js instalado.
- Funciona **sin internet**: todo corre en su computadora.
- Opcionalmente, tablets o celulares de la misma red wifi pueden entrar a la app (ver
  [la app de escritorio](07-app-de-escritorio.md)).

Siguiente: [Cómo está armado](02-como-esta-armado.md).
