// Prueba de tiempo real (SSE) con dos ventanas en /comandas, usando Electron como navegador (ventanas ocultas).
// La ventana A abre un pedido, lo cobra y cambia el estado de una mesa; la ventana B tiene que
// actualizarse sola, sin recargar.
//
// Uso:
//   npm run test:sse                                   -> levanta desktop-build/server con una base temporal
//                                                        (requiere `npm run build && npm run desktop:prepare`)
//   npx electron scripts/test-sse-comandas.js http://127.0.0.1:3000
//                                                      -> prueba contra una app ya corriendo (p. ej. el .exe instalado).
//                                                         OJO: escribe un pedido y una venta en la base de esa app.
const { app, BrowserWindow, session } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EXTERNAL = process.argv.find((a) => /^https?:\/\//.test(a)) || null;
const repo = path.resolve(__dirname, '..');
const work = path.join(os.tmpdir(), 'san-andres-test-sse');
let db;
if (!EXTERNAL) {
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(path.join(work, 'uploads'), { recursive: true });
  db = path.join(work, 'pos.db');
  fs.copyFileSync(path.join(repo, 'desktop-build', 'template.db'), db);
}

const PORT = 3198;
const BASE = EXTERNAL || `http://127.0.0.1:${PORT}`;
const serverDir = path.join(repo, 'desktop-build', 'server');
let srv;
let srvLog = '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

async function api(method, url, body) {
  const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${url} -> ${r.status} ${JSON.stringify(j)}`);
  return j;
}

async function counters(win) {
  return win.webContents.executeJavaScript(`(() => {
    const t = document.body.innerText;
    const l = t.match(/(\\d+)\\s*Libres/i), o = t.match(/(\\d+)\\s*Ocupadas/i);
    return { libres: l ? +l[1] : null, ocupadas: o ? +o[1] : null, marker: window.__noReload === true };
  })()`);
}

async function waitFor(win, pred, ms = 6000) {
  const t0 = Date.now();
  let c;
  while (Date.now() - t0 < ms) {
    c = await counters(win);
    if (pred(c)) return { ok: true, c, ms: Date.now() - t0 };
    await sleep(150);
  }
  return { ok: false, c, ms };
}

async function main() {
  if (!EXTERNAL) {
    srv = spawn(process.execPath, [path.join(serverDir, 'server.js')], {
      cwd: serverDir,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_ENV: 'production', PORT: String(PORT), HOSTNAME: '127.0.0.1',
        DATABASE_URL: `file:${db.replace(/\\/g, '/')}`, UPLOADS_DIR: path.join(work, 'uploads'), NEXT_TELEMETRY_DISABLED: '1' },
    });
    srv.stdout.on('data', (d) => (srvLog += d));
    srv.stderr.on('data', (d) => (srvLog += d));
  }
  for (let i = 0; ; i++) {
    try { await fetch(`${BASE}/api/mesas`); break; } catch { if (i > 120) throw new Error('server no arrancó'); await sleep(500); }
  }

  await session.defaultSession.cookies.set({ url: BASE, name: 'session', value: JSON.stringify({ id: 1, nombre: 'Test', rol: 'ADMIN' }) });

  const mesas = await api('GET', '/api/mesas');
  const mesa = mesas.find((m) => m.estado === 'libre');
  if (!mesa) throw new Error('no hay mesas libres para probar');

  const A = new BrowserWindow({ show: false, width: 1280, height: 800 });
  const B = new BrowserWindow({ show: false, width: 1280, height: 800 });
  await Promise.all([A.loadURL(`${BASE}/comandas`), B.loadURL(`${BASE}/comandas`)]);
  // Esperar a que carguen las mesas (los contadores arrancan en 0 antes del primer fetch)
  const ready = await waitFor(B, (c) => c.libres !== null && c.libres + c.ocupadas > 0, 15000);
  if (!ready.ok) {
    const txt = await B.webContents.executeJavaScript('location.href + "\\n" + document.body.innerText.slice(0, 800)');
    throw new Error('la ventana B no mostró los contadores:\n' + txt);
  }
  await sleep(1500); // dar tiempo a que se conecte el EventSource
  await B.webContents.executeJavaScript('window.__noReload = true');
  const base = ready.c.ocupadas;
  check('Estado inicial en B', base !== null, JSON.stringify(ready.c));

  // 1) Ventana A abre un pedido -> B debería ver la mesa ocupada (evento pedido:nuevo, ya existía)
  const pedido = await A.webContents.executeJavaScript(`fetch('/api/pedidos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mesaId: ${mesa.id}, items: [] }) }).then(r => r.json())`);
  let r = await waitFor(B, (c) => c.ocupadas === base + 1);
  check('A abre pedido → B ve 1 ocupada sin recargar', r.ok && r.c.marker, `${JSON.stringify(r.c)} en ${r.ms}ms`);

  // 2) Ventana A cobra -> B debería ver la mesa libre (evento nuevo del cobro)
  const pay = await A.webContents.executeJavaScript(`fetch('/api/checkout/pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pedidoId: ${pedido.id}, mesaId: ${mesa.id}, metodoPago: 'efectivo' }) }).then(r => r.json())`);
  if (!pay.success) throw new Error('cobro falló: ' + JSON.stringify(pay));
  r = await waitFor(B, (c) => c.ocupadas === base);
  check('A cobra → B ve la mesa libre sin recargar', r.ok && r.c.marker, `${JSON.stringify(r.c)} en ${r.ms}ms`);

  // 3) Ventana A cambia estado de mesa (PATCH /api/mesas) -> B se actualiza
  await A.webContents.executeJavaScript(`fetch('/api/mesas', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: ${mesa.id}, estado: 'ocupada' }) }).then(r => r.json())`);
  r = await waitFor(B, (c) => c.ocupadas === base + 1);
  check('A cambia estado de mesa → B se actualiza sin recargar', r.ok && r.c.marker, `${JSON.stringify(r.c)} en ${r.ms}ms`);
}

app.whenReady().then(async () => {
  let failed = false;
  try { await main(); } catch (e) { failed = true; console.log('ERROR', e.message); }
  if (srv) srv.kill();
  if (!EXTERNAL) {
    await sleep(500); // en Windows el server puede tardar en soltar pos.db
    try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
  }
  const ok = !failed && results.length > 0 && results.every(Boolean);
  console.log(ok ? '\nRESULTADO: OK' : '\nRESULTADO: FALLÓ');
  if (!ok) console.log('--- server log ---\n' + srvLog.slice(-2000));
  app.exit(ok ? 0 : 1);
});
