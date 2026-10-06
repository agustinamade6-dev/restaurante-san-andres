import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { transaccion } from '@/lib/transaccion';
import { ajusteStockSchema } from '@/lib/catalogo';
import { enPesos } from '@/lib/money';
import { ajustarStock } from '@/lib/stock';
import { JSON_INVALIDO, leerJson, mensajeZod } from '@/lib/validacion';

const error = (mensaje: string, status: number) => NextResponse.json({ error: mensaje }, { status });

/**
 * Ajuste manual de stock (solo ADMIN): { insumoId, delta, motivo }.
 * `delta` se suma al stock actual de la base (negativo resta) y queda un MovimientoStock "AJUSTE" con el motivo.
 * Responde el insumo actualizado (precio en pesos).
 */
export async function POST(request: Request) {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    const raw = await leerJson(request);
    if (raw === JSON_INVALIDO) return error('Cuerpo JSON inválido', 400);
    const parsed = ajusteStockSchema.safeParse(raw);
    if (!parsed.success) return error(mensajeZod(parsed.error), 400);
    const { insumoId, delta, motivo } = parsed.data;

    const insumo = await transaccion(async (tx) => {
      const existe = await tx.insumo.findUnique({ where: { id: insumoId }, select: { id: true } });
      if (!existe) return null;
      return ajustarStock(tx, { insumoId, delta, detalle: motivo, usuarioId: auth.session.id });
    });
    if (!insumo) return error('Insumo no encontrado', 404);
    return NextResponse.json(enPesos(insumo));
  } catch (e) {
    console.error('Error ajustando stock:', e);
    return error('Error al ajustar el stock', 500);
  }
}
