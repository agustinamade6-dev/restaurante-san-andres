import { join } from 'path';

/**
 * Carpeta donde se guardan las imágenes subidas.
 * En el .exe, Electron define UPLOADS_DIR dentro de userData (escribible y persistente).
 * En desarrollo se usa public/uploads como antes.
 */
export function getUploadsDir() {
  return process.env.UPLOADS_DIR || join(process.cwd(), 'public', 'uploads');
}
