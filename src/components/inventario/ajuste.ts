// Validación del ajuste manual de stock (POST /api/inventario/ajuste: { insumoId, delta, motivo }).
// Repite las reglas de ajusteStockSchema (src/lib/catalogo.ts) para avisar antes de enviar.

export type Sentido = 'sumar' | 'restar';

export const MAX_AJUSTE = 1_000_000;
export const MIN_MOTIVO = 3;
export const MAX_MOTIVO = 200;

/** "1,5" o "1.5" -> 1.5. Vacío o texto no numérico -> NaN. */
export function leerCantidad(texto: string): number {
  const limpio = texto.trim().replace(',', '.');
  if (limpio === '' || !/^\d*\.?\d+$|^\d+\.$/.test(limpio)) return NaN;
  return Number(limpio);
}

export type ResultadoAjuste =
  | { ok: true; delta: number; motivo: string; stockNuevo: number; quedaNegativo: boolean }
  | { ok: false; error: string };

export function validarAjuste(
  { cantidad, sentido, motivo }: { cantidad: string; sentido: Sentido; motivo: string },
  stockActual: number
): ResultadoAjuste {
  const valor = leerCantidad(cantidad);
  if (Number.isNaN(valor)) return { ok: false, error: 'Ingresá una cantidad (por ejemplo 2 o 1,5)' };
  if (valor === 0) return { ok: false, error: 'La cantidad tiene que ser mayor a 0' };
  if (valor > MAX_AJUSTE) return { ok: false, error: 'La cantidad es demasiado grande' };

  const texto = motivo.trim();
  if (texto.length < MIN_MOTIVO) return { ok: false, error: `Escribí el motivo (mínimo ${MIN_MOTIVO} caracteres)` };
  if (texto.length > MAX_MOTIVO) return { ok: false, error: `El motivo es demasiado largo (máximo ${MAX_MOTIVO} caracteres)` };

  const delta = sentido === 'sumar' ? valor : -valor;
  // Redondeo a 3 decimales para no mostrar 0.30000000000000004.
  const stockNuevo = Math.round((stockActual + delta) * 1000) / 1000;
  return { ok: true, delta, motivo: texto, stockNuevo, quedaNegativo: stockNuevo < 0 };
}
