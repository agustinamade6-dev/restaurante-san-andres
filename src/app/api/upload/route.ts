import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { getUploadsDir } from '@/lib/uploads';
import { MAX_IMAGEN_BYTES, detectarImagen } from '@/lib/imagen';

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  try {
    // Rechazo temprano por tamaño declarado, antes de leer el cuerpo completo en memoria.
    const declarado = Number(req.headers.get('content-length') ?? 0);
    if (declarado > MAX_IMAGEN_BYTES + 1024 * 1024) {
      return NextResponse.json({ error: 'La imagen supera el tamaño máximo de 5 MB' }, { status: 413 });
    }

    let data: FormData;
    try {
      data = await req.formData();
    } catch {
      return NextResponse.json({ error: 'Formulario inválido' }, { status: 400 });
    }

    const file = data.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No se proporcionó ningún archivo' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'El archivo está vacío' }, { status: 400 });
    }
    if (file.size > MAX_IMAGEN_BYTES) {
      return NextResponse.json({ error: 'La imagen supera el tamaño máximo de 5 MB' }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // El formato se decide por el contenido real, no por el nombre que declara el cliente.
    const tipo = detectarImagen(buffer);
    if (!tipo) {
      return NextResponse.json({ error: 'Formato no permitido (solo PNG, JPG o WebP)' }, { status: 400 });
    }

    // Asegurarse de que el directorio exista
    const uploadDir = join(getUploadsDir(), 'products');
    await mkdir(uploadDir, { recursive: true });

    // Nombre único: la marca de tiempo sola puede repetirse si dos subidas ocurren en el mismo milisegundo.
    const filename = `prod-${Date.now()}-${randomBytes(4).toString('hex')}.${tipo.ext}`;
    await writeFile(join(uploadDir, filename), buffer, { flag: 'wx' });

    // Responder con la URL pública relativa
    return NextResponse.json({
      success: true,
      url: `/uploads/products/${filename}`,
    });
  } catch (error) {
    console.error('Error al subir el archivo:', error);
    return NextResponse.json({ error: 'Error interno del servidor al procesar el archivo' }, { status: 500 });
  }
}
