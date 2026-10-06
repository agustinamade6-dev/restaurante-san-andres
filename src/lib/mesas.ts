import { z } from 'zod';

export const SECTORES = ['salon', 'barra'] as const;
export const FORMAS = ['round', 'square', 'tall-bar'] as const;
export const ESTADOS_MESA = ['libre', 'ocupada', 'esperando'] as const;

/** Pedidos que "retienen" la mesa (la mesa no puede quedar libre). */
export const PEDIDOS_QUE_OCUPAN_MESA = ['pendiente', 'preparando', 'listo'];
/** Pedidos que impiden eliminar la mesa: además de los activos, el entregado que aún no se cobró. */
export const PEDIDOS_QUE_BLOQUEAN_BORRADO = [...PEDIDOS_QUE_OCUPAN_MESA, 'entregado'];

// Los números negativos están reservados para mesas eliminadas "archivadas" (ver PATCH /api/mesas/[id]).
const numero = z.coerce.number().int().min(1).max(9999);
const capacidad = z.coerce.number().int().min(1).max(50);

export const crearMesaSchema = z.object({
  numero,
  capacidad: capacidad.default(4),
  sector: z.enum(SECTORES).default('salon'),
  forma: z.enum(FORMAS).default('round'),
  posX: z.coerce.number().finite().default(50),
  posY: z.coerce.number().finite().default(50),
});

// El frontend envía el objeto mesa completo: los campos que no se editan por esta vía se descartan.
export const editarMesaSchema = z.object({
  numero: numero.optional(),
  capacidad: capacidad.optional(),
  sector: z.enum(SECTORES).optional(),
  forma: z.enum(FORMAS).optional(),
});

export const estadoMesaSchema = z.object({
  id: z.coerce.number().int().positive(),
  estado: z.enum(ESTADOS_MESA),
});

export const layoutSchema = z.object({
  mesas: z
    .array(
      z.object({
        id: z.coerce.number().int().positive(),
        posX: z.coerce.number().finite(),
        posY: z.coerce.number().finite(),
      })
    )
    .min(1)
    .max(500),
});

export { mensajeZod } from '@/lib/validacion';
