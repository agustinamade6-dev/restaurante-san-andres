import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { PREFIJO_ANULACION } from '@/lib/ventas';
import eventEmitter from '@/lib/events';
import { MAX_MONTO_PESOS, aCentavos, aPesos, dentroDeRango, enPesos, subtotalCentavos } from '@/lib/money';
import { datosNegocio } from '@/lib/negocio';
import { descontarStockDeVenta } from '@/lib/stock';
import { PEDIDOS_QUE_OCUPAN_MESA } from '@/lib/mesas';

const METODOS_PAGO = ['efectivo', 'tarjeta', 'transferencia', 'dividido'] as const;

const bodySchema = z.object({
  pedidoId: z.coerce.number().int().positive(),
  mesaId: z.coerce.number().int().positive(),
  metodoPago: z.enum(METODOS_PAGO).default('efectivo'),
  // En pesos, como la envía la pantalla; se convierte a centavos enteros.
  propina: z.coerce.number().finite().min(0).max(MAX_MONTO_PESOS).default(0).transform(aCentavos),
  // cajeroId del body se ignora: el cajero es siempre el usuario de la sesión firmada.
});

/** Error de negocio con status HTTP asociado. Hace rollback de la transacción al lanzarse. */
class CobroError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const INCLUIR_PEDIDO = { items: { include: { producto: true } }, mesa: true } as const;
type PedidoConDetalle = Prisma.PedidoGetPayload<{ include: typeof INCLUIR_PEDIDO }>;
type Venta = Prisma.VentaGetPayload<object>;

/**
 * Venta original y vigente de un pedido ya cobrado (no anulada), para responder a un reintento.
 * null si el pedido no está pagado, es de otra mesa, o su venta fue anulada.
 */
async function ventaVigenteDelPedido(tx: Prisma.TransactionClient, pedidoId: number, mesaId: number) {
  const pedido = await tx.pedido.findUnique({ where: { id: pedidoId }, include: INCLUIR_PEDIDO });
  if (!pedido || pedido.estado !== 'pagado' || pedido.mesaId !== mesaId) return null;
  const ventas = await tx.venta.findMany({ where: { pedidoId } });
  const original = ventas
    .filter((v) => v.numeroControlInterno.startsWith('CI-'))
    .sort((a, b) => b.id - a.id)[0];
  if (!original) return null;
  if (ventas.some((v) => v.numeroControlInterno === `${PREFIJO_ANULACION}${original.id}`)) return null;
  return { venta: original, pedido };
}

