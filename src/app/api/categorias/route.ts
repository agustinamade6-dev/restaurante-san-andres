import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    const categorias = await prisma.categoria.findMany({
      orderBy: { orden: 'asc' },
      include: { _count: { select: { productos: true } } },
    });
    return NextResponse.json(categorias);
  } catch (error) {
    console.error('Error fetching categorias:', error);
    return NextResponse.json({ error: 'Error al obtener categorías' }, { status: 500 });
  }
}
