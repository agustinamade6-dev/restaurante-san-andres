import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoriaId = searchParams.get('categoriaId');
    const busqueda = searchParams.get('q');

    const where: Record<string, unknown> = {};
    if (categoriaId) where.categoriaId = parseInt(categoriaId);
    if (busqueda) where.nombre = { contains: busqueda };

    const productos = await prisma.producto.findMany({
      where,
      include: { categoria: true },
      orderBy: [{ categoria: { orden: 'asc' } }, { nombre: 'asc' }],
    });
    return NextResponse.json(productos);
  } catch (error) {
    console.error('Error fetching productos:', error);
    return NextResponse.json({ error: 'Error al obtener productos' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
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
    return NextResponse.json(producto, { status: 201 });
  } catch (error) {
    console.error('Error creating producto:', error);
    return NextResponse.json({ error: 'Error al crear producto' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const producto = await prisma.producto.update({
      where: { id: body.id },
      data: {
        nombre: body.nombre,
        descripcion: body.descripcion,
        precio: body.precio,
        categoriaId: body.categoriaId,
        disponible: body.disponible,
        imagen: body.imagen,
      },
      include: { categoria: true },
    });
    return NextResponse.json(producto);
  } catch (error) {
    console.error('Error updating producto:', error);
    return NextResponse.json({ error: 'Error al actualizar producto' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
    await prisma.producto.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting producto:', error);
    return NextResponse.json({ error: 'Error al eliminar producto' }, { status: 500 });
  }
}
