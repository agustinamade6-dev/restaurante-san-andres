import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const costos = await prisma.costoFijo.findMany({
      orderBy: { concepto: 'asc' },
    });
    return NextResponse.json(costos);
  } catch (error) {
    console.error('Error fetching costos:', error);
    return NextResponse.json({ error: 'Error al obtener costos' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const costo = await prisma.costoFijo.create({
      data: {
        concepto: body.concepto,
        monto: body.monto,
        tipo: body.tipo || 'fijo',
        periodicidad: body.periodicidad || 'mensual',
      },
    });
    return NextResponse.json(costo, { status: 201 });
  } catch (error) {
    console.error('Error creating costo:', error);
    return NextResponse.json({ error: 'Error al crear costo' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
    await prisma.costoFijo.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting costo:', error);
    return NextResponse.json({ error: 'Error al eliminar costo' }, { status: 500 });
  }
}
