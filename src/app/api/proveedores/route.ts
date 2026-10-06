import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const proveedores = await prisma.proveedor.findMany({
      include: { _count: { select: { insumos: true } } },
      orderBy: { nombre: 'asc' },
    });
    return NextResponse.json(proveedores);
  } catch (error) {
    console.error('Error fetching proveedores:', error);
    return NextResponse.json({ error: 'Error al obtener proveedores' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
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
  } catch (error) {
    console.error('Error creating proveedor:', error);
    return NextResponse.json({ error: 'Error al crear proveedor' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const proveedor = await prisma.proveedor.update({
      where: { id: body.id },
      data: {
        nombre: body.nombre,
        contacto: body.contacto,
        telefono: body.telefono,
        email: body.email,
        direccion: body.direccion,
        notas: body.notas,
      },
    });
    return NextResponse.json(proveedor);
  } catch (error) {
    console.error('Error updating proveedor:', error);
    return NextResponse.json({ error: 'Error al actualizar proveedor' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
    await prisma.proveedor.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting proveedor:', error);
    return NextResponse.json({ error: 'Error al eliminar proveedor' }, { status: 500 });
  }
}
