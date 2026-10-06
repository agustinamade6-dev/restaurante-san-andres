/** Error de negocio con status HTTP. Lanzado dentro de una transacción de Prisma, la revierte. */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Cantidad máxima por línea de pedido (cota de sensatez contra datos erróneos o abusivos). */
export const MAX_CANTIDAD_ITEM = 100;
