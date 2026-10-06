import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { pedidoId, mesaId, metodoPago, propina = 0, cajeroId } = body;

    if (!pedidoId || !mesaId) {
      return NextResponse.json({ success: false, error: 'pedidoId y mesaId son requeridos' }, { status: 400 });
    }

    // Get the pedido with items
    const pedido = await prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: {
        items: { include: { producto: true } },
        mesa: true,
      },
    });

    if (!pedido) {
      return NextResponse.json({ success: false, error: 'Pedido no encontrado' }, { status: 404 });
    }

    if (['cancelado', 'pagado'].includes(pedido.estado)) {
      return NextResponse.json({ success: false, error: 'Este pedido ya fue cerrado o cancelado' }, { status: 400 });
    }

    const total = pedido.total + propina;

    // Generate ticket numbers
    const today = new Date();
    const datePrefix = `${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;
    const ventaCount = await prisma.venta.count({
      where: {
        fechaCobro: {
          gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
        },
      },
    });
    const seq = (ventaCount + 1).toString().padStart(4, '0');
    const numeroTicket = `T-${datePrefix}-${seq}`;
    const numeroControlInterno = `CI-${datePrefix}-${seq}`;

    // Transaction: create venta, update pedido status, free mesa
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the Venta record
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
          cajeroId: cajeroId || null,
        },
      });

      // 2. Mark pedido as pagado
      await tx.pedido.update({
        where: { id: pedidoId },
        data: { estado: 'pagado' },
      });

      // 3. Free the mesa
      await tx.mesa.update({
        where: { id: mesaId },
        data: { estado: 'libre' },
      });

      // 4. Log to historial
      await tx.historialPedido.create({
        data: {
          pedidoId,
          accion: 'COBRADO',
          detalle: `Cobro registrado por $${total.toLocaleString()} — ${metodoPago.toUpperCase()}`,
        },
      });

      return venta;
    });

    // Build ticket payloads
    const ticketCliente = {
      tipo: 'CLIENTE',
      restaurante: 'Restaurante San Andrés',
      cuit: '30-12345678-9',
      direccion: 'Av. San Martín 1234, San Andrés',
      numeroTicket,
      fecha: today.toISOString(),
      mesa: pedido.mesa.numero,
      items: pedido.items.map((i) => ({
        nombre: i.producto.nombre,
        cantidad: i.cantidad,
        precioUnit: i.precio,
        subtotal: i.precio * i.cantidad,
      })),
      subtotal: pedido.total,
      propina,
      total,
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
      items: pedido.items.map((i) => ({
        nombre: i.producto.nombre,
        cantidad: i.cantidad,
        precioUnit: i.precio,
        subtotal: i.precio * i.cantidad,
      })),
      subtotal: pedido.total,
      propina,
      total,
      metodoPago,
      ventaId: result.id,
      operadorId: cajeroId,
    };

    return NextResponse.json({
      success: true,
      venta: result,
      ticketCliente,
      ticketInterno,
    });
  } catch (error) {
    console.error('Error processing checkout:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Error al procesar el cobro' }, { status: 500 });
  }
}
