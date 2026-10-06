import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loginAs, logout, resetCookies } from './helpers/session';

const prismaMock = vi.hoisted(() => ({
  pedido: { update: vi.fn(), count: vi.fn() },
  mesa: { update: vi.fn() },
  venta: { create: vi.fn() },
  historialPedido: { create: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ default: prismaMock }));
vi.mock('@/lib/events', () => ({ default: { emit: vi.fn() } }));
vi.mock('next/headers', async () => (await import('./helpers/session')).nextHeadersMock());

import { PATCH } from '@/app/api/pedidos/route';

const patch = (body: unknown) =>
  PATCH(
    new Request('http://localhost/api/pedidos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );

beforeEach(async () => {
  vi.clearAllMocks();
  resetCookies();
  await loginAs('COCINERO', 3);
  prismaMock.pedido.update.mockResolvedValue({
    id: 1,
    mesaId: 10,
    total: 3000,
    mesa: { numero: 5 },
    items: [{ id: 1 }],
  });
  prismaMock.pedido.count.mockResolvedValue(0);
});

describe('PATCH /api/pedidos — no duplica ventas', () => {
  it('marcar "entregado" NO crea una Venta (el cobro es solo en /api/checkout/pay)', async () => {
    const res = await patch({ id: 1, estado: 'entregado' });

    expect(res.status).toBe(200);
    expect(prismaMock.venta.create).not.toHaveBeenCalled();
  });

  it('"entregado" sigue liberando la mesa cuando no hay pedidos activos (comportamiento previo)', async () => {
    await patch({ id: 1, estado: 'entregado' });

    expect(prismaMock.mesa.update).toHaveBeenCalledWith({ where: { id: 10 }, data: { estado: 'libre' } });
  });

  it('rechaza "pagado" por esta vía con 400 y no toca la base', async () => {
    const res = await patch({ id: 1, estado: 'pagado' });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('/api/checkout/pay');
    expect(prismaMock.pedido.update).not.toHaveBeenCalled();
    expect(prismaMock.venta.create).not.toHaveBeenCalled();
  });

  it('"preparando" sigue funcionando y registra historial', async () => {
    const res = await patch({ id: 1, estado: 'preparando' });

    expect(res.status).toBe(200);
    expect(prismaMock.historialPedido.create).toHaveBeenCalled();
    expect(prismaMock.venta.create).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/pedidos — autenticación y roles', () => {
  it('401 sin sesión y no toca la base', async () => {
    logout();
    const res = await patch({ id: 1, estado: 'preparando' });

    expect(res.status).toBe(401);
    expect(prismaMock.pedido.update).not.toHaveBeenCalled();
  });

  it('403 para MOZO (la cocina cambia los estados)', async () => {
    await loginAs('MOZO', 3);
    const res = await patch({ id: 1, estado: 'preparando' });

    expect(res.status).toBe(403);
    expect(prismaMock.pedido.update).not.toHaveBeenCalled();
  });

  it('registra el usuario de la sesión en el historial', async () => {
    await patch({ id: 1, estado: 'preparando' });

    expect(prismaMock.historialPedido.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ usuarioId: 3 }) })
    );
  });
});
