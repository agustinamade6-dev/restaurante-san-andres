import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { crearProveedorSchema, editarProveedorSchema } from '@/lib/catalogo';
import { JSON_INVALIDO, codigoPrisma, idDeQuery, leerJson, mensajeZod } from '@/lib/validacion';

const error = (mensaje: string, status: number) => NextResponse.json({ error: mensaje }, { status });

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const proveedores = await prisma.proveedor.findMany({
      include: { _count: { select: { insumos: true } } },
      orderBy: { nombre: 'asc' },
    });
    return NextResponse.json(proveedores);
  } catch (e) {
    console.error('Error fetching proveedores:', e);
    return error('Error al obtener proveedores', 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const raw = await leerJson(request);
    if (raw === JSON_INVALIDO) return error('Cuerpo JSON inválido', 400);
    const parsed = crearProveedorSchema.safeParse(raw);
    if (!parsed.success) return error(mensajeZod(parsed.error), 400);
    const body = parsed.data;

    const proveedor = await prisma.proveedor.create({
      data: {
        nombre: body.nombre,
        contacto: body.contacto || '',
        telefono: body.telefono || '',
        email: body.email || '',
        direccion: body.direccion || '',
        notas: body.notas || '',
      },
    });
    return NextResponse.json(proveedor, { status: 201 });
  } catch (e) {
    console.error('Error creating proveedor:', e);
    return error('Error al crear proveedor', 500);
  }
}

export async function PUT(request: Request) {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const raw = await leerJson(request);
    if (raw === JSON_INVALIDO) return error('Cuerpo JSON inválido', 400);
    const parsed = editarProveedorSchema.safeParse(raw);
    if (!parsed.success) return error(mensajeZod(parsed.error), 400);
    const { id, ...datos } = parsed.data;

    const proveedor = await prisma.proveedor.update({ where: { id }, data: datos });
    return NextResponse.json(proveedor);
  } catch (e) {
    if (codigoPrisma(e) === 'P2025') return error('Proveedor no encontrado', 404);
    console.error('Error updating proveedor:', e);
    return error('Error al actualizar proveedor', 500);
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const id = idDeQuery(request);
    if (id === undefined) return error('ID requerido', 400);
    if (id === null) return error('ID inválido', 400);

    await prisma.proveedor.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    if (codigoPrisma(e) === 'P2025') return error('Proveedor no encontrado', 404);
    console.error('Error deleting proveedor:', e);
    return error('Error al eliminar proveedor', 500);
  }
}
