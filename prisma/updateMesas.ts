import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const mesas = await prisma.mesa.findMany();
  
  for (const mesa of mesas) {
    let sector = 'salon';
    let forma = 'round';
    let posX = 0;
    let posY = 0;

    if (mesa.numero >= 18 && mesa.numero <= 20) {
      const idx = mesa.numero - 18;
      sector = 'barra';
      forma = 'tall-bar';
      posX = 10;
      posY = 20 + idx * 28;
    } else {
      const colIdx = (mesa.numero - 1) % 4;
      const rowIdx = Math.floor((mesa.numero - 1) / 4);
      const xPositions = [32, 52, 72, 92];
      sector = 'salon';
      forma = 'round';
      posX = xPositions[colIdx];
      posY = 15 + rowIdx * 18;
    }

    await prisma.mesa.update({
      where: { id: mesa.id },
      data: {
        sector,
        forma,
        posX,
        posY,
        activa: true
      }
    });
  }
  
  console.log('✅ Coordenadas de mesas actualizadas');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
