// Hook afterPack de electron-builder.
//
// Copia desktop-build/ (servidor standalone + template.db) a resources/ del paquete.
// No usamos "extraResources" porque electron-builder descarta las carpetas
// node_modules que hay adentro, y el servidor standalone las necesita.
// Al final verifica lo crítico: si falta algo, el build falla acá y no en la PC del cliente.

const fs = require('fs');
const path = require('path');

const REQUIRED = [
  'server/server.js',
  'server/.next/BUILD_ID',
  'server/.next/static',
  'server/node_modules/next/package.json',
  'server/node_modules/.prisma/client/query_engine-windows.dll.node',
  'template.db',
];

exports.default = async function afterPack(context) {
  const source = path.join(context.packager.projectDir, 'desktop-build');
  const resources = path.join(context.appOutDir, 'resources');

  if (!fs.existsSync(source)) {
    throw new Error('No existe desktop-build/. Corré "npm run desktop:prepare" antes de electron-builder.');
  }

  fs.rmSync(path.join(resources, 'server'), { recursive: true, force: true });
  fs.cpSync(path.join(source, 'server'), path.join(resources, 'server'), { recursive: true });
  fs.copyFileSync(path.join(source, 'template.db'), path.join(resources, 'template.db'));

  const missing = REQUIRED.filter((p) => !fs.existsSync(path.join(resources, p)));
  if (missing.length) {
    throw new Error(`Faltan archivos en ${resources}:\n  ${missing.join('\n  ')}`);
  }
  console.log('  • afterPack: servidor y template.db copiados y verificados');
};