/** Tickets en pesos (contrato con el frontend), armados desde la venta guardada: sirven igual para un reintento. */
function armarTickets(venta: Venta, pedido: PedidoConDetalle) {
  const lineas = pedido.items.map((i) => ({
    nombre: i.producto.nombre,
    cantidad: i.cantidad,
    precioUnit: aPesos(i.precio),
    subtotal: aPesos(i.precio * i.cantidad),
  }));
  const montos = {
    subtotal: aPesos(venta.total - venta.propina),
    propina: aPesos(venta.propina),
    total: aPesos(venta.total),
  };
  const fecha = new Date(venta.fechaCobro).toISOString();
  const ticketCliente = {
    tipo: 'CLIENTE',
    ...datosNegocio(),
    numeroTicket: venta.numeroTicket,
    fecha,
    mesa: pedido.mesa.numero,
    items: lineas,
    ...montos,
    metodoPago: venta.metodoPago,
    mensaje: '¡Gracias por su visita! Esperamos verlo pronto.',
  };
  const ticketInterno = {
    tipo: 'INTERNO',
    numeroControlInterno: venta.numeroControlInterno,
    numeroTicket: venta.numeroTicket,
    fecha,
    mesa: pedido.mesa.numero,
    sector: pedido.mesa.sector,
    items: lineas,
    ...montos,
    metodoPago: venta.metodoPago,
    ventaId: venta.id,
    operadorId: venta.cajeroId,
  };
  return { ticketCliente, ticketInterno };
}

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

    const hoy = new Date();
    const datePrefix = `${hoy.getFullYear()}${(hoy.getMonth() + 1).toString().padStart(2, '0')}${hoy.getDate().toString().padStart(2, '0')}`;

    const resultado = await prisma.$transaction(async (tx) => {
      // 1. Guard atómico: solo UNA petición puede pasar el pedido a "pagado".
      //    Hacerlo primero (una escritura) evita que dos cobros simultáneos lean el mismo estado.
      const claimed = await tx.pedido.updateMany({
        where: { id: pedidoId, estado: { notIn: ['pagado', 'cancelado'] } },
        data: { estado: 'pagado' },
      });
      if (claimed.count === 0) {
        // Reintento: si el cobro ya se registró (p. ej. se cortó la red antes de recibir la respuesta), se devuelve
        // esa misma venta en vez de un error, para que la pantalla muestre el cobro e imprima el ticket. No se crea
        // otra venta ni se vuelve a descontar stock.
        const previo = await ventaVigenteDelPedido(tx, pedidoId, mesaId);
        if (previo) return { reintento: true as const, ...previo };
        const existe = await tx.pedido.findUnique({ where: { id: pedidoId }, select: { id: true } });
        throw existe
          ? new CobroError(400, 'Este pedido ya fue cerrado o cancelado')
          : new CobroError(404, 'Pedido no encontrado');
      }

      const pedido = await tx.pedido.findUnique({ where: { id: pedidoId }, include: INCLUIR_PEDIDO });
      if (!pedido) throw new CobroError(404, 'Pedido no encontrado');
      if (pedido.mesaId !== mesaId) throw new CobroError(400, 'La mesa no corresponde al pedido');
      if (pedido.items.length === 0) throw new CobroError(400, 'El pedido no tiene ítems para cobrar');

      const cajero = await tx.usuario.findUnique({ where: { id: cajeroId }, select: { id: true } });
      if (!cajero) throw new CobroError(400, 'Cajero inválido');

      // 2. El subtotal sale de los ítems persistidos (fuente de verdad), no del total acumulado.
      //    Todo en centavos enteros: la suma es exacta.
      const subtotal = subtotalCentavos(pedido.items);
      const total = subtotal + propina;
      if (!dentroDeRango(total)) throw new CobroError(400, 'El total supera el máximo que se puede registrar');
      if (pedido.total !== subtotal) {
        await tx.pedido.update({ where: { id: pedidoId }, data: { total: subtotal } });
      }

      // 3. Numeración correlativa del día, calculada dentro de la transacción.
      const ventasHoy = await tx.venta.count({
        where: { numeroTicket: { startsWith: `T-${datePrefix}-` } },
      });
      const seq = (ventasHoy + 1).toString().padStart(4, '0');

      const venta = await tx.venta.create({
        data: {
          pedidoId,
          mesaId,
          total,
          propina,
          metodoPago,
          items: pedido.items.reduce((sum, i) => sum + i.cantidad, 0),
          numeroTicket: `T-${datePrefix}-${seq}`,
          numeroControlInterno: `CI-${datePrefix}-${seq}`,
          mesaNumero: pedido.mesa.numero,
          cajeroId,
        },
      });

      // 4. Descontar del stock los insumos de las recetas (en la misma transacción que la venta).
      await descontarStockDeVenta(tx, { ventaId: venta.id, usuarioId: cajeroId, items: pedido.items });

      // 5. Liberar la mesa solo si no quedan otros pedidos activos en ella.
      const otrosActivos = await tx.pedido.count({
        where: { mesaId: pedido.mesaId, id: { not: pedidoId }, estado: { in: PEDIDOS_QUE_OCUPAN_MESA } },
      });
      const mesaLiberada = otrosActivos === 0;
      if (mesaLiberada) {
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

      return { reintento: false as const, venta, pedido: { ...pedido, total: subtotal }, mesaLiberada };
    });

    const { venta, pedido } = resultado;
    if (!resultado.reintento) {
      // Tiempo real: comanderas y cocina ven el pedido cobrado y, si quedó libre, la mesa liberada (montos en pesos).
      eventEmitter.emit('pedido:actualizado', enPesos({ ...pedido, estado: 'pagado' }));
      if (resultado.mesaLiberada) eventEmitter.emit('mesa:actualizada', { ...pedido.mesa, estado: 'libre' });
    }

    const { ticketCliente, ticketInterno } = armarTickets(venta, pedido);
    return NextResponse.json({
      success: true,
      venta: enPesos(venta),
      ticketCliente,
      ticketInterno,
      ...(resultado.reintento ? { reintento: true } : {}),
    });
  } catch (error) {
    if (error instanceof CobroError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Error processing checkout:', error);
    return NextResponse.json({ success: false, error: 'Error al procesar el cobro' }, { status: 500 });
  }
}
