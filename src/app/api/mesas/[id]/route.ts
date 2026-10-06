import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(['ADMIN', 'MOZO']);
  if (!auth.ok) return auth.response;

  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr);
    const body = await request.json();
    const { numero, capacidad, sector, forma } = body;
    
    // Check if new number conflicts
    if (numero) {
      const exists = await prisma.mesa.findUnique({ where: { numero } });
      if (exists && exists.id !== id) {
        return NextResponse.json({ success: false, error: 'El número de mesa ya está en uso' }, { status: 400 });
      }
    }

    const mesa = await prisma.mesa.update({
      where: { id },
      data: { numero, capacidad, sector, forma },
    });
    return NextResponse.json(mesa);
  } catch (error) {
    console.error('Error updating mesa:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Error al actualizar mesa' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr);
    
    // Validate not active
    const mesa = await prisma.mesa.findUnique({ where: { id }, include: { pedidos: true } });
    if (!mesa) return NextResponse.json({ success: false, error: 'Mesa no encontrada' }, { status: 404 });
    
    const activeOrders = mesa.pedidos.some(p => ['pendiente', 'preparando', 'listo'].includes(p.estado));
    if (activeOrders || mesa.estado !== 'libre') {
      return NextResponse.json({ success: false, error: 'No se puede eliminar una mesa ocupada o con pedidos activos' }, { status: 400 });
    }

    // Soft delete
    await prisma.mesa.update({
      where: { id },
      data: { activa: false }
    });

    return NextResponse.json({ success: true, tableId: id });
  } catch (error) {
    console.error('Error deleting mesa:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Error al eliminar mesa' }, { status: 500 });
  }
}
