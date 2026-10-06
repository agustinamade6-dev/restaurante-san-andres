import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { aCentavos, aPesos, enPesos, subtotalCentavos } from '@/lib/money';
import { datosNegocio } from '@/lib/negocio';
import { descontarStockDeVenta } from '@/lib/stock';

const METODOS_PAGO = ['efectivo', 'tarjeta', 'transferencia', 'dividido'] as const;

const bodySchema = z.object({
  pedidoId: z.coerce.number().int().positive(),
  mesaId: z.coerce.number().int().positive(),
  metodoPago: z.enum(METODOS_PAGO).default('efectivo'),
  // En pesos, como la envía la pantalla; se convierte a centavos enteros.
  propina: z.coerce.number().finite().min(0).max(1_000_000_000).default(0).transform(aCentavos),
  // cajeroId del body se ignora: el cajero es siempre el usuario de la sesión firmada.
});

/** Error de negocio con status HTTP asociado. Hace rollback de la transacción al lanzarse. */
class CobroError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const ESTADOS_ACTIVOS = ['pendiente', 'preparando', 'listo'];

export async function POST(request: Request) {
  const auth = await requireAuth(['ADMIN', 'MOZO']);
  if (!auth.ok) return auth.response;

  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Cuerpo JSON inválido' }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = String(issue.path[0] ?? '');
      const error =
        field === 'pedidoId' || field === 'mesaId'
          ? 'pedidoId y mesaId son requeridos'
          : `${field}: ${issue.message}`;
      return NextResponse.json({ success: false, error }, { status: 400 });
    }
    const { pedidoId, mesaId, metodoPago, propina } = parsed.data;
    const cajeroId = auth.session.id;

    const today = new Date();
    const datePrefix = `${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;

    const { venta, pedido, subtotal, total, numeroTicket, numeroControlInterno } =
      await prisma.$transaction(async (tx) => {
        // 1. Guard atómico e idempotente: solo UNA petición puede pasar el pedido a "pagado".
        //    Hacerlo primero (una escritura) evita que dos cobros simultáneos lean el mismo estado.
        const claimed = await tx.pedido.updateMany({
          where: { id: pedidoId, estado: { notIn: ['pagado', 'cancelado'] } },
          data: { estado: 'pagado' },
        });
        if (claimed.count === 0) {
          const existe = await tx.pedido.findUnique({ where: { id: pedidoId }, select: { id: true } });
          throw existe
            ? new CobroError(400, 'Este pedido ya fue cerrado o cancelado')
            : new CobroError(404, 'Pedido no encontrado');
        }

        const pedido = await tx.pedido.findUnique({
          where: { id: pedidoId },
          include: { items: { include: { producto: true } }, mesa: true },
        });
        if (!pedido) throw new CobroError(404, 'Pedido no encontrado');
        if (pedido.mesaId !== mesaId) throw new CobroError(400, 'La mesa no corresponde al pedido');
        if (pedido.items.length === 0) throw new CobroError(400, 'El pedido no tiene ítems para cobrar');

        const cajero = await tx.usuario.findUnique({ where: { id: cajeroId }, select: { id: true } });
        if (!cajero) throw new CobroError(400, 'Cajero inválido');

        // 2. El subtotal sale de los ítems persistidos (fuente de verdad), no del total acumulado.
        //    Todo en centavos enteros: la suma es exacta.
        const subtotal = subtotalCentavos(pedido.items);
        const total = subtotal + propina;
        if (pedido.total !== subtotal) {
          await tx.pedido.update({ where: { id: pedidoId }, data: { total: subtotal } });
        }

        // 3. Numeración correlativa del día, calculada dentro de la transacción.
        const ventasHoy = await tx.venta.count({
          where: { numeroTicket: { startsWith: `T-${datePrefix}-` } },
        });
        const seq = (ventasHoy + 1).toString().padStart(4, '0');
        const numeroTicket = `T-${datePrefix}-${seq}`;
        const numeroControlInterno = `CI-${datePrefix}-${seq}`;

        const venta = await tx.venta.create({
          data: {
            pedidoId,
            mesaId,
            total,
            propina,
            metodoPago,
            items: pedido.items.reduce((sum, i) => sum + i.cantidad, 0),
            numeroTicket,
            numeroControlInterno,
            mesaNumero: pedido.mesa.numero,
            cajeroId,
          },
        });

        // 4. Descontar del stock los insumos de las recetas (en la misma transacción que la venta).
        await descontarStockDeVenta(tx, { ventaId: venta.id, usuarioId: cajeroId, items: pedido.items });

        // 5. Liberar la mesa solo si no quedan otros pedidos activos en ella.
        const otrosActivos = await tx.pedido.count({
          where: { mesaId: pedido.mesaId, id: { not: pedidoId }, estado: { in: ESTADOS_ACTIVOS } },
        });
        if (otrosActivos === 0) {
          await tx.mesa.update({ where: { id: pedido.mesaId }, data: { estado: 'libre' } });
        }

        await tx.historialPedido.create({
          data: {
            pedidoId,
            accion: 'COBRADO',
            detalle: `Cobro registrado por $${aPesos(total).toLocaleString()} — ${metodoPago.toUpperCase()}`,
            usuarioId: cajeroId,
          },
        });

        return { venta, pedido, subtotal, total, numeroTicket, numeroControlInterno };
      });

    // Los tickets se arman en pesos (contrato con el frontend).
    const lineas = pedido.items.map((i) => ({
      nombre: i.producto.nombre,
      cantidad: i.cantidad,
      precioUnit: aPesos(i.precio),
      subtotal: aPesos(i.precio * i.cantidad),
    }));
    const montos = { subtotal: aPesos(subtotal), propina: aPesos(propina), total: aPesos(total) };

    const ticketCliente = {
      tipo: 'CLIENTE',
      ...datosNegocio(),
      numeroTicket,
      fecha: today.toISOString(),
      mesa: pedido.mesa.numero,
      items: lineas,
      ...montos,
      metodoPago,
      mensaje: '¡Gracias por su visita! Esperamos verlo pronto.',
    };

    const ticketInterno = {
      tipo: 'INTERNO',
      numeroControlInterno,
      numeroTicket,
      fecha: today.toISOString(),
      mesa: pedido.mesa.numero,
      sector: pedido.mesa.sector,
      items: lineas,
      ...montos,
      metodoPago,
      ventaId: venta.id,
      operadorId: cajeroId,
    };

    return NextResponse.json({ success: true, venta: enPesos(venta), ticketCliente, ticketInterno });
  } catch (error) {
    if (error instanceof CobroError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Error processing checkout:', error);
    return NextResponse.json({ success: false, error: 'Error al procesar el cobro' }, { status: 500 });
  }
}
