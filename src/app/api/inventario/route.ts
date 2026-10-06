import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { enPesos } from '@/lib/money';
import { crearInsumoSchema, editarInsumoSchema } from '@/lib/catalogo';
import { JSON_INVALIDO, codigoPrisma, idDeQuery, leerJson, mensajeZod } from '@/lib/validacion';

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

    // El stock no se reemplaza por esta vía: un valor absoluto pisaba los descuentos de ventas hechas mientras la
    // pantalla estaba abierta, y el cambio no quedaba registrado. Para cambiarlo: POST /api/inventario/ajuste.
    // Si llega el mismo valor que ya tiene (la pantalla manda el insumo completo), se ignora.
    const { stockActual, ...cambios } = datos;
    if (stockActual !== undefined && stockActual !== existente.stockActual) {
      return error('El stock no se edita acá: usá "Ajustar stock" (POST /api/inventario/ajuste) con la diferencia y un motivo.', 400);
    }

    if (cambios.proveedorId) {
      const proveedor = await prisma.proveedor.findUnique({ where: { id: cambios.proveedorId } });
      if (!proveedor) return error('El proveedor no existe', 400);
    }

    const insumo = await prisma.insumo.update({
      where: { id },
      data: cambios,
      include: { proveedor: true },
    });
    return NextResponse.json(enPesos(insumo));
  } catch (e) {
    if (codigoPrisma(e) === 'P2025') return error('Insumo no encontrado', 404);
    console.error('Error updating insumo:', e);
    return error('Error al actualizar insumo', 500);
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const id = idDeQuery(request);
    if (id === undefined) return error('ID requerido', 400);
    if (id === null) return error('ID inválido', 400);

    const existente = await prisma.insumo.findUnique({ where: { id } });
    if (!existente) return error('Insumo no encontrado', 404);

    // Un insumo en una receta no se borra: esos productos dejarían de descontar stock sin aviso.
    const recetas = await prisma.recetaItem.findMany({ where: { insumoId: id } });
    if (recetas.length > 0) {
      const productos = await prisma.producto.findMany({
        where: { id: { in: recetas.map((r) => r.productoId) } },
        select: { nombre: true },
      });
      const nombres = productos.map((p) => p.nombre).join(', ');
      return error(`El insumo está en la receta de: ${nombres}. Quitalo de esas recetas antes de eliminarlo.`, 400);
    }

    // Con movimientos de stock (ventas que lo descontaron) borrarlo rompería ese historial.
    const movimientos = await prisma.movimientoStock.count({ where: { insumoId: id } });
    if (movimientos > 0) {
      return error('No se puede eliminar un insumo con movimientos de stock registrados.', 400);
    }

    await prisma.insumo.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    if (codigoPrisma(e) === 'P2025') return error('Insumo no encontrado', 404);
    if (codigoPrisma(e) === 'P2003') {
      return error('No se puede eliminar un insumo usado en recetas o con movimientos de stock.', 400);
    }
    console.error('Error deleting insumo:', e);
    return error('Error al eliminar insumo', 500);
  }
}
