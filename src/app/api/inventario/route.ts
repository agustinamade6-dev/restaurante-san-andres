import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { enPesos } from '@/lib/money';
import { crearInsumoSchema, editarInsumoSchema } from '@/lib/catalogo';
import { JSON_INVALIDO, codigoPrisma, leerJson, mensajeZod } from '@/lib/validacion';

const error = (mensaje: string, status: number) => NextResponse.json({ error: mensaje }, { status });

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const insumos = await prisma.insumo.findMany({
      include: { proveedor: true },
      orderBy: { nombre: 'asc' },
    });
    return NextResponse.json(enPesos(insumos));
  } catch (e) {
    console.error('Error fetching insumos:', e);
    return error('Error al obtener insumos', 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const raw = await leerJson(request);
    if (raw === JSON_INVALIDO) return error('Cuerpo JSON inválido', 400);
    const parsed = crearInsumoSchema.safeParse(raw);
    if (!parsed.success) return error(mensajeZod(parsed.error), 400);
    const datos = parsed.data;

    if (datos.proveedorId) {
      const proveedor = await prisma.proveedor.findUnique({ where: { id: datos.proveedorId } });
      if (!proveedor) return error('El proveedor no existe', 400);
    }

    const insumo = await prisma.insumo.create({
      data: { ...datos, proveedorId: datos.proveedorId ?? null },
      include: { proveedor: true },
    });
    return NextResponse.json(enPesos(insumo), { status: 201 });
  } catch (e) {
    console.error('Error creating insumo:', e);
    return error('Error al crear insumo', 500);
  }
}

export async function PUT(request: Request) {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const raw = await leerJson(request);
    if (raw === JSON_INVALIDO) return error('Cuerpo JSON inválido', 400);
    const parsed = editarInsumoSchema.safeParse(raw);
    if (!parsed.success) return error(mensajeZod(parsed.error), 400);
    const { id, ...datos } = parsed.data;

    const existente = await prisma.insumo.findUnique({ where: { id } });
    if (!existente) return error('Insumo no encontrado', 404);

    if (datos.proveedorId) {
      const proveedor = await prisma.proveedor.findUnique({ where: { id: datos.proveedorId } });
      if (!proveedor) return error('El proveedor no existe', 400);
    }

    const insumo = await prisma.insumo.update({
      where: { id },
      data: datos,
      include: { proveedor: true },
    });
    return NextResponse.json(enPesos(insumo));
  } catch (e) {
    if (codigoPrisma(e) === 'P2025') return error('Insumo no encontrado', 404);
    console.error('Error updating insumo:', e);
    return error('Error al actualizar insumo', 500);
  }
}
