# Restaurante San Andrés - Enterprise POS Architecture

Este documento define la arquitectura de software de alto nivel para el sistema de Punto de Venta (POS) del Restaurante San Andrés, evolucionando desde un prototipo inicial hacia una plataforma "Enterprise-Grade" de clase mundial (estilo Toast POS o Lightspeed).

## 1. Estructura Modular y Topología de Red

El sistema opera bajo un modelo **Descentralizado/Local First** en una red LAN, diseñado para tolerar caídas de internet sin interrumpir la operación:

- **Core Servidor (Caja Principal):** Aplicación Electron que levanta un servidor Node.js (Next.js Standalone). Actúa como la fuente única de verdad (Single Source of Truth). Contiene el motor de SQLite y despacha eventos Server-Sent Events (SSE) al resto de los nodos.
- **Terminales (Comanderas/Tablets/KDS):** Clientes *thin* o aplicaciones en modo kiosko que se conectan a la IP del servidor principal. Su estado es reactivo y depende de los streams SSE del servidor.
- **Capa de Persistencia:** Prisma ORM con SQLite para operaciones ACID rápidas. El archivo `dev.db` se encuentra aislado y con rutinas de backup pre-establecidas en la máquina principal.

## 2. Pipeline de Estado y Sincronización

El POS requiere un **Flujo Unidireccional de Datos (Unidirectional Data Flow)** sincronizado en tiempo real a través de la red local:

1. **Intención:** Un mozo interactúa con el Floor Plan interactivo y emite una orden de agregar un ítem.
2. **Mutación:** La orden se envía vía REST (POST/PUT) a la API del servidor.
3. **Persistencia:** Prisma actualiza la transacción en SQLite de manera atómica.
4. **Propagación:** El módulo `EventEmitter` (patrón PubSub) despacha un evento global.
5. **Reacción:** Los clientes consumen el stream SSE en `/api/events`, reciben el delta (estado actualizado) y React re-renderiza el plano de mesas 2D o los paneles KDS instantáneamente.

## 3. Contrato de Datos Base (Data Model)

El modelo de datos se enfoca fuertemente en el modelado espacial del salón y la flexibilidad del menú:

### A. Floor Plan & Mesas
El plano dejó de ser una cuadrícula estática (Grid) para convertirse en un **Lienzo (Canvas) 2D Interactivo**.
- **Zone:** Sectores físicos (ej. "Patio", "Salón Principal").
- **Table / SalonTable:** Entidad posicional. Posee estado (disponible, ocupada, esperando_comida, facturando), forma geométrica (redonda, cuadrada) y coordenadas espaciales (`x, y`).

### B. Catálogo de Productos y Modificadores
Estructura fotográfica y jerárquica para acelerar la toma de pedidos.
- **Product:** Platos/Bebidas. Poseen costo, precio, e imagen.
- **Category:** Agrupaciones lógicas.
- **Modifier:** (Futuro) Modificadores obligatorios u opcionales (ej. "Punto de la carne", "Sin cebolla").

### C. Sistema de Comandas (Orders)
- **Order:** Representa una sesión en una mesa. Rastrea el tiempo transcurrido (para alertar retrasos), total acumulado e historial de estados.
- **OrderItem:** Unidad atómica del pedido con registro de timestamps de cuando se ingresó a la comanda y cuando se completó en cocina.

## 4. UI/UX: Principios de Diseño
- **Espacio y Geometría:** Uso de representaciones físicas reales (mesas redondas, rectangulares) para que los mozos identifiquen las mesas visualmente sin leer números.
- **Carga Cognitiva Reducida:** Uso de colores de estado altamente contrastantes (Verde = Libre, Rojo = Ocupada, Amarillo = Esperando).
- **Dark Theme por Defecto:** Reduce el brillo en ambientes oscuros (bares) y aumenta la visibilidad de las etiquetas importantes.
- **Touch-First:** Todos los hitboxes (botones y mesas) miden como mínimo 44x44px según los estándares de accesibilidad táctil para pantallas capacitivas de gastronomía.
