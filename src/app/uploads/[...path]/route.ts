import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join, resolve, sep, extname } from 'path';
import { getUploadsDir } from '@/lib/uploads';

export const dynamic = 'force-dynamic';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

// Sirve las imágenes subidas desde UPLOADS_DIR (userData en el .exe).
// Las imágenes que vienen en public/uploads las sirve Next directamente y tienen prioridad.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  const base = resolve(getUploadsDir());
  const filePath = resolve(join(base, ...segments));
  const type = MIME[extname(filePath).toLowerCase()];

  if (!filePath.startsWith(base + sep) || !type) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const data = await readFile(filePath);
    return new NextResponse(data, {
      headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
