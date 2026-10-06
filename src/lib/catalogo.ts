import { z } from 'zod';

const vacioANulo = (v: unknown) => (v === '' || v === null ? undefined : v);

const idPositivo = z.coerce.number().int().positive();
const nombre = z.string().trim().min(1, 'es obligatorio').max(100);
const texto = (max: number) => z.string().trim().max(max);
const montoPositivo = z.coerce.number().finite().gt(0, 'debe ser mayor que 0').max(1_000_000_000);
const cantidadStock = z.coerce.number().finite().min(0, 'no puede ser negativo').max(1_000_000_000);

/**
 * Ícono de reemplazo: la pantalla de Menú usa un emoji ("🍽️") como marcador de "sin imagen".
 * Se acepta un texto corto formado SOLO por caracteres no ASCII (emojis, símbolos); un texto con letras
 * o números ASCII no es un ícono.
 */
function esIcono(v: string): boolean {
  const caracteres = [...v];
  return v.length <= 16 && caracteres.length >= 1 && caracteres.every((c) => (c.codePointAt(0) ?? 0) > 127);
}

/**
 * Imagen de producto: vacía, un emoji de reemplazo, una ruta propia (/uploads/...) o una URL http(s).
 * Nada de javascript:, data: ni //host.
 */
const imagen = texto(500).refine(
  (v) => v === '' || esIcono(v) || (v.startsWith('/') && !v.startsWith('//')) || /^https?:\/\//i.test(v),
  'debe ser una ruta de /uploads, una URL http(s) o un emoji'
);

/* ───────────── Productos ───────────── */

export const crearProductoSchema = z.object({
  nombre,
  descripcion: texto(500).nullish(),
  precio: montoPositivo,
  categoriaId: idPositivo,
  disponible: z.boolean().nullish(),
  imagen: imagen.nullish(),
});

// PUT: el frontend envía el objeto completo; cada campo presente se valida, los ausentes no se tocan.
export const editarProductoSchema = z.object({
  id: idPositivo,
  nombre: nombre.optional(),
  descripcion: texto(500).optional(),
  precio: montoPositivo.optional(),
  categoriaId: idPositivo.optional(),
  disponible: z.boolean().optional(),
  imagen: imagen.optional(),
});

/* ───────────── Costos ───────────── */

export const TIPOS_COSTO = ['fijo', 'variable'] as const;
export const PERIODICIDADES = ['diario', 'semanal', 'mensual'] as const;

export const crearCostoSchema = z.object({
  concepto: nombre,
  monto: montoPositivo,
  tipo: z.preprocess(vacioANulo, z.enum(TIPOS_COSTO).default('fijo')),
  periodicidad: z.preprocess(vacioANulo, z.enum(PERIODICIDADES).default('mensual')),
});

/* ───────────── Proveedores ───────────── */

const email = z.union([z.literal(''), z.string().trim().email('no es un correo válido').max(120)]);

export const crearProveedorSchema = z.object({
  nombre,
  contacto: texto(100).nullish(),
  telefono: texto(40).nullish(),
  email: email.nullish(),
  direccion: texto(200).nullish(),
  notas: texto(500).nullish(),
});

export const editarProveedorSchema = z.object({
  id: idPositivo,
  nombre: nombre.optional(),
  contacto: texto(100).optional(),
  telefono: texto(40).optional(),
  email: email.optional(),
  direccion: texto(200).optional(),
  notas: texto(500).optional(),
});

/* ───────────── Inventario ───────────── */

// La pantalla envía el insumo completo (con `proveedor` anidado y fechas): lo que no se declara acá se descarta.
export const editarInsumoSchema = z.object({
  id: idPositivo,
  nombre: nombre.optional(),
  unidad: z.string().trim().min(1, 'es obligatoria').max(20).optional(),
  stockActual: cantidadStock.optional(),
  stockMinimo: cantidadStock.optional(),
  precioUnitario: cantidadStock.optional(),
  proveedorId: idPositivo.nullish(),
});
