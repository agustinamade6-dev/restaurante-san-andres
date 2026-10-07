// Formato único de montos para todas las pantallas y tickets: punto de miles y coma decimal (es-AR),
// sin depender del idioma configurado en la PC (`toLocaleString()` sin argumentos sí depende).
const SIN_DECIMALES = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const CON_DECIMALES = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Monto en pesos para mostrar: $1.500, $1.500,50, -$200.
 * Los centavos se muestran solo si los hay. Un valor no numérico se muestra como $0.
 */
export function formatPesos(monto: number): string {
  if (!Number.isFinite(monto)) return '$0';
  const centavos = Math.round(Math.abs(monto) * 100);
  const pesos = centavos / 100;
  const texto = centavos % 100 === 0 ? SIN_DECIMALES.format(pesos) : CON_DECIMALES.format(pesos);
  return `${monto < 0 && centavos !== 0 ? '-' : ''}$${texto}`;
}
