import { Injectable, Logger } from '@nestjs/common';
import { ServiceClients, type ErrorBody, type ReservationResponse } from '../clients/clients.js';
import type { AuthUser } from '../common/auth/auth.types.js';
import { AppException } from '../common/errors/app-exception.js';
import { Prisma, type Order } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateOrderDto } from './dto.js';
import { OrderWorkflow } from './order-workflow.service.js';
import { toOrderResponse, type OrderResponse } from './order.mapper.js';

function isReservation(data: unknown): data is ReservationResponse {
  return typeof data === 'object' && data !== null && 'reservationId' in data;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger('Orders');

  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ServiceClients,
    private readonly workflow: OrderWorkflow,
  ) {}

  // ---------- Compra ----------

  /**
   * Flujo de compra (docs/CONTRATOS.md §5). Devuelve { created, order }.
   * Los fallos de negocio lanzan AppException con la orden en details.order.
   */
  async purchase(
    user: AuthUser,
    dto: CreateOrderDto,
    idempotencyKey: string | undefined,
    requestId: string | undefined,
  ): Promise<{ created: boolean; order: OrderResponse }> {
    // 0) Misma Idempotency-Key del mismo cliente -> misma orden, sin volver a cobrar.
    if (idempotencyKey) {
      const existing = await this.prisma.order.findUnique({
        where: { userId_idempotencyKey: { userId: user.id, idempotencyKey } },
      });
      if (existing) return { created: false, order: toOrderResponse(existing) };
    }

    // 1) Orden PENDING
    let order: Order;
    try {
      order = await this.prisma.order.create({
        data: {
          userId: user.id,
          customerName: user.name,
          customerEmail: user.email,
          idempotencyKey: idempotencyKey ?? null,
          eventId: dto.eventId,
          sectorId: dto.sectorId,
          quantity: dto.quantity,
        },
      });
    } catch (err) {
      if (idempotencyKey && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const winner = await this.prisma.order.findUnique({
          where: { userId_idempotencyKey: { userId: user.id, idempotencyKey } },
        });
        if (winner) return { created: false, order: toOrderResponse(winner) };
      }
      throw err;
    }
    this.logger.log(`Orden creada id=${order.id} user=${user.id} event=${dto.eventId} cantidad=${dto.quantity}`);

    // 2) Reservar cupos
    order = await this.reserve(order, requestId);

    // 3) Cobrar
    const charge = await this.workflow.charge(order, dto.card, requestId);

    if (charge.kind === 'REJECTED') {
      await this.workflow.transition(order.id, 'PENDING', { status: 'REJECTED', failureCode: charge.payment.reason ?? 'PAYMENT_REJECTED' });
      await this.workflow.release(order.id, requestId);
      this.logger.warn(`Pago rechazado order=${order.id} motivo=${charge.payment.reason}`);
      throw await this.fail(order.id, 402, 'PAYMENT_REJECTED', 'El pago fue rechazado', { reason: charge.payment.reason });
    }
    if (charge.kind === 'INVALID') {
      await this.workflow.transition(order.id, 'PENDING', { status: 'CANCELLED', failureCode: 'INVALID_PAYMENT_DATA' });
      await this.workflow.release(order.id, requestId);
      throw await this.fail(order.id, 400, 'VALIDATION_ERROR', charge.message);
    }
    if (charge.kind === 'UNKNOWN') {
      // NO se libera el cupo: el pago pudo haberse registrado. El reconciliador lo resuelve.
      this.logger.warn(`Pago sin confirmar order=${order.id}; queda PENDING para el reconciliador`);
      throw await this.fail(order.id, 503, 'PAYMENT_PENDING', 'No pudimos confirmar el pago; revisa Mis compras en unos minutos');
    }

    // APPROVED
    const moved = await this.workflow.transition(order.id, 'PENDING', { status: 'PAID', paidAt: new Date() });
    if (moved) this.logger.log(`Orden pagada id=${order.id} total=${order.totalCents}`);

    // 4) y 5) Entradas y correo (si fallan, la orden sigue PAID)
    const final = await this.workflow.fulfill(order.id, requestId);
    return { created: true, order: toOrderResponse(final) };
  }

  /** Paso 2: reserva en events. Si falla, la orden queda CANCELLED y se lanza el error. */
  private async reserve(order: Order, requestId?: string): Promise<Order> {
    const body = { orderId: order.id, eventId: order.eventId, sectorId: order.sectorId, quantity: order.quantity };
    let status: number;
    let data: unknown;
    try {
      ({ status, data } = await this.clients.reserve(body, requestId));
    } catch {
      // events no respondió: la reserva pudo haberse hecho. Se intenta liberar (idempotente).
      await this.workflow.transition(order.id, 'PENDING', { status: 'CANCELLED', failureCode: 'EVENTS_UNAVAILABLE' });
      await this.workflow.release(order.id, requestId);
      throw await this.fail(order.id, 503, 'DEPENDENCY_UNAVAILABLE', 'El servicio de eventos no está disponible');
    }

    if ((status === 200 || status === 201) && isReservation(data)) {
      return this.prisma.order.update({
        where: { id: order.id },
        data: {
          reserved: true,
          organizerId: data.event.organizerId,
          eventName: data.event.name,
          eventStartsAt: new Date(data.event.startsAt),
          venue: data.event.venue,
          sectorName: data.sector.name,
          unitPriceCents: data.unitPriceCents,
          totalCents: data.totalCents,
        },
      });
    }

    const err = data as ErrorBody;
    if (status === 409 || status === 404 || status === 400) {
      const code = err?.code ?? 'CONFLICT';
      await this.workflow.transition(order.id, 'PENDING', { status: 'CANCELLED', failureCode: code });
      this.logger.warn(`Reserva fallida order=${order.id} code=${code}`);
      throw await this.fail(order.id, status, code, err?.message ?? 'No se pudo reservar');
    }

    // 401 (clave interna mal configurada) o 5xx: tratar como servicio caído.
    this.logger.error(`events respondió ${status} al reservar order=${order.id}: ${JSON.stringify(data)}`);
    await this.workflow.transition(order.id, 'PENDING', { status: 'CANCELLED', failureCode: 'EVENTS_ERROR' });
    await this.workflow.release(order.id, requestId);
    throw await this.fail(order.id, 503, 'DEPENDENCY_UNAVAILABLE', 'El servicio de eventos no está disponible');
  }

  /** Error de negocio con la orden actual en details.order (la web la puede mostrar). */
  private async fail(orderId: string, statusCode: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    return new AppException(statusCode, code, message, { ...extra, orderId, order: toOrderResponse(order) });
  }

  // ---------- Consultas del cliente ----------

  async listMine(userId: string) {
    const orders = await this.prisma.order.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 200 });
    return orders.map(toOrderResponse);
  }

  async getMine(userId: string, id: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order || order.userId !== userId) throw new AppException(404, 'NOT_FOUND', 'Orden no encontrada');
    return toOrderResponse(order);
  }

  async retryTickets(userId: string, id: string, requestId?: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order || order.userId !== userId) throw new AppException(404, 'NOT_FOUND', 'Orden no encontrada');
    if (order.status !== 'PAID') {
      throw new AppException(409, 'INVALID_STATUS', 'Solo se pueden emitir entradas de una orden pagada');
    }
    if (order.ticketsStatus === 'ISSUED') return toOrderResponse(order);
    const result = await this.workflow.fulfill(id, requestId);
    if (result.ticketsStatus !== 'ISSUED') {
      throw new AppException(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudieron emitir las entradas; intenta de nuevo en unos minutos', {
        order: toOrderResponse(result),
      });
    }
    return toOrderResponse(result);
  }

  // ---------- Reporte del organizador ----------

  async eventReport(user: AuthUser, eventId: string, requestId?: string) {
    const r = await this.clients.getEvent(eventId, requestId);
    const event = r.data as { id?: string; name?: string; organizerId?: string };
    if (r.status === 404 || (r.status === 200 && event.organizerId !== user.id)) {
      throw new AppException(404, 'NOT_FOUND', 'Evento no encontrado');
    }
    if (r.status !== 200) throw new AppException(503, 'DEPENDENCY_UNAVAILABLE', 'El servicio de eventos no está disponible');

    const [bySector, rejectedOrders] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['sectorId', 'sectorName'],
        where: { eventId, status: 'PAID' },
        _sum: { quantity: true, totalCents: true },
        _count: { _all: true },
      }),
      this.prisma.order.count({ where: { eventId, status: 'REJECTED' } }),
    ]);

    const sectors = bySector
      .map((s) => ({
        sectorId: s.sectorId,
        sectorName: s.sectorName,
        paidOrders: s._count._all,
        ticketsSold: s._sum.quantity ?? 0,
        revenueCents: s._sum.totalCents ?? 0,
      }))
      .sort((a, b) => b.revenueCents - a.revenueCents);

    return {
      eventId,
      eventName: event.name,
      paidOrders: sectors.reduce((n, s) => n + s.paidOrders, 0),
      ticketsSold: sectors.reduce((n, s) => n + s.ticketsSold, 0),
      revenueCents: sectors.reduce((n, s) => n + s.revenueCents, 0),
      bySector: sectors,
      rejectedOrders,
    };
  }
}
