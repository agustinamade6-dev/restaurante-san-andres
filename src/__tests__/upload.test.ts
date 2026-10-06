/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loginAs, logout, resetCookies } from './helpers/session';
import { detectarImagen, MAX_IMAGEN_BYTES } from '@/lib/imagen';

const dir = vi.hoisted(() => ({ path: '' }));
vi.mock('@/lib/uploads', () => ({ getUploadsDir: () => dir.path }));
vi.mock('next/headers', async () => (await import('./helpers/session')).nextHeadersMock());

import { POST } from '@/app/api/upload/route';
import { GET as SERVIR } from '@/app/uploads/[...path]/route';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 2)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(20, 3)]);

const subir = (contenido?: Buffer | string, nombre = 'foto.png', headers: Record<string, string> = {}) => {
  const fd = new FormData();
  if (contenido !== undefined) {
    fd.append('file', typeof contenido === 'string' && nombre === '' ? contenido : new File([contenido as any], nombre));
  }
  return POST(new Request('http://localhost/api/upload', { method: 'POST', body: fd, headers }) as any);
};
const archivos = () => (existsSync(join(dir.path, 'products')) ? readdirSync(join(dir.path, 'products')) : []);

beforeEach(async () => {
  dir.path = mkdtempSync(join(tmpdir(), 'uploads-'));
  resetCookies();
  await loginAs('ADMIN', 1);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  rmSync(dir.path, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('lib/imagen — detectar formato por contenido', () => {
  it('reconoce PNG, JPEG y WebP', () => {
    expect(detectarImagen(PNG)).toEqual({ ext: 'png', mime: 'image/png' });
    expect(detectarImagen(JPG)).toEqual({ ext: 'jpg', mime: 'image/jpeg' });
    expect(detectarImagen(WEBP)).toEqual({ ext: 'webp', mime: 'image/webp' });
  });

  it.each([
    ['HTML', Buffer.from('<html><script>alert(1)</script></html>')],
    ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')],
    ['ejecutable de Windows', Buffer.from('MZ\x90\x00\x03')],
    ['texto', Buffer.from('hola mundo')],
    ['vacío', Buffer.alloc(0)],
    ['RIFF que no es WebP (WAV)', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')])],
    ['PNG truncado', PNG.subarray(0, 5)],
  ])('rechaza %s', (_n, buf) => {
    expect(detectarImagen(buf as Buffer)).toBeNull();
  });
});

describe('POST /api/upload', () => {
  it.each([
    ['png', PNG],
    ['jpg', JPG],
    ['webp', WEBP],
  ])('guarda un %s válido y devuelve la URL pública', async (ext, bytes) => {
    const res = await subir(bytes, `foto.${ext}`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.url).toMatch(new RegExp(`^/uploads/products/prod-\\d+-[0-9a-f]{8}\\.${ext}$`));
    expect(readFileSync(join(dir.path, 'products', data.url.split('/').pop())).equals(bytes)).toBe(true);
  });

  it('la extensión se decide por el CONTENIDO: un PNG llamado .jpg se guarda como .png', async () => {
    const data = await (await subir(PNG, 'engano.jpg')).json();
    expect(data.url).toMatch(/\.png$/);
  });

  it.each([
    ['HTML con extensión .png', Buffer.from('<html><script>alert(1)</script></html>'), 'x.png'],
    ['SVG con extensión .png', Buffer.from('<svg><script/></svg>'), 'x.png'],
    ['ejecutable con extensión .jpg', Buffer.from('MZ\x90\x00'), 'x.jpg'],
    ['texto con extensión .webp', Buffer.from('hola'), 'x.webp'],
  ])('400 y no guarda nada: %s', async (_n, bytes, nombre) => {
    const res = await subir(bytes, nombre);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('Formato no permitido');
    expect(archivos()).toHaveLength(0);
  });

  it('413 si supera 5 MB aunque tenga cabecera de imagen válida, y no guarda nada', async () => {
    const grande = Buffer.concat([PNG, Buffer.alloc(MAX_IMAGEN_BYTES)]);

    const res = await subir(grande);

    expect(res.status).toBe(413);
    expect(archivos()).toHaveLength(0);
  });

  it('413 de inmediato si el Content-Length declarado es enorme', async () => {
    const res = await subir(PNG, 'x.png', { 'content-length': String(50 * 1024 * 1024) });
    expect(res.status).toBe(413);
  });

  it('400 si el archivo está vacío, si el campo es texto o si falta', async () => {
    expect((await subir(Buffer.alloc(0))).status).toBe(400);
    expect((await subir('soy un texto', '')).status).toBe(400);
    expect((await subir()).status).toBe(400);
  });

  it('400 (y no 500) si la petición no es un formulario válido', async () => {
    const res = await POST(
      new Request('http://localhost/api/upload', { method: 'POST', body: 'no soy multipart', headers: { 'content-type': 'text/plain' } }) as any
    );
    expect(res.status).toBe(400);
  });

  it('dos subidas en el mismo milisegundo no se pisan', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    const a = (await (await subir(PNG)).json()).url;
    const b = (await (await subir(JPG, 'otra.jpg')).json()).url;

    expect(a).not.toBe(b);
    expect(archivos()).toHaveLength(2);
  });

  it('401 sin sesión; 403 para MOZO y COCINERO; no se guarda nada', async () => {
    logout();
    expect((await subir(PNG)).status).toBe(401);
    for (const rol of ['MOZO', 'COCINERO']) {
      await loginAs(rol, 3);
      expect((await subir(PNG)).status).toBe(403);
    }
    expect(archivos()).toHaveLength(0);
  });
});

describe('GET /uploads/[...path] — servir imágenes', () => {
  const servir = (...path: string[]) => SERVIR(new Request('http://localhost/uploads/' + path.join('/')) as any, { params: Promise.resolve({ path }) });

  beforeEach(() => {
    mkdirSync(join(dir.path, 'products'), { recursive: true });
    writeFileSync(join(dir.path, 'products', 'a.png'), PNG);
    writeFileSync(join(dir.path, 'products', 'b.svg'), '<svg/>');
    writeFileSync(join(dir.path, 'products', 'c.html'), '<html/>');
  });

  it('sirve la imagen con su tipo y la cabecera nosniff', async () => {
    const res = await servir('products', 'a.png');

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it.each([['products', 'b.svg'], ['products', 'c.html'], ['products', 'no-existe.png']])('404 para %s/%s', async (...ruta) => {
    expect((await servir(...ruta)).status).toBe(404);
  });

  it('404 ante path traversal, incluida la carpeta "hermana" con el mismo prefijo', async () => {
    writeFileSync(join(dir.path, '..', 'secreto.png'), PNG);
    const hermano = dir.path + '-evil';
    mkdirSync(hermano, { recursive: true });
    writeFileSync(join(hermano, 'x.png'), PNG);
    const nombreHermano = hermano.split(/[\\/]/).pop()!;

    expect((await servir('..', 'secreto.png')).status).toBe(404);
    expect((await servir('..', nombreHermano, 'x.png')).status).toBe(404);

    rmSync(hermano, { recursive: true, force: true });
    rmSync(join(dir.path, '..', 'secreto.png'), { force: true });
  });
});
