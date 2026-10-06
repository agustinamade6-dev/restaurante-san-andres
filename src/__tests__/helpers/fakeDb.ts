/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Base de datos en memoria que imita lo mínimo de Prisma que usan las rutas bajo prueba.
 *
 * LIMITACIÓN (importante): modela SQLite con un único escritor (las transacciones se serializan
 * con un mutex) y rollback completo ante una excepción. NO reemplaza una prueba contra SQLite real:
 * valida la lógica de la ruta, no el comportamiento del motor.
 */
type Row = Record<string, any>;

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

export function createFakeDb(seed: Partial<Record<'pedidos' | 'mesas' | 'usuarios' | 'ventas' | 'historial', Row[]>> = {}) {
  const state = {
    pedidos: [...(seed.pedidos ?? [])] as Row[],
    mesas: [...(seed.mesas ?? [])] as Row[],
    usuarios: [...(seed.usuarios ?? [])] as Row[],
    ventas: [...(seed.ventas ?? [])] as Row[],
    historial: [...(seed.historial ?? [])] as Row[],
  };
  let nextId = 1000;
  const failOn = new Set<string>();

  const withRelations = (p: Row | undefined, include?: Row) => {
    if (!p) return null;
    const out: Row = { ...p };
    if (include?.mesa) out.mesa = state.mesas.find((m) => m.id === p.mesaId);
    if (!include?.items) delete out.items;
    return out;
  };

  const guard = (name: string) => {
    if (failOn.has(name)) throw new Error(`fallo simulado en ${name}`);
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
        if (select && row) return { id: row.id };
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

  return { prisma: api, state, failOn };
}
