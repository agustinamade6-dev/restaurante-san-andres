// Proceso principal de Electron.
//
// Arquitectura:
//   resources/server/      -> servidor Next.js standalone (fuera de app.asar, en disco normal)
//   resources/template.db  -> base vacía con el esquema
//   %APPDATA%/<app>/       -> pos.db (datos reales), uploads/, backups/, logs/, config.json
//
// El servidor corre en un utilityProcess (el Node que trae Electron), así el
// cliente no necesita Node.js instalado. La ventana carga http://127.0.0.1:<puerto>.

const { app, BrowserWindow, Menu, dialog, shell, utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');

const DEFAULT_CONFIG = {
  port: 3000,
  // true = acepta conexiones de tablets/comanderas en la red local (http://IP-de-esta-PC:3000).
  // Windows mostrará el aviso del firewall la primera vez.
  lan: false,
};
const BACKUPS_TO_KEEP = 15;

let mainWindow = null;
let serverProcess = null;
let quitting = false;

// ─── Rutas ───────────────────────────────────────────────────────

// Empaquetado: resources/. Sin empaquetar (npm run desktop:test): desktop-build/.
const resourcesDir = app.isPackaged
  ? process.resourcesPath
  : path.join(__dirname, '..', 'desktop-build');

const dataDir = app.getPath('userData');
const logsDir = path.join(dataDir, 'logs');
const dbPath = path.join(dataDir, 'pos.db');
const uploadsDir = path.join(dataDir, 'uploads');

fs.mkdirSync(logsDir, { recursive: true });

// Secreto para firmar las sesiones. Se genera una vez por instalación y se conserva en la carpeta
// de datos del usuario (nunca viaja en el repositorio). Sin él, el servidor no emite sesiones.
function getSessionSecret() {
  const file = path.join(dataDir, 'session.key');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch {
    /* no existe todavía: se crea abajo */
  }
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

const logStream = fs.createWriteStream(path.join(logsDir, 'main.log'), { flags: 'a' });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  logStream.write(line);
  process.stdout.write(line);
}

function fatal(title, err) {
  const detail = (err && err.stack) || String(err);
  log(`FATAL ${title}: ${detail}`);
  dialog.showErrorBox(
    title,
    `${detail}\n\nRegistro completo en:\n${logsDir}`,
  );
  quitting = true;
  app.quit();
}

function loadConfig() {
  const file = path.join(dataDir, 'config.json');
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    fs.writeFileSync(file, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return { ...DEFAULT_CONFIG };
  }
}

// ─── Base de datos ───────────────────────────────────────────────

function prepareDatabase() {
  if (!fs.existsSync(dbPath)) {
    const template = path.join(resourcesDir, 'template.db');
    if (!fs.existsSync(template)) throw new Error(`No se encontró la base plantilla: ${template}`);
    fs.copyFileSync(template, dbPath);
    log(`[DB] Base nueva creada desde plantilla: ${dbPath}`);
    return;
  }

  // Copia de seguridad en cada arranque (se conservan las últimas BACKUPS_TO_KEEP).
  const backupsDir = path.join(dataDir, 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(dbPath, path.join(backupsDir, `pos-${stamp}.db`));
  const old = fs.readdirSync(backupsDir).filter((f) => f.endsWith('.db')).sort().reverse();
  for (const f of old.slice(BACKUPS_TO_KEEP)) fs.rmSync(path.join(backupsDir, f));
  log(`[DB] Usando ${dbPath} (backup creado)`);
}

// ─── Servidor Next.js ────────────────────────────────────────────

function startServer(config) {
  const serverDir = path.join(resourcesDir, 'server');
  const serverJs = path.join(serverDir, 'server.js');
  if (!fs.existsSync(serverJs)) throw new Error(`No se encontró el servidor: ${serverJs}`);

  fs.mkdirSync(uploadsDir, { recursive: true });
  const serverLog = fs.createWriteStream(path.join(logsDir, 'server.log'), { flags: 'a' });

  serverProcess = utilityProcess.fork(serverJs, [], {
    cwd: serverDir,
    stdio: 'pipe',
    serviceName: 'San Andres POS Server',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(config.port),
      HOSTNAME: config.lan ? '0.0.0.0' : '127.0.0.1',
      DATABASE_URL: `file:${dbPath.replace(/\\/g, '/')}`,
      UPLOADS_DIR: uploadsDir,
      SESSION_SECRET: getSessionSecret(),
      NEXT_TELEMETRY_DISABLED: '1',
    },
  });

  serverProcess.stdout.pipe(serverLog);
  serverProcess.stderr.pipe(serverLog);

  serverProcess.on('exit', (code) => {
    serverProcess = null;
    log(`[Server] terminó con código ${code}`);
    if (!quitting) {
      fatal(
        'El servidor del POS se detuvo',
        `Código de salida: ${code}. Revisá server.log (¿el puerto ${config.port} está ocupado por otro programa?).`,
      );
    }
  });
}

function waitForServer(url, timeoutMs = 60000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (!serverProcess) return reject(new Error('El servidor se cerró durante el arranque.'));
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.setTimeout(2000, () => req.destroy());
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) reject(new Error(`El servidor no respondió en ${timeoutMs / 1000}s.`));
        else setTimeout(attempt, 300);
      });
    };
    attempt();
  });
}

// ─── Ventana ─────────────────────────────────────────────────────

const SPLASH = `data:text/html;charset=utf-8,${encodeURIComponent(`
  <body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
               background:#09090b;color:#e4e4e7;font-family:Segoe UI,sans-serif">
    <div style="text-align:center"><h1 style="font-weight:600">Restaurante San Andrés</h1>
    <p style="color:#a1a1aa">Iniciando sistema…</p></div>
  </body>`)}`;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (app.isPackaged) Menu.setApplicationMenu(null);

  // Links externos (target=_blank) se abren en el navegador, no en una ventana vacía.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log(`[Window] did-fail-load ${code} ${desc} ${url}`);
  });
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log(`[Window] render-process-gone ${JSON.stringify(details)}`);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL(SPLASH);
}

// ─── Ciclo de vida ───────────────────────────────────────────────

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    log(`--- Inicio v${app.getVersion()} | packaged=${app.isPackaged} | resources=${resourcesDir}`);
    createWindow();

    // npm run dev:electron -> usa el `next dev` que ya está corriendo.
    if (!app.isPackaged && process.argv.includes('--dev')) {
      mainWindow.loadURL('http://localhost:3000');
      return;
    }

    try {
      const config = loadConfig();
      prepareDatabase();
      startServer(config);
      const url = `http://127.0.0.1:${config.port}`;
      await waitForServer(url);
      log(`[Server] listo en ${url}`);
      if (mainWindow) await mainWindow.loadURL(url);
    } catch (err) {
      fatal('No se pudo iniciar el POS', err);
    }
  });

  app.on('window-all-closed', () => app.quit());

  app.on('before-quit', () => {
    quitting = true;
    if (serverProcess) serverProcess.kill();
  });

  process.on('uncaughtException', (err) => fatal('Error inesperado', err));
}
