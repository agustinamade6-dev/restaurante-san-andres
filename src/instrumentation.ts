/**
 * Next.js llama a register() una vez al iniciar el servidor, antes de atender peticiones.
 * Se usa para aplicar las migraciones de esquema pendientes (ver src/lib/migraciones.ts).
 */
export async function register() {
  // Prisma no corre en el runtime Edge: solo en Node.js.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { migrarBase } = await import('@/lib/migraciones');
  try {
    const aplicados = await migrarBase();
    for (const nombre of aplicados) console.log(`[DB] Migración aplicada: ${nombre}`);
  } catch (error) {
    // Sin la migración el servidor no puede operar con datos correctos: se relanza para que no arranque
    // en silencio con un esquema incompatible. La migración es transaccional: la base queda como estaba.
    console.error('[DB] Error al migrar la base de datos:', error);
    throw error;
  }
}
