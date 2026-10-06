// Prepara todo lo que el .exe necesita, a partir de `next build` (output: 'standalone').
//
// Resultado en desktop-build/:
//   server/       -> servidor Next.js autónomo (server.js + node_modules mínimos + .next + public)
//   template.db   -> base SQLite con el esquema actual + prisma/seed-production.ts, se copia a userData en el primer arranque
//
// Uso: node scripts/prepare-desktop.mjs [--no-seed]

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const standalone = path.join(root, '.next', 'standalone');
const out = path.join(root, 'desktop-build');
const serverOut = path.join(out, 'server');
const templateDb = path.join(out, 'template.db');
const withSeed = !process.argv.includes('--no-seed');

function step(msg) {
  console.log(`\n▶ ${msg}`);
}

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

// Copia recursiva que RESUELVE symlinks/junctions. Turbopack deja en
// .next/standalone/.next/node_modules junctions que apuntan a rutas absolutas
// de esta PC (p. ej. @prisma/client-<hash> -> C:\Users\...\node_modules\@prisma\client).
// En la máquina del cliente esas rutas no existen y Prisma no carga.
function copyResolved(src, dest) {
  const real = fs.realpathSync(src);
  const stat = fs.statSync(real);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(real)) {
      copyResolved(path.join(real, entry), path.join(dest, entry));
    }
  } else if (!/\.tmp\d*$/.test(real)) {
    fs.copyFileSync(real, dest);
  }
}

function findFiles(dir, predicate, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findFiles(full, predicate, acc);
    else if (predicate(entry.name, full)) acc.push(full);
  }
  return acc;
}

if (!fs.existsSync(path.join(standalone, 'server.js'))) {
  fail('No existe .next/standalone/server.js. Ejecutá primero "npm run build" (next.config debe tener output: "standalone").');
}

step('Limpiando desktop-build/');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

step('Copiando servidor standalone (resolviendo junctions de Turbopack)');
copyResolved(standalone, serverOut);

step('Copiando .next/static y public/ (standalone no los incluye)');
copyResolved(path.join(root, '.next', 'static'), path.join(serverOut, '.next', 'static'));
fs.rmSync(path.join(serverOut, 'public'), { recursive: true, force: true });
copyResolved(path.join(root, 'public'), path.join(serverOut, 'public'));

step('Asegurando el motor de Prisma para Windows');
copyResolved(
  path.join(root, 'node_modules', '.prisma', 'client'),
  path.join(serverOut, 'node_modules', '.prisma', 'client'),
);

step('Quitando archivos de desarrollo (.env, *.db)');
for (const f of findFiles(serverOut, (name) => /^\.env/.test(name) || /\.db(-journal)?$/.test(name))) {
  fs.rmSync(f);
}

const leftoverLinks = findFiles(serverOut, (_n, full) => fs.lstatSync(full).isSymbolicLink());
if (leftoverLinks.length) fail(`Quedaron symlinks en el build:\n${leftoverLinks.join('\n')}`);
if (!findFiles(serverOut, (name) => name === 'query_engine-windows.dll.node').length) {
  fail('No se encontró query_engine-windows.dll.node dentro del servidor.');
}

step('Creando base de datos plantilla (prisma db push)');
const env = { ...process.env, DATABASE_URL: `file:${templateDb.replace(/\\/g, '/')}` };
execSync('npx prisma db push --skip-generate', { stdio: 'inherit', env });
if (withSeed) {
  step('Cargando datos iniciales (prisma/seed-production.ts)');
  execSync('npx tsx prisma/seed-production.ts', { stdio: 'inherit', env });
}
if (!fs.existsSync(templateDb)) fail('No se generó desktop-build/template.db');

console.log('\n✔ desktop-build/ listo para electron-builder');
