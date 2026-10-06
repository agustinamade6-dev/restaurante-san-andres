import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const insumos = await prisma.insumo.findMany({
      include: { proveedor: true },
      orderBy: { nombre: 'asc' },
    });
    return NextResponse.json(insumos);
  } catch (error) {
    console.error('Error fetching insumos:', error);
    return NextResponse.json({ error: 'Error al obtener insumos' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const insumo = await prisma.insumo.update({
      where: { id: body.id },
      data: {
        nombre: body.nombre,
        unidad: body.unidad,
        stockActual: body.stockActual,
        stockMinimo: body.stockMinimo,
        precioUnitario: body.precioUnitario,
        proveedorId: body.proveedorId,
      },
      include: { proveedor: true },
    });
    return NextResponse.json(insumo);
  } catch (error) {
    console.error('Error updating insumo:', error);
    return NextResponse.json({ error: 'Error al actualizar insumo' }, { status: 500 });
  }
}
