import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { crearCostoSchema } from '@/lib/catalogo';
import { JSON_INVALIDO, codigoPrisma, idDeQuery, leerJson, mensajeZod } from '@/lib/validacion';

const error = (mensaje: string, status: number) => NextResponse.json({ error: mensaje }, { status });

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const costos = await prisma.costoFijo.findMany({
      orderBy: { concepto: 'asc' },
    });
    return NextResponse.json(costos);
  } catch (e) {
    console.error('Error fetching costos:', e);
    return error('Error al obtener costos', 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const raw = await leerJson(request);
    if (raw === JSON_INVALIDO) return error('Cuerpo JSON inválido', 400);
    const parsed = crearCostoSchema.safeParse(raw);
    if (!parsed.success) return error(mensajeZod(parsed.error), 400);

    const costo = await prisma.costoFijo.create({ data: parsed.data });
    return NextResponse.json(costo, { status: 201 });
  } catch (e) {
    console.error('Error creating costo:', e);
    return error('Error al crear costo', 500);
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const id = idDeQuery(request);
    if (id === undefined) return error('ID requerido', 400);
    if (id === null) return error('ID inválido', 400);

    await prisma.costoFijo.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    if (codigoPrisma(e) === 'P2025') return error('Costo no encontrado', 404);
    console.error('Error deleting costo:', e);
    return error('Error al eliminar costo', 500);
  }
}
