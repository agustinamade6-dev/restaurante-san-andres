import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Prisma Client singleton.
 * 
 * In production (Electron packaged app), the DATABASE_URL is set dynamically
 * by the Electron main process to point to the user's persistent data directory
 * (app.getPath('userData')). This ensures the SQLite database has proper
 * read/write permissions and survives app reinstalls.
 * 
 * In development, it falls back to the .env file (file:./dev.db).
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    datasourceUrl: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
