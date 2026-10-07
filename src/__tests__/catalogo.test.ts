/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from './helpers/fakeDb';
import { loginAs, logout, resetCookies } from './helpers/session';

let db: ReturnType<typeof createFakeDb>;
vi.mock('@/lib/prisma', () => ({
  default: new Proxy({}, { get: (_t, prop) => (db.prisma as any)[prop] }),
}));
vi.mock('next/headers', async () => (await import('./helpers/session')).nextHeadersMock());

import * as PRODUCTOS from '@/app/api/productos/route';
import * as CATEGORIAS from '@/app/api/categorias/route';
import * as COSTOS from '@/app/api/costos/route';
import * as PROVEEDORES from '@/app/api/proveedores/route';
import * as INVENTARIO from '@/app/api/inventario/route';

const pedir = (method: string, body?: unknown, query = '') =>
  new Request('http://localhost/api/x' + query, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });

beforeEach(async () => {
  db = createFakeDb({
    categorias: [
      { id: 1, nombre: 'Comidas', orden: 1 },
      { id: 2, nombre: 'Bebidas', orden: 2 },
    ],
    productos: [
      { id: 10, nombre: 'Milanesa', descripcion: 'x', precio: 720000, categoriaId: 1, disponible: true, imagen: '' },
      { id: 11, nombre: 'Gaseosa', descripcion: '', precio: 180000, categoriaId: 2, disponible: true, imagen: '' },
    ],
    items: [{ id: 1, pedidoId: 1, productoId: 11, cantidad: 1, precio: 180000 }],
    costos: [{ id: 5, concepto: 'Alquiler', monto: 50000000, tipo: 'fijo', periodicidad: 'mensual' }],
    proveedores: [{ id: 3, nombre: 'Distribuidora Sur', contacto: '', telefono: '', email: '', direccion: '', notas: '' }],
    insumos: [{ id: 7, nombre: 'Harina', unidad: 'kg', stockActual: 10, stockMinimo: 5, precioUnitario: 90000, proveedorId: 3 }],
  });
  resetCookies();
  await loginAs('ADMIN', 1);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/* ──────────────────────────── PRODUCTOS ──────────────────────────── */

describe('POST /api/productos', () => {
  const formulario = { nombre: 'Flan', descripcion: 'Con dulce de leche', precio: 3200, categoriaId: 1, disponible: true, imagen: '' };

  it('crea un producto con el payload exacto del formulario y responde 201 con la categoría', async () => {
    const res = await PRODUCTOS.POST(pedir('POST', formulario));
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data).toMatchObject({ nombre: 'Flan', precio: 3200, categoriaId: 1, disponible: true });
    expect(data.categoria.nombre).toBe('Comidas');
  });

  it('recorta espacios del nombre y aplica valores por defecto', async () => {
    const data = await (await PRODUCTOS.POST(pedir('POST', { nombre: '  Flan  ', precio: 10, categoriaId: 2 }))).json();
    expect(data).toMatchObject({ nombre: 'Flan', descripcion: '', imagen: '', disponible: true });
  });

  it('REGRESIÓN: acepta el producto nuevo tal como lo arma "Nuevo Producto" (imagen por defecto = 🍽️)', async () => {
    const res = await PRODUCTOS.POST(
      pedir('POST', { nombre: 'Ensalada Mixta', descripcion: '', precio: 5000, categoriaId: 1, disponible: true, imagen: '🍽️' })
    );

    expect(res.status).toBe(201);
    expect((await res.json()).imagen).toBe('🍽️');
  });

  it.each([
    ['ruta propia', '/uploads/products/prod-1-ab12cd34.png'],
    ['emoji de reemplazo', '🍽️'],
    ['otro emoji', '🥗'],
    ['URL https', 'https://images.unsplash.com/photo-1?w=400'],
    ['URL http', 'http://ejemplo.com/a.jpg'],
    ['vacía', ''],
  ])('acepta una imagen: %s', async (_n, imagen) => {
    expect((await PRODUCTOS.POST(pedir('POST', { ...formulario, imagen }))).status).toBe(201);
  });

  it.each([
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:text/html;base64,PHNjcmlwdD4='],
    ['protocolo relativo (//host)', '//evil.com/x.png'],
    ['sin esquema ni ruta', 'foto.png'],
    ['letras mezcladas con emoji', 'a🍽️'],
    ['emoji con una barra', '🍽️/x'],
    ['demasiados emojis', '🍽️'.repeat(8)],
    ['demasiado larga', 'https://x.com/' + 'a'.repeat(600)],
  ])('rechaza una imagen: %s', async (_n, imagen) => {
    expect((await PRODUCTOS.POST(pedir('POST', { ...formulario, imagen }))).status).toBe(400);
    expect(db.state.productos).toHaveLength(2);
  });

  it.each([
    ['nombre vacío', { nombre: '' }],
    ['nombre solo espacios', { nombre: '   ' }],
    ['nombre demasiado largo', { nombre: 'x'.repeat(101) }],
    ['precio 0 (lo que envía el formulario sin completar)', { precio: 0 }],
    ['precio negativo', { precio: -5 }],
    ['precio no numérico', { precio: 'abc' }],
    ['precio absurdo', { precio: 1e12 }],
    ['categoría 0 (valor inicial del formulario)', { categoriaId: 0 }],
    ['categoría NaN (llega como null)', { categoriaId: null }],
    ['disponible no booleano', { disponible: 'si' }],
    ['descripción demasiado larga', { descripcion: 'x'.repeat(501) }],
  ])('400 y no crea nada: %s', async (_n, cambio) => {
    expect((await PRODUCTOS.POST(pedir('POST', { ...formulario, ...cambio }))).status).toBe(400);
    expect(db.state.productos).toHaveLength(2);
  });

  it('400 si la categoría no existe (antes era un 500 por la clave foránea)', async () => {
    const res = await PRODUCTOS.POST(pedir('POST', { ...formulario, categoriaId: 99 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('La categoría no existe');
  });

  it('400 con JSON roto; 401 sin sesión; 403 para MOZO y COCINERO', async () => {
    expect((await PRODUCTOS.POST(pedir('POST', '{roto'))).status).toBe(400);
    logout();
    expect((await PRODUCTOS.POST(pedir('POST', formulario))).status).toBe(401);
    for (const rol of ['MOZO', 'COCINERO']) {
      await loginAs(rol, 3);
      expect((await PRODUCTOS.POST(pedir('POST', formulario))).status).toBe(403);
    }
    expect(db.state.productos).toHaveLength(2);
  });
});

describe('PUT /api/productos', () => {
  it('actualiza con el objeto completo que envía el formulario', async () => {
    const res = await PRODUCTOS.PUT(
      pedir('PUT', { id: 10, nombre: 'Milanesa XL', descripcion: 'x', precio: 8000, categoriaId: 1, disponible: false, imagen: '/uploads/a.png' })
    );

    expect(res.status).toBe(200);
    expect(db.state.productos[0]).toMatchObject({ nombre: 'Milanesa XL', precio: 800000, disponible: false });
  });

  it('REGRESIÓN: edita un producto que tiene el emoji como imagen sin rechazarlo', async () => {
    db.state.productos[0].imagen = '🍽️';
    const res = await PRODUCTOS.PUT(pedir('PUT', { id: 10, nombre: 'Milanesa', descripcion: 'x', precio: 7500, categoriaId: 1, disponible: true, imagen: '🍽️' }));

    expect(res.status).toBe(200);
    expect(db.state.productos[0]).toMatchObject({ precio: 750000, imagen: '🍽️' });
  });

  it('actualiza solo los campos presentes (parcial)', async () => {
    await PRODUCTOS.PUT(pedir('PUT', { id: 10, precio: 9000 }));
    expect(db.state.productos[0]).toMatchObject({ nombre: 'Milanesa', precio: 900000, categoriaId: 1 });
  });

  it('404 si el producto no existe; 400 si falta el id', async () => {
    expect((await PRODUCTOS.PUT(pedir('PUT', { id: 999, precio: 1 }))).status).toBe(404);
    expect((await PRODUCTOS.PUT(pedir('PUT', { precio: 1 }))).status).toBe(400);
  });

  it.each([
    ['precio 0', { precio: 0 }],
    ['precio negativo', { precio: -1 }],
    ['nombre vacío', { nombre: '' }],
    ['imagen peligrosa', { imagen: 'javascript:alert(1)' }],
    ['categoría inexistente', { categoriaId: 99 }],
  ])('400 y no modifica nada: %s', async (_n, cambio) => {
    expect((await PRODUCTOS.PUT(pedir('PUT', { id: 10, ...cambio }))).status).toBe(400);
    expect(db.state.productos[0]).toMatchObject({ nombre: 'Milanesa', precio: 720000, categoriaId: 1 });
  });

  it('403 para MOZO', async () => {
    await loginAs('MOZO', 3);
    expect((await PRODUCTOS.PUT(pedir('PUT', { id: 10, precio: 1 }))).status).toBe(403);
    expect(db.state.productos[0].precio).toBe(720000);
  });
});

describe('DELETE /api/productos', () => {
  it('elimina un producto sin pedidos', async () => {
    const res = await PRODUCTOS.DELETE(pedir('DELETE', undefined, '?id=10'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(db.state.productos.map((p) => p.id)).toEqual([11]);
  });

  it('REGRESIÓN: no elimina un producto con pedidos registrados y sugiere marcarlo no disponible (antes: 500)', async () => {
    const res = await PRODUCTOS.DELETE(pedir('DELETE', undefined, '?id=11'));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('no disponible');
    expect(db.state.productos.map((p) => p.id)).toContain(11);
  });

  it('404 si no existe; 400 si falta o es inválido el id', async () => {
    expect((await PRODUCTOS.DELETE(pedir('DELETE', undefined, '?id=999'))).status).toBe(404);
    const sinId = await PRODUCTOS.DELETE(pedir('DELETE'));
    expect(sinId.status).toBe(400);
    expect((await sinId.json()).error).toBe('ID requerido');
    expect((await PRODUCTOS.DELETE(pedir('DELETE', undefined, '?id=abc'))).status).toBe(400);
    expect((await PRODUCTOS.DELETE(pedir('DELETE', undefined, '?id=-1'))).status).toBe(400);
  });

  it('403 para MOZO', async () => {
    await loginAs('MOZO', 3);
    expect((await PRODUCTOS.DELETE(pedir('DELETE', undefined, '?id=10'))).status).toBe(403);
    expect(db.state.productos).toHaveLength(2);
  });
});

describe('GET /api/productos y /api/categorias', () => {
  it('lista productos con su categoría, para cualquier rol con sesión', async () => {
    for (const rol of ['ADMIN', 'MOZO', 'COCINERO']) {
      await loginAs(rol, 1);
      const res = await PRODUCTOS.GET(pedir('GET'));
      expect(res.status).toBe(200);
      expect((await res.json())[0].categoria).toBeDefined();
    }
  });

  it('filtra por categoría y por texto', async () => {
    expect((await (await PRODUCTOS.GET(pedir('GET', undefined, '?categoriaId=2'))).json()).map((p: any) => p.id)).toEqual([11]);
    expect((await (await PRODUCTOS.GET(pedir('GET', undefined, '?q=mila'))).json()).map((p: any) => p.id)).toEqual([10]);
  });

  it('400 con un categoriaId inválido (antes era un 500) o una búsqueda enorme', async () => {
    expect((await PRODUCTOS.GET(pedir('GET', undefined, '?categoriaId=abc'))).status).toBe(400);
    expect((await PRODUCTOS.GET(pedir('GET', undefined, '?q=' + 'a'.repeat(101)))).status).toBe(400);
  });

  it('401 sin sesión', async () => {
    logout();
    expect((await PRODUCTOS.GET(pedir('GET'))).status).toBe(401);
    expect((await CATEGORIAS.GET()).status).toBe(401);
  });
});

/* ──────────────────────────── COSTOS ──────────────────────────── */

describe('/api/costos', () => {
  const formulario = { concepto: 'Gas', monto: 12000, tipo: 'variable', periodicidad: 'semanal' };

  it('crea un costo (201) con el payload del formulario', async () => {
    const res = await COSTOS.POST(pedir('POST', formulario));

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject(formulario);
  });

  it('usa "fijo" y "mensual" cuando tipo y periodicidad vienen vacíos', async () => {
    const data = await (await COSTOS.POST(pedir('POST', { concepto: 'Luz', monto: 100, tipo: '', periodicidad: '' }))).json();
    expect(data).toMatchObject({ tipo: 'fijo', periodicidad: 'mensual' });
  });

  it.each([
    ['concepto vacío', { concepto: '' }],
    ['monto 0 (lo que envía el formulario sin completar)', { monto: 0 }],
    ['monto negativo', { monto: -10 }],
    ['monto no numérico', { monto: 'x' }],
    ['tipo inventado', { tipo: 'raro' }],
    ['periodicidad inventada', { periodicidad: 'anual' }],
  ])('400 y no crea nada: %s', async (_n, cambio) => {
    expect((await COSTOS.POST(pedir('POST', { ...formulario, ...cambio }))).status).toBe(400);
    expect(db.state.costos).toHaveLength(1);
  });

  it('elimina un costo; 404 si no existe; 400 si falta o es inválido el id', async () => {
    expect((await COSTOS.DELETE(pedir('DELETE', undefined, '?id=5'))).status).toBe(200);
    expect(db.state.costos).toHaveLength(0);
    expect((await COSTOS.DELETE(pedir('DELETE', undefined, '?id=5'))).status).toBe(404);
    expect((await COSTOS.DELETE(pedir('DELETE'))).status).toBe(400);
    expect((await COSTOS.DELETE(pedir('DELETE', undefined, '?id=zzz'))).status).toBe(400);
  });

  it('lista; 401 sin sesión; 403 para MOZO', async () => {
    expect((await (await COSTOS.GET()).json())).toHaveLength(1);
    await loginAs('MOZO', 3);
    expect((await COSTOS.GET()).status).toBe(403);
    expect((await COSTOS.POST(pedir('POST', formulario))).status).toBe(403);
    logout();
    expect((await COSTOS.GET()).status).toBe(401);
  });
});

/* ──────────────────────────── PROVEEDORES ──────────────────────────── */

describe('/api/proveedores', () => {
  const formulario = { nombre: 'Verdulería Norte', contacto: 'Ana', telefono: '+54 381 555-0000', email: 'ana@norte.com', direccion: 'Calle 1', notas: '' };

  it('crea un proveedor (201)', async () => {
    const res = await PROVEEDORES.POST(pedir('POST', formulario));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject(formulario);
  });

  it('solo el nombre es obligatorio; el resto queda vacío', async () => {
    const data = await (await PROVEEDORES.POST(pedir('POST', { nombre: 'Solo nombre' }))).json();
    expect(data).toMatchObject({ contacto: '', telefono: '', email: '', direccion: '', notas: '' });
  });

  it('acepta el correo vacío (el formulario lo permite)', async () => {
    expect((await PROVEEDORES.POST(pedir('POST', { ...formulario, email: '' }))).status).toBe(201);
  });

  it.each([
    ['nombre vacío', { nombre: '' }],
    ['correo inválido', { email: 'esto-no-es-un-correo' }],
    ['teléfono demasiado largo', { telefono: '1'.repeat(41) }],
    ['notas demasiado largas', { notas: 'x'.repeat(501) }],
  ])('400 y no crea nada: %s', async (_n, cambio) => {
    expect((await PROVEEDORES.POST(pedir('POST', { ...formulario, ...cambio }))).status).toBe(400);
    expect(db.state.proveedores).toHaveLength(1);
  });

  it('actualiza (parcial y completo); 404 si no existe; 400 si falta el id o hay datos inválidos', async () => {
    expect((await PROVEEDORES.PUT(pedir('PUT', { id: 3, telefono: '123' }))).status).toBe(200);
    expect(db.state.proveedores[0]).toMatchObject({ nombre: 'Distribuidora Sur', telefono: '123' });
    expect((await PROVEEDORES.PUT(pedir('PUT', { id: 3, ...formulario }))).status).toBe(200);
    expect((await PROVEEDORES.PUT(pedir('PUT', { id: 999, nombre: 'x' }))).status).toBe(404);
    expect((await PROVEEDORES.PUT(pedir('PUT', { nombre: 'x' }))).status).toBe(400);
    expect((await PROVEEDORES.PUT(pedir('PUT', { id: 3, email: 'malo' }))).status).toBe(400);
  });

  it('elimina; 404 si no existe; 400 con id inválido', async () => {
    expect((await PROVEEDORES.DELETE(pedir('DELETE', undefined, '?id=3'))).status).toBe(200);
    expect((await PROVEEDORES.DELETE(pedir('DELETE', undefined, '?id=3'))).status).toBe(404);
    expect((await PROVEEDORES.DELETE(pedir('DELETE', undefined, '?id=0'))).status).toBe(400);
    expect((await PROVEEDORES.DELETE(pedir('DELETE'))).status).toBe(400);
  });

  it('403 para COCINERO', async () => {
    await loginAs('COCINERO', 3);
    expect((await PROVEEDORES.POST(pedir('POST', formulario))).status).toBe(403);
    expect((await PROVEEDORES.GET()).status).toBe(403);
  });
});

/* ──────────────────────────── INVENTARIO ──────────────────────────── */

describe('PUT /api/inventario', () => {
  it('acepta el objeto completo que envía la pantalla (con proveedor anidado, fechas y el MISMO stock)', async () => {
    const insumoCompleto = {
      ...db.state.insumos[0],
      precioUnitario: 900,
      proveedor: { id: 3, nombre: 'Distribuidora Sur' },
      createdAt: '2026-10-06T11:12:43.000Z',
      updatedAt: '2026-10-06T11:12:43.000Z',
    };

    const res = await INVENTARIO.PUT(pedir('PUT', { ...insumoCompleto, stockMinimo: 3 }));

    expect(res.status).toBe(200);
    expect(db.state.insumos[0]).toMatchObject({ stockActual: 10, stockMinimo: 3, nombre: 'Harina', unidad: 'kg' });
    expect((await res.json()).proveedor.nombre).toBe('Distribuidora Sur');
  });

  it('REGRESIÓN: un stock distinto por PUT es 400 (pisaba las ventas hechas con la pantalla abierta) y no cambia nada', async () => {
    db.state.insumos[0].stockActual = 8.5; // una venta descontó mientras la pantalla mostraba 10
    const res = await INVENTARIO.PUT(pedir('PUT', { ...db.state.insumos[0], stockActual: 10, stockMinimo: 3 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Ajustar stock/);
    expect(db.state.insumos[0]).toMatchObject({ stockActual: 8.5, stockMinimo: 5 });
  });

  it('permite desvincular el proveedor (null) y cambiar el resto de los campos', async () => {
    expect((await INVENTARIO.PUT(pedir('PUT', { id: 7, proveedorId: null, stockMinimo: 2, precioUnitario: 0, unidad: 'litro' }))).status).toBe(200);
    expect(db.state.insumos[0]).toMatchObject({ stockMinimo: 2, precioUnitario: 0, unidad: 'litro' });
  });

  it.each([
    ['stock negativo', { stockActual: -1 }],
    ['stock no numérico', { stockActual: 'mucho' }],
    ['stock absurdo', { stockActual: 1e12 }],
    ['stock mínimo negativo', { stockMinimo: -3 }],
    ['unidad vacía', { unidad: '' }],
    ['nombre vacío', { nombre: ' ' }],
    ['proveedor con id inválido', { proveedorId: -2 }],
  ])('400 y no modifica nada: %s', async (_n, cambio) => {
    expect((await INVENTARIO.PUT(pedir('PUT', { id: 7, ...cambio }))).status).toBe(400);
    expect(db.state.insumos[0]).toMatchObject({ stockActual: 10, stockMinimo: 5, unidad: 'kg' });
  });

  it('400 si el proveedor no existe; 404 si el insumo no existe; 400 si falta el id', async () => {
    expect((await INVENTARIO.PUT(pedir('PUT', { id: 7, proveedorId: 99 }))).status).toBe(400);
    expect((await INVENTARIO.PUT(pedir('PUT', { id: 999, stockActual: 1 }))).status).toBe(404);
    expect((await INVENTARIO.PUT(pedir('PUT', { stockActual: 1 }))).status).toBe(400);
    expect((await INVENTARIO.PUT(pedir('PUT', '{roto'))).status).toBe(400);
  });

  it('GET lista con proveedor; 403 para MOZO; 401 sin sesión', async () => {
    expect((await (await INVENTARIO.GET()).json())[0].proveedor.nombre).toBe('Distribuidora Sur');
    await loginAs('MOZO', 3);
    expect((await INVENTARIO.GET()).status).toBe(403);
    expect((await INVENTARIO.PUT(pedir('PUT', { id: 7, stockActual: 1 }))).status).toBe(403);
    logout();
    expect((await INVENTARIO.GET()).status).toBe(401);
    expect(db.state.insumos[0].stockActual).toBe(10);
  });
});

describe('DELETE /api/inventario', () => {
  it('elimina un insumo sin recetas ni movimientos', async () => {
    const res = await INVENTARIO.DELETE(pedir('DELETE', undefined, '?id=7'));
    expect(res.status).toBe(200);
    expect(db.state.insumos).toHaveLength(0);
  });

  it('400 si el insumo está en una receta, nombrando los productos, y no lo borra', async () => {
    db.state.recetas.push({ id: 50, productoId: 10, insumoId: 7, cantidad: 0.2 });
    const res = await INVENTARIO.DELETE(pedir('DELETE', undefined, '?id=7'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/receta de: Milanesa/);
    expect(db.state.insumos).toHaveLength(1);
  });

  it('400 si el insumo tiene movimientos de stock, y no lo borra', async () => {
    db.state.movimientos.push({ id: 60, insumoId: 7, cantidad: -0.2, motivo: 'VENTA', ventaId: null, usuarioId: 1 });
    const res = await INVENTARIO.DELETE(pedir('DELETE', undefined, '?id=7'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/movimientos de stock/);
    expect(db.state.insumos).toHaveLength(1);
  });

  it('404 si no existe; 400 sin id o con id inválido', async () => {
    expect((await INVENTARIO.DELETE(pedir('DELETE', undefined, '?id=999'))).status).toBe(404);
    expect((await INVENTARIO.DELETE(pedir('DELETE'))).status).toBe(400);
    expect((await INVENTARIO.DELETE(pedir('DELETE', undefined, '?id=abc'))).status).toBe(400);
    expect(db.state.insumos).toHaveLength(1);
  });

  it('403 para MOZO; 401 sin sesión', async () => {
    await loginAs('MOZO', 3);
    expect((await INVENTARIO.DELETE(pedir('DELETE', undefined, '?id=7'))).status).toBe(403);
    logout();
    expect((await INVENTARIO.DELETE(pedir('DELETE', undefined, '?id=7'))).status).toBe(401);
    expect(db.state.insumos).toHaveLength(1);
  });
});

/* ──────────────────────────── MONTOS EN CENTAVOS (AT-13) ──────────────────────────── */

describe('montos: la API habla en pesos y la base guarda centavos enteros', () => {
  beforeEach(() => loginAs('ADMIN'));

  it('producto: $19,99 se guarda como 1999 y vuelve como 19.99 en POST, PUT y GET', async () => {
    const creado = await (await PRODUCTOS.POST(pedir('POST', { nombre: 'Alfajor', precio: 19.99, categoriaId: 1 }))).json();
    expect(creado.precio).toBe(19.99);
    const fila = db.state.productos.find((p) => p.nombre === 'Alfajor')!;
    expect(fila.precio).toBe(1999);

    const editado = await (await PRODUCTOS.PUT(pedir('PUT', { id: fila.id, precio: 1.005 }))).json();
    expect(fila.precio).toBe(101); // 1,005 redondea a 1,01 (sin el error binario de 1.005 * 100)
    expect(editado.precio).toBe(1.01);

    const lista = await (await PRODUCTOS.GET(pedir('GET'))).json();
    expect(lista.find((p: any) => p.id === 10).precio).toBe(7200);
  });

  it('un precio que redondea a 0 centavos no es válido', async () => {
    const res = await PRODUCTOS.POST(pedir('POST', { nombre: 'Gratis', precio: 0.001, categoriaId: 1 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/precio: debe ser mayor que 0/);
  });

  it('costos e inventario responden en pesos y guardan centavos', async () => {
    const costo = await (await COSTOS.POST(pedir('POST', { concepto: 'Luz', monto: 85000.5 }))).json();
    expect(costo.monto).toBe(85000.5);
    expect(db.state.costos.find((c) => c.concepto === 'Luz')!.monto).toBe(8500050);
    expect((await (await COSTOS.GET()).json()).find((c: any) => c.id === 5).monto).toBe(500000);

    const insumo = await (await INVENTARIO.PUT(pedir('PUT', { id: 7, precioUnitario: 950.25 }))).json();
    expect(insumo.precioUnitario).toBe(950.25);
    expect(db.state.insumos[0].precioUnitario).toBe(95025);
  });
});

describe('rango de montos (Prisma Int de 32 bits: máximo 2.147.483.647 centavos)', () => {
  beforeEach(() => loginAs('ADMIN'));

  it('un precio o costo mayor a $10.000.000 es 400 con mensaje claro (antes, 500 al guardar)', async () => {
    const res = await PRODUCTOS.POST(pedir('POST', { nombre: 'Caro', precio: 50_000_000, categoriaId: 1 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/precio: no puede superar/);
    expect((await COSTOS.POST(pedir('POST', { concepto: 'X', monto: 1e9 }))).status).toBe(400);
    expect((await INVENTARIO.PUT(pedir('PUT', { id: 7, precioUnitario: 2e7 }))).status).toBe(400);
  });

  it('$10.000.000 justo se acepta', async () => {
    expect((await PRODUCTOS.POST(pedir('POST', { nombre: 'Tope', precio: 10_000_000, categoriaId: 1 }))).status).toBe(201);
  });
});
