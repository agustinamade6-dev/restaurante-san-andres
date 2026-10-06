import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { getUploadsDir } from '@/lib/uploads';

export async function POST(req: NextRequest) {
  try {
    const data = await req.formData();
    const file: File | null = data.get('file') as unknown as File;

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó ningún archivo' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Asegurarse de que el directorio exista
    const uploadDir = join(getUploadsDir(), 'products');
    await mkdir(uploadDir, { recursive: true });

    // Generar un nombre de archivo único
    const timestamp = Date.now();
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    
    // Validar extensión
    if (!['png', 'jpg', 'jpeg', 'webp'].includes(extension)) {
      return NextResponse.json({ error: 'Formato no permitido' }, { status: 400 });
    }

    const filename = `prod-${timestamp}.${extension}`;
    const filePath = join(uploadDir, filename);

    // Guardar el archivo
    await writeFile(filePath, buffer);

    // Responder con la URL pública relativa
    return NextResponse.json({
      success: true,
      url: `/uploads/products/${filename}`
    });
  } catch (error) {
    console.error('Error al subir el archivo:', error);
    return NextResponse.json({ error: 'Error interno del servidor al procesar el archivo' }, { status: 500 });
  }
}
