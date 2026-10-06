/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Base de datos en memoria que imita lo mínimo de Prisma que usan las rutas bajo prueba.
 *
 * LIMITACIÓN (importante): modela SQLite con un único escritor (las transacciones se serializan
 * con un mutex) y rollback completo ante una excepción. NO reemplaza una prueba contra SQLite real:
 * valida la lógica de la ruta, no el comportamiento del motor.
 *
 * Los pedidos del seed pueden traer `items` embebidos (cada uno con `producto: { nombre }` opcional);
 * se normalizan a las tablas `items` y `productos`.
 */
type Row = Record<string, any>;
type Seed = Partial<Record<'pedidos' | 'mesas' | 'usuarios' | 'ventas' | 'historial' | 'productos' | 'items', Row[]>>;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond) return cond.in.includes(value);
      if ('notIn' in cond) return !cond.notIn.includes(value);
      if ('not' in cond) return value !== cond.not;
      if ('startsWith' in cond) return typeof value === 'string' && value.startsWith(cond.startsWith);
    }
    return value === cond;
  });
}

export function createFakeDb(seed: Seed = {}) {
  const state = {
    pedidos: [] as Row[],
    mesas: [...(seed.mesas ?? [])] as Row[],
    usuarios: [...(seed.usuarios ?? [])] as Row[],
    ventas: [...(seed.ventas ?? [])] as Row[],
    historial: [...(seed.historial ?? [])] as Row[],
    productos: [...(seed.productos ?? [])] as Row[],
    items: [...(seed.items ?? [])] as Row[],
  };
  let nextId = 1000;
  const failOn = new Set<string>();

  const addPedido = (p: Row) => {
    const { items = [], ...pedido } = p;
    state.pedidos.push(pedido);
    for (const it of items) {
      const { producto, ...item } = it;
      if (producto && !state.productos.some((x) => x.id === item.productoId)) {
        state.productos.push({ id: item.productoId, disponible: true, precio: item.precio, ...producto });
      }
      state.items.push({ id: nextId++, pedidoId: pedido.id, notas: '', ...item });
    }
  };
  (seed.pedidos ?? []).forEach(addPedido);

  const guard = (name: string) => {
    if (failOn.has(name)) throw new Error(`fallo simulado en ${name}`);
  };

  const itemWithRel = (it: Row, include?: Row) => ({
    ...it,
    ...(include?.producto ? { producto: state.productos.find((p) => p.id === it.productoId) } : {}),
  });

  const withRelations = (p: Row | undefined, include?: Row) => {
    if (!p) return null;
    const out: Row = { ...p };
    if (include?.mesa) out.mesa = state.mesas.find((m) => m.id === p.mesaId);
    if (include?.items) {
      out.items = state.items
        .filter((i) => i.pedidoId === p.id)
        .map((i) => itemWithRel(i, include.items.include));
    }
    return out;
  };

  const api: any = {
    pedido: {
      updateMany: async ({ where, data }: any) => {
        const rows = state.pedidos.filter((r) => matches(r, where));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
      findUnique: async ({ where, include, select }: any) => {
        const row = state.pedidos.find((r) => matches(r, where));
        if (select && row) return { id: row.id, estado: row.estado };
        return withRelations(row, include);
      },
      create: async ({ data, include }: any) => {
        guard('pedido.create');
        const { items, ...rest } = data;
        const row = { id: nextId++, ...rest };
        state.pedidos.push(row);
        for (const it of items?.create ?? []) state.items.push({ id: nextId++, pedidoId: row.id, ...it });
        return withRelations(row, include);
      },
      update: async ({ where, data, include }: any) => {
        const row = state.pedidos.find((r) => matches(r, where));
        if (!row) throw new Error('Pedido no existe');
        Object.assign(row, data);
        return withRelations(row, include);
      },
      count: async ({ where }: any) => state.pedidos.filter((r) => matches(r, where)).length,
    },
    itemPedido: {
      create: async ({ data }: any) => {
        guard('itemPedido.create');
        const row = { id: nextId++, ...data };
        state.items.push(row);
        return row;
      },
      findUnique: async ({ where, include }: any) => {
        const row = state.items.find((r) => matches(r, where));
        return row ? itemWithRel(row, include) : null;
      },
      findMany: async ({ where }: any) => state.items.filter((r) => matches(r, where)).map((r) => ({ ...r })),
      update: async ({ where, data }: any) => {
        const row = state.items.find((r) => matches(r, where));
        if (!row) throw new Error('Item no existe');
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }: any) => {
        const idx = state.items.findIndex((r) => matches(r, where));
        if (idx < 0) throw new Error('Item no existe');
        return state.items.splice(idx, 1)[0];
      },
    },
    producto: {
      findMany: async ({ where }: any) => state.productos.filter((r) => matches(r, where)).map((r) => ({ ...r })),
      findUnique: async ({ where }: any) => state.productos.find((r) => matches(r, where)) ?? null,
    },
    venta: {
      count: async ({ where }: any) => state.ventas.filter((r) => matches(r, where)).length,
      create: async ({ data }: any) => {
        guard('venta.create');
        const row = { id: nextId++, ...data };
        state.ventas.push(row);
        return row;
      },
    },
    mesa: {
      findUnique: async ({ where }: any) => state.mesas.find((r) => matches(r, where)) ?? null,
      update: async ({ where, data }: any) => {
        const row = state.mesas.find((r) => matches(r, where));
        if (!row) throw new Error('Mesa no existe');
        Object.assign(row, data);
        return row;
      },
    },
    usuario: {
      findUnique: async ({ where }: any) => state.usuarios.find((r) => matches(r, where)) ?? null,
    },
    historialPedido: {
      create: async ({ data }: any) => {
        const row = { id: nextId++, ...data };
        state.historial.push(row);
        return row;
      },
    },
  };

  // Mutex: una transacción a la vez (single-writer), con rollback si lanza.
  let lock: Promise<unknown> = Promise.resolve();
  api.$transaction = (cb: (tx: any) => Promise<unknown>) => {
    const run = async () => {
      const snapshot = JSON.parse(JSON.stringify(state));
      try {
        return await cb(api);
      } catch (e) {
        (Object.keys(snapshot) as (keyof typeof state)[]).forEach((k) => {
          state[k].splice(0, state[k].length, ...snapshot[k]);
        });
        throw e;
      }
    };
    const result = lock.then(run, run);
    lock = result.catch(() => undefined);
    return result;
  };

  return { prisma: api, state, failOn, addPedido };
}
