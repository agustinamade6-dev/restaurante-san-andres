import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { ApiError } from '@/lib/api-error';
import { recetaSchema } from '@/lib/catalogo';
import { aPesos } from '@/lib/money';
import { JSON_INVALIDO, leerJson, mensajeZod } from '@/lib/validacion';

/**
 * Receta de un producto (AT-12): qué insumos consume UNA unidad vendida. Al cobrar, se descuentan del stock.
 *   GET → { productoId, items: [{ insumoId, cantidad, insumo: { id, nombre, unidad, precioUnitario } }], costoEstimado }
 *   PUT { items: [{ insumoId, cantidad }] } → reemplaza la receta completa (lista vacía = sin receta).
 * `precioUnitario` y `costoEstimado` (costo de los insumos de una unidad del producto) van en pesos.
 */

const error = (mensaje: string, status: number) => NextResponse.json({ error: mensaje }, { status });

async function productoId(params: Promise<{ id: string }>): Promise<number> {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, 'ID de producto inválido');
  return n;
}

async function leerReceta(id: number) {
  const items = await prisma.recetaItem.findMany({
    where: { productoId: id },
    include: { insumo: { select: { id: true, nombre: true, unidad: true, precioUnitario: true } } },
    orderBy: { id: 'asc' },
  });
  // precioUnitario está en centavos por unidad del insumo; el costo se redondea al centavo.
  const costoCentavos = Math.round(items.reduce((s, i) => s + i.cantidad * i.insumo.precioUnitario, 0));
  return {
    productoId: id,
    items: items.map((i) => ({
      insumoId: i.insumoId,
      cantidad: i.cantidad,
      insumo: { ...i.insumo, precioUnitario: aPesos(i.insumo.precioUnitario) },
    })),
    costoEstimado: aPesos(costoCentavos),
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const id = await productoId(params);
    const producto = await prisma.producto.findUnique({ where: { id }, select: { id: true } });
    if (!producto) return error('Producto no encontrado', 404);
    return NextResponse.json(await leerReceta(id));
  } catch (e) {
    if (e instanceof ApiError) return error(e.message, e.status);
    console.error('Error fetching receta:', e);
    return error('Error al obtener la receta', 500);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const id = await productoId(params);
    const raw = await leerJson(request);
    if (raw === JSON_INVALIDO) return error('Cuerpo JSON inválido', 400);
    const parsed = recetaSchema.safeParse(raw);
    if (!parsed.success) return error(mensajeZod(parsed.error), 400);
    const { items } = parsed.data;

    await prisma.$transaction(async (tx) => {
      const producto = await tx.producto.findUnique({ where: { id }, select: { id: true } });
      if (!producto) throw new ApiError(404, 'Producto no encontrado');

      const ids = items.map((i) => i.insumoId);
      const existentes = await tx.insumo.findMany({ where: { id: { in: ids } }, select: { id: true } });
      const faltante = ids.find((insumoId) => !existentes.some((e) => e.id === insumoId));
      if (faltante !== undefined) throw new ApiError(400, `El insumo ${faltante} no existe`);

      await tx.recetaItem.deleteMany({ where: { productoId: id } });
      if (items.length > 0) {
        await tx.recetaItem.createMany({ data: items.map((i) => ({ productoId: id, ...i })) });
      }
    });

    return NextResponse.json(await leerReceta(id));
  } catch (e) {
    if (e instanceof ApiError) return error(e.message, e.status);
    console.error('Error saving receta:', e);
    return error('Error al guardar la receta', 500);
  }
}
