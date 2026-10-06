import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Los tests de PIN (scrypt) y los de migración (SQLite real + CLI de Prisma) son pesados en CPU:
    // corriendo en paralelo pueden superar los 5 s por defecto sin que haya un error.
    testTimeout: 20_000,
  },
});
