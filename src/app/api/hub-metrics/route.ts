import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

// Ocupación del salón y pedidos en cocina: dato del negocio, solo para usuarios con sesión.
export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    const mesas = await prisma.mesa.findMany();
    const ocupadas = mesas.filter(m => m.estado === 'ocupada').length;
    const libres = mesas.filter(m => m.estado === 'libre').length;
    
    const pedidosPreparando = await prisma.pedido.count({
      where: { estado: 'preparando' }
    });

    return NextResponse.json({
      mesas: { ocupadas, libres, total: mesas.length },
      cocina: { preparando: pedidosPreparando }
    });
  } catch (error) {
    console.error('Error fetching hub metrics:', error);
    return NextResponse.json({
      mesas: { ocupadas: 0, libres: 0, total: 0 },
      cocina: { preparando: 0 }
    }, { status: 500 });
  }
}
