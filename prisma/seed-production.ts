import { PrismaClient } from '@prisma/client';

// Datos iniciales de la base que se entrega con el .exe (desktop-build/template.db).
// Sin pedidos, ventas ni productos de demo: solo lo necesario para empezar a operar.
// (prisma/seed.ts sigue siendo el seed de demo para desarrollo.)

const prisma = new PrismaClient();

async function main() {
  // Usuarios: el cliente debe cambiar los PIN desde Admin > Usuarios.
  const usuarios = [
    { nombre: 'Administrador', pin: '1111', rol: 'ADMIN' },
    { nombre: 'Cocina', pin: '2222', rol: 'COCINERO' },
    { nombre: 'Mozo', pin: '3333', rol: 'MOZO' },
  ];
  for (const u of usuarios) {
    await prisma.usuario.upsert({ where: { pin: u.pin }, update: {}, create: u });
  }

  // 17 mesas de salón en grilla de 4 columnas + 3 de barra (mismo layout que prisma/updateMesas.ts).
  for (let numero = 1; numero <= 20; numero++) {
    const barra = numero >= 18;
    const data = barra
      ? { sector: 'barra', forma: 'tall-bar', posX: 10, posY: 20 + (numero - 18) * 28, capacidad: 2 }
      : {
          sector: 'salon',
          forma: 'round',
          posX: [32, 52, 72, 92][(numero - 1) % 4],
          posY: 15 + Math.floor((numero - 1) / 4) * 18,
          capacidad: numero <= 8 ? 4 : numero <= 14 ? 6 : 8,
        };
    await prisma.mesa.upsert({ where: { numero }, update: {}, create: { numero, ...data } });
  }

  const categorias = [
    { nombre: 'Entradas', icono: 'salad', orden: 1 },
    { nombre: 'Comidas', icono: 'utensils-crossed', orden: 2 },
    { nombre: 'Bebidas', icono: 'glass-water', orden: 3 },
    { nombre: 'Postres', icono: 'cake-slice', orden: 4 },
  ];
  for (const c of categorias) {
    await prisma.categoria.upsert({ where: { nombre: c.nombre }, update: {}, create: c });
  }

  console.log('✅ Base inicial lista: 3 usuarios, 20 mesas, 4 categorías');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
