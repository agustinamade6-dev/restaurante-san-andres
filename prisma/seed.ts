import { PrismaClient } from '@prisma/client';
import { aCentavos } from '../src/lib/money';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Sembrando datos para AKROS Café...');

  // --- Usuarios ---
  await prisma.usuario.upsert({
    where: { pin: '1111' },
    update: {},
    create: { nombre: 'Admin General', pin: '1111', rol: 'ADMIN' },
  });
  await prisma.usuario.upsert({
    where: { pin: '2222' },
    update: {},
    create: { nombre: 'Cocinero Principal', pin: '2222', rol: 'COCINERO' },
  });
  await prisma.usuario.upsert({
    where: { pin: '3333' },
    update: {},
    create: { nombre: 'Mozo Sala', pin: '3333', rol: 'MOZO' },
  });
  console.log('✅ 3 usuarios creados (ADMIN: 1111, COCINERO: 2222, MOZO: 3333)');

  // --- Mesas ---
  const mesas = [];
  for (let i = 1; i <= 20; i++) {
    // Mismo plano que prisma/updateMesas.ts: barra (18-20) y salón en 4 columnas.
    const enBarra = i >= 18;
    // El estado de la mesa sigue al de su pedido: preparando/pendiente -> ocupada, listo -> esperando.
    const estado = i === 2 || i === 5 ? 'ocupada' : i === 1 ? 'esperando' : 'libre';
    const mesa = await prisma.mesa.create({
      data: {
        numero: i,
        capacidad: i <= 8 ? 4 : i <= 14 ? 6 : 8,
        estado,
        sector: enBarra ? 'barra' : 'salon',
        forma: enBarra ? 'tall-bar' : 'round',
        posX: enBarra ? 10 : [32, 52, 72, 92][(i - 1) % 4],
        posY: enBarra ? 20 + (i - 18) * 28 : 15 + Math.floor((i - 1) / 4) * 18,
      },
    });
    mesas.push(mesa);
  }
  console.log('✅ 20 mesas creadas');

  // --- Categorías ---
  const catComidas = await prisma.categoria.create({
    data: { nombre: 'Comidas', icono: 'utensils-crossed', orden: 1 },
  });
  const catBebidas = await prisma.categoria.create({
    data: { nombre: 'Bebidas', icono: 'glass-water', orden: 2 },
  });
  const catPostres = await prisma.categoria.create({
    data: { nombre: 'Postres', icono: 'cake-slice', orden: 3 },
  });
  const catEntradas = await prisma.categoria.create({
    data: { nombre: 'Entradas', icono: 'salad', orden: 4 },
  });
  console.log('✅ 4 categorías creadas');

  // --- Productos ---
  const productos = await Promise.all([
    // Comidas
    prisma.producto.create({
      data: { nombre: 'Hamburguesa Clásica', descripcion: 'Medallón de 200g, lechuga, tomate, queso cheddar', precio: aCentavos(5500), categoriaId: catComidas.id, imagen: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&q=80&w=400&h=400' },
    }),
    prisma.producto.create({
      data: { nombre: 'Hamburguesa Doble AKROS', descripcion: 'Doble medallón, bacon, cheddar fundido, cebolla caramelizada', precio: aCentavos(7800), categoriaId: catComidas.id, imagen: 'https://images.unsplash.com/photo-1586816001966-79b736744398?auto=format&fit=crop&q=80&w=400&h=400' },
    }),
    prisma.producto.create({
      data: { nombre: 'Pizza Muzzarella', descripcion: 'Pizza grande con muzzarella y orégano', precio: aCentavos(6200), categoriaId: catComidas.id, imagen: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&q=80&w=400&h=400' },
    }),
    prisma.producto.create({
      data: { nombre: 'Pizza Especial de la Casa', descripcion: 'Jamón, morrones, aceitunas, huevo, muzzarella', precio: aCentavos(8500), categoriaId: catComidas.id, imagen: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&q=80&w=400&h=400' },
    }),
    prisma.producto.create({
      data: { nombre: 'Milanesa Napolitana', descripcion: 'Milanesa de ternera con jamón, queso y salsa', precio: aCentavos(7200), categoriaId: catComidas.id, imagen: 'https://images.unsplash.com/photo-1599921841143-819065a55cc6?auto=format&fit=crop&q=80&w=400&h=400' },
    }),
    prisma.producto.create({
      data: { nombre: 'Lomo Completo', descripcion: 'Lomo, jamón, queso, lechuga, tomate, huevo', precio: aCentavos(6800), categoriaId: catComidas.id, imagen: 'https://images.unsplash.com/photo-1619881589316-56c7f9e6b587?auto=format&fit=crop&q=80&w=400&h=400' },
    }),
    prisma.producto.create({
      data: { nombre: 'Papas Fritas', descripcion: 'Porción grande con sal y cheddar', precio: aCentavos(3200), categoriaId: catComidas.id, imagen: 'https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?auto=format&fit=crop&q=80&w=400&h=400' },
    }),
    prisma.producto.create({
      data: { nombre: 'Ensalada César', descripcion: 'Lechuga, pollo grillado, parmesano, croutons', precio: aCentavos(5000), categoriaId: catComidas.id, imagen: 'https://images.unsplash.com/photo-1550304943-4f24f54ddde9?auto=format&fit=crop&q=80&w=400&h=400' },
    }),

    // Bebidas
    prisma.producto.create({
      data: { nombre: 'Coca-Cola 500ml', descripcion: 'Línea Coca-Cola', precio: aCentavos(1800), categoriaId: catBebidas.id, imagen: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&q=80&w=400&h=400' },
    }),
    prisma.producto.create({
      data: { nombre: 'Agua Mineral 500ml', descripcion: 'Con o sin gas', precio: aCentavos(1200), categoriaId: catBebidas.id, imagen: 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?auto=format&fit=crop&q=80&w=400&h=400' },
    }),
    prisma.producto.create({
      data: { nombre: 'Cerveza Artesanal IPA', descripcion: 'Pinta 500ml - elaboración propia', precio: aCentavos(3500), categoriaId: catBebidas.id, imagen: 'https://images.unsplash.com/photo-1535958636474-b021ee887b13?auto=format&fit=crop&q=80&w=400&h=400' },
    }),
    prisma.producto.create({
      data: { nombre: 'Cerveza Quilmes 1L', descripcion: 'Botella retornable', precio: aCentavos(3000), categoriaId: catBebidas.id, imagen: 'https://images.unsplash.com/photo-1615332579037-3c44b3660b53?auto=format&fit=crop&q=80&w=400&h=400' },
    }),
    prisma.producto.create({
      data: { nombre: 'Vino Malbec Copa', descripcion: 'Bodega Trapiche, Mendoza', precio: aCentavos(2800), categoriaId: catBebidas.id, imagen: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?auto=format&fit=crop&q=80&w=400&h=400' },
    }),
    prisma.producto.create({
      data: { nombre: 'Limonada Natural', descripcion: 'Jarra de limonada fresca con menta', precio: aCentavos(2200), categoriaId: catBebidas.id, imagen: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&q=80&w=400&h=400' },
    }),

    // Postres
    prisma.producto.create({
      data: { nombre: 'Flan Casero', descripcion: 'Con dulce de leche y crema', precio: aCentavos(3200), categoriaId: catPostres.id, imagen: 'https://images.unsplash.com/photo-1513442542250-854d436a73f2?auto=format&fit=crop&q=80&w=400&h=400' },
    }),
    prisma.producto.create({
      data: { nombre: 'Brownie con Helado', descripcion: 'Brownie tibio con helado de vainilla', precio: aCentavos(4000), categoriaId: catPostres.id, imagen: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&q=80&w=400&h=400' },
    }),
    prisma.producto.create({
      data: { nombre: 'Tiramisú', descripcion: 'Receta italiana clásica', precio: aCentavos(4500), categoriaId: catPostres.id, imagen: 'https://images.unsplash.com/photo-1571115177098-24ec42ed204d?auto=format&fit=crop&q=80&w=400&h=400' },
    }),
    prisma.producto.create({
      data: { nombre: 'Helado Artesanal (3 bochas)', descripcion: 'Chocolate, dulce de leche, frutilla', precio: aCentavos(3800), categoriaId: catPostres.id, imagen: 'https://images.unsplash.com/photo-1563805042-7684c8a9e9ce?auto=format&fit=crop&q=80&w=400&h=400' },
    }),

    // Entradas
    prisma.producto.create({
      data: { nombre: 'Empanadas (x3)', descripcion: 'Carne, pollo o jamón y queso', precio: aCentavos(3600), categoriaId: catEntradas.id, imagen: 'https://images.unsplash.com/photo-1628198759560-6921319200b3?auto=format&fit=crop&q=80&w=400&h=400' },
    }),
    prisma.producto.create({
      data: { nombre: 'Tabla de Picada', descripcion: 'Quesos, fiambres, aceitunas, pan casero', precio: aCentavos(7500), categoriaId: catEntradas.id, imagen: 'https://images.unsplash.com/photo-1616874830336-d8bb30b80fc9?auto=format&fit=crop&q=80&w=400&h=400' },
    }),
    prisma.producto.create({
      data: { nombre: 'Provoleta', descripcion: 'Provolone fundido con orégano y aceite de oliva', precio: aCentavos(4200), categoriaId: catEntradas.id, imagen: 'https://images.unsplash.com/photo-1596649234839-4458fcc605ce?auto=format&fit=crop&q=80&w=400&h=400' },
    }),
  ]);
  console.log(`✅ ${productos.length} productos creados`);

  // --- Pedidos activos en cocina ---
  const pedido1 = await prisma.pedido.create({
    data: {
      mesaId: mesas[1].id, // Mesa 2
      estado: 'preparando',
      total: aCentavos(13300),
      notas: '',
      items: {
        create: [
          { productoId: productos[0].id, cantidad: 2, precio: aCentavos(5500), notas: 'Una sin cebolla' },
          { productoId: productos[10].id, cantidad: 1, precio: aCentavos(3500), notas: '' },
        ],
      },
    },
  });

  const pedido2 = await prisma.pedido.create({
    data: {
      mesaId: mesas[4].id, // Mesa 5
      estado: 'pendiente',
      total: aCentavos(17700),
      notas: 'Cliente apurado',
      items: {
        create: [
          { productoId: productos[3].id, cantidad: 1, precio: aCentavos(8500), notas: 'Sin aceitunas' },
          { productoId: productos[4].id, cantidad: 1, precio: aCentavos(7200), notas: 'Bien cocida' },
          { productoId: productos[8].id, cantidad: 2, precio: aCentavos(1800), notas: '' },
        ],
      },
    },
  });

  const pedido3 = await prisma.pedido.create({
    data: {
      mesaId: mesas[0].id, // Mesa 1
      estado: 'listo',
      total: aCentavos(11200),
      notas: '',
      items: {
        create: [
          { productoId: productos[1].id, cantidad: 1, precio: aCentavos(7800), notas: '' },
          { productoId: productos[11].id, cantidad: 1, precio: aCentavos(3000), notas: '' },
        ],
      },
    },
  });
  console.log('✅ 3 pedidos activos creados');

  // --- Proveedores ---
  const prov1 = await prisma.proveedor.create({
    data: {
      nombre: 'Distribuidora Don Pedro',
      contacto: 'Pedro Ramírez',
      telefono: '+54 11 5555-1234',
      email: 'ventas@donpedro.com.ar',
      direccion: 'Av. San Martín 1520, CABA',
      notas: 'Entrega lunes y jueves',
    },
  });
  const prov2 = await prisma.proveedor.create({
    data: {
      nombre: 'Carnes Premium del Sur',
      contacto: 'María López',
      telefono: '+54 11 5555-5678',
      email: 'pedidos@carnespremium.com.ar',
      direccion: 'Ruta 3 Km 42, Cañuelas',
      notas: 'Pedido mínimo 20kg',
    },
  });
  const prov3 = await prisma.proveedor.create({
    data: {
      nombre: 'Bebidas del Litoral',
      contacto: 'Juan García',
      telefono: '+54 11 5555-9012',
      email: 'contacto@bebidaslitoral.com',
      direccion: 'Zona Industrial, Paraná',
      notas: 'Descuento 10% pagando contado',
    },
  });
  const prov4 = await prisma.proveedor.create({
    data: {
      nombre: 'Lácteos Santa Fe',
      contacto: 'Ana Martínez',
      telefono: '+54 342 555-3456',
      email: 'ventas@lacteossf.com.ar',
      direccion: 'Ruta 11 Km 8, Santa Fe',
      notas: 'Entrega refrigerada',
    },
  });
  console.log('✅ 4 proveedores creados');

  // --- Insumos ---
  await prisma.insumo.createMany({
    data: [
      { nombre: 'Carne Picada', unidad: 'kg', stockActual: 25, stockMinimo: 10, precioUnitario: aCentavos(3200), proveedorId: prov2.id },
      { nombre: 'Pan de Hamburguesa', unidad: 'unidad', stockActual: 48, stockMinimo: 20, precioUnitario: aCentavos(350), proveedorId: prov1.id },
      { nombre: 'Queso Cheddar', unidad: 'kg', stockActual: 8, stockMinimo: 5, precioUnitario: aCentavos(5500), proveedorId: prov4.id },
      { nombre: 'Muzzarella', unidad: 'kg', stockActual: 12, stockMinimo: 8, precioUnitario: aCentavos(4800), proveedorId: prov4.id },
      { nombre: 'Coca-Cola 500ml', unidad: 'unidad', stockActual: 36, stockMinimo: 24, precioUnitario: aCentavos(900), proveedorId: prov3.id },
      { nombre: 'Cerveza IPA', unidad: 'litro', stockActual: 20, stockMinimo: 10, precioUnitario: aCentavos(1800), proveedorId: prov3.id },
      { nombre: 'Harina 000', unidad: 'kg', stockActual: 15, stockMinimo: 10, precioUnitario: aCentavos(800), proveedorId: prov1.id },
      { nombre: 'Lechuga', unidad: 'unidad', stockActual: 3, stockMinimo: 5, precioUnitario: aCentavos(600), proveedorId: prov1.id },
      { nombre: 'Tomate', unidad: 'kg', stockActual: 4, stockMinimo: 5, precioUnitario: aCentavos(1500), proveedorId: prov1.id },
      { nombre: 'Aceite de Oliva', unidad: 'litro', stockActual: 6, stockMinimo: 3, precioUnitario: aCentavos(4500), proveedorId: prov1.id },
      { nombre: 'Huevos', unidad: 'unidad', stockActual: 18, stockMinimo: 30, precioUnitario: aCentavos(150), proveedorId: prov1.id },
      { nombre: 'Vino Malbec', unidad: 'unidad', stockActual: 8, stockMinimo: 6, precioUnitario: aCentavos(2000), proveedorId: prov3.id },
    ],
  });
  console.log('✅ 12 insumos creados');

  // --- Costos Fijos ---
  await prisma.costoFijo.createMany({
    data: [
      { concepto: 'Alquiler Local', monto: aCentavos(450000), tipo: 'fijo', periodicidad: 'mensual' },
      { concepto: 'Servicios (Luz, Gas, Agua)', monto: aCentavos(85000), tipo: 'fijo', periodicidad: 'mensual' },
      { concepto: 'Internet + POS', monto: aCentavos(25000), tipo: 'fijo', periodicidad: 'mensual' },
      { concepto: 'Sueldos Personal (x5)', monto: aCentavos(1200000), tipo: 'fijo', periodicidad: 'mensual' },
      { concepto: 'Insumos de Limpieza', monto: aCentavos(35000), tipo: 'variable', periodicidad: 'mensual' },
      { concepto: 'Contador', monto: aCentavos(60000), tipo: 'fijo', periodicidad: 'mensual' },
      { concepto: 'Seguro del Local', monto: aCentavos(40000), tipo: 'fijo', periodicidad: 'mensual' },
      { concepto: 'Mantenimiento', monto: aCentavos(30000), tipo: 'variable', periodicidad: 'mensual' },
    ],
  });
  console.log('✅ 8 costos fijos creados');

  // --- Ventas históricas (últimos 30 días) ---
  const ventasData = [];
  const today = new Date();
  for (let i = 30; i >= 0; i--) {
    const fecha = new Date(today);
    fecha.setDate(fecha.getDate() - i);
    const numVentas = Math.floor(Math.random() * 8) + 5; // 5-12 ventas por día
    for (let j = 0; j < numVentas; j++) {
      ventasData.push({
        fechaCobro: new Date(fecha.setHours(Math.floor(Math.random() * 6) + 12, Math.floor(Math.random() * 60))),
        total: aCentavos(Math.floor(Math.random() * 15000) + 5000),
        items: Math.floor(Math.random() * 5) + 1,
        mesaNumero: Math.floor(Math.random() * 8) + 1,
      });
    }
  }
  await prisma.venta.createMany({ data: ventasData });
  console.log(`✅ ${ventasData.length} ventas históricas creadas`);

  console.log('\n🎉 Datos sembrados exitosamente para AKROS Café!');
}

main()
  .catch((e) => {
    console.error('❌ Error sembrando datos:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
