import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { enPesos } from '@/lib/money';
import { crearProductoSchema, editarProductoSchema } from '@/lib/catalogo';
import { JSON_INVALIDO, codigoPrisma, idDeQuery, leerJson, mensajeZod } from '@/lib/validacion';

const error = (mensaje: string, status: number) => NextResponse.json({ error: mensaje }, { status });

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const categoriaId = idDeQuery(request, 'categoriaId');
    if (categoriaId === null) return error('categoriaId inválido', 400);
    const busqueda = searchParams.get('q');
    if (busqueda && busqueda.length > 100) return error('La búsqueda es demasiado larga', 400);

    const where: Record<string, unknown> = {};
    if (categoriaId) where.categoriaId = categoriaId;
    if (busqueda) where.nombre = { contains: busqueda };
    const productos = await prisma.producto.findMany({
      where,
      include: { categoria: true },
      orderBy: [{ categoria: { orden: 'asc' } }, { nombre: 'asc' }],
    });
    return NextResponse.json(enPesos(productos));
  } catch (e) {
    console.error('Error fetching productos:', e);
    return error('Error al obtener productos', 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const raw = await leerJson(request);
    if (raw === JSON_INVALIDO) return error('Cuerpo JSON inválido', 400);
    const parsed = crearProductoSchema.safeParse(raw);
    if (!parsed.success) return error(mensajeZod(parsed.error), 400);
    const body = parsed.data;

    const categoria = await prisma.categoria.findUnique({ where: { id: body.categoriaId } });
    if (!categoria) return error('La categoría no existe', 400);

    const producto = await prisma.producto.create({
      data: {
        nombre: body.nombre,
        descripcion: body.descripcion || '',
        precio: body.precio,
        categoriaId: body.categoriaId,
        disponible: body.disponible ?? true,
        imagen: body.imagen || '',
      },
      include: { categoria: true },
    });
    return NextResponse.json(enPesos(producto), { status: 201 });
  } catch (e) {
    console.error('Error creating producto:', e);
    return error('Error al crear producto', 500);
  }
}

export async function PUT(request: Request) {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const raw = await leerJson(request);
    if (raw === JSON_INVALIDO) return error('Cuerpo JSON inválido', 400);
    const parsed = editarProductoSchema.safeParse(raw);
    if (!parsed.success) return error(mensajeZod(parsed.error), 400);
    const { id, ...datos } = parsed.data;

    const existente = await prisma.producto.findUnique({ where: { id } });
    if (!existente) return error('Producto no encontrado', 404);

    if (datos.categoriaId !== undefined) {
      const categoria = await prisma.categoria.findUnique({ where: { id: datos.categoriaId } });
      if (!categoria) return error('La categoría no existe', 400);
    }

    const producto = await prisma.producto.update({
      where: { id },
      data: datos,
      include: { categoria: true },
    });
    return NextResponse.json(enPesos(producto));
  } catch (e) {
    if (codigoPrisma(e) === 'P2025') return error('Producto no encontrado', 404);
    console.error('Error updating producto:', e);
    return error('Error al actualizar producto', 500);
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const id = idDeQuery(request);
    if (id === undefined) return error('ID requerido', 400);
    if (id === null) return error('ID inválido', 400);

    const existente = await prisma.producto.findUnique({ where: { id } });
    if (!existente) return error('Producto no encontrado', 404);

    // Un producto que ya se vendió no se puede borrar sin romper el historial de pedidos.
    const pedidos = await prisma.itemPedido.count({ where: { productoId: id } });
    if (pedidos > 0) {
      return error('No se puede eliminar un producto con pedidos registrados. Marcalo como no disponible.', 400);
    }

    await prisma.producto.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    if (codigoPrisma(e) === 'P2025') return error('Producto no encontrado', 404);
    if (codigoPrisma(e) === 'P2003') {
      return error('No se puede eliminar un producto con pedidos registrados. Marcalo como no disponible.', 400);
    }
    console.error('Error deleting producto:', e);
    return error('Error al eliminar producto', 500);
  }
}
