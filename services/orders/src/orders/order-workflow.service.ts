import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceClients, type PaymentResponse } from '../clients/clients.js';
import { AppException } from '../common/errors/app-exception.js';
import type { Order, OrderStatus, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CardDto } from './dto.js';

export const MAX_NOTIFICATION_TRIES = 5;
const PAYMENT_RETRY_WAITS_MS = [500, 1000];

export type ChargeResult =
  | { kind: 'APPROVED'; payment: PaymentResponse }
  | { kind: 'REJECTED'; payment: PaymentResponse }
  | { kind: 'INVALID'; message: string }
  | { kind: 'UNKNOWN' };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isPayment(data: unknown): data is PaymentResponse {
  return typeof data === 'object' && data !== null && 'status' in data && 'paymentId' in data;
}

/**
 * Pasos reutilizables del flujo de compra. Los usan la compra (OrdersService),
 * el reintento manual y el reconciliador, así que todos son seguros de repetir.
 */
@Injectable()
export class OrderWorkflow {
  private readonly logger = new Logger('Workflow');
  private readonly webBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ServiceClients,
    config: ConfigService,
  ) {
    this.webBaseUrl = config.getOrThrow<string>('WEB_BASE_URL').replace(/\/$/, '');
  }

  /**
   * Cambia de estado solo si la orden sigue en `from` (evita que la compra y el
   * reconciliador apliquen dos transiciones distintas). Devuelve true si la aplicó.
   */
  async transition(orderId: string, from: OrderStatus, data: Prisma.OrderUpdateManyMutationInput): Promise<boolean> {
    const { count } = await this.prisma.order.updateMany({ where: { id: orderId, status: from }, data });
    return count === 1;
  }

  // ---------- Pago ----------

  /**
   * Cobra con recuperación (docs/CONTRATOS.md §5 paso 3). Si payments no responde,
   * NO se asume rechazo: se consulta la transacción y se reintenta (POST es idempotente).
   */
  async charge(order: Order, card: CardDto, requestId?: string): Promise<ChargeResult> {
    const body = { orderId: order.id, amountCents: order.totalCents ?? 0, currency: 'BOB' as const, card };

    for (let attempt = 0; attempt <= PAYMENT_RETRY_WAITS_MS.length; attempt++) {
      try {
        const r = await this.clients.pay(body, requestId);
        if ((r.status === 200 || r.status === 201) && isPayment(r.data)) return this.toCharge(r.data);
        if (r.status === 400) {
          return { kind: 'INVALID', message: (r.data as { message?: string })?.message ?? 'Datos de pago inválidos' };
        }
        if (r.status === 409) {
          // Pedimos otro monto para la misma orden: es un error de programación, no del cliente.
          this.logger.error(`payments respondió 409 order=${order.id}: ${JSON.stringify(r.data)}`);
          throw new AppException(500, 'INTERNAL_ERROR', 'Conflicto al registrar el pago');
        }
        this.logger.warn(`payments respondió ${r.status} order=${order.id}`);
      } catch (err) {
        if (!(err instanceof AppException) || err.code !== 'DEPENDENCY_UNAVAILABLE') throw err;
      }

      // Resultado desconocido: ¿se registró el pago aunque la respuesta se perdió?
      const known = await this.lookupPayment(order.id, requestId);
      if (known) return this.toCharge(known);

      if (attempt < PAYMENT_RETRY_WAITS_MS.length) await sleep(PAYMENT_RETRY_WAITS_MS[attempt]);
    }
    return { kind: 'UNKNOWN' };
  }

  /** null = no hay transacción o payments no responde. */
  async lookupPayment(orderId: string, requestId?: string): Promise<PaymentResponse | null> {
    try {
      const r = await this.clients.getPayment(orderId, requestId);
      return r.status === 200 && isPayment(r.data) ? r.data : null;
    } catch {
      return null;
    }
  }

  /** Estado del pago según payments, distinguiendo "no existe" de "no responde". */
  async checkPayment(orderId: string, requestId?: string): Promise<
    { state: 'FOUND'; payment: PaymentResponse } | { state: 'NOT_FOUND' } | { state: 'UNREACHABLE' }
  > {
    try {
      const r = await this.clients.getPayment(orderId, requestId);
      if (r.status === 200 && isPayment(r.data)) return { state: 'FOUND', payment: r.data };
      if (r.status === 404) return { state: 'NOT_FOUND' };
      return { state: 'UNREACHABLE' };
    } catch {
      return { state: 'UNREACHABLE' };
    }
  }

  private toCharge(payment: PaymentResponse): ChargeResult {
    return payment.status === 'APPROVED' ? { kind: 'APPROVED', payment } : { kind: 'REJECTED', payment };
  }

  // ---------- Cupos ----------

  /** Devuelve el cupo a events. Si events no responde, queda marcado para el reconciliador. */
  async release(orderId: string, requestId?: string): Promise<boolean> {
    try {
      const r = await this.clients.release(orderId, requestId);
      if (r.status === 200 || r.status === 404) {
        await this.prisma.order.update({ where: { id: orderId }, data: { releasePending: false } });
        if (r.status === 200) this.logger.log(`Cupo liberado order=${orderId}`);
        return true;
      }
      this.logger.warn(`events respondió ${r.status} al liberar order=${orderId}`);
    } catch {
      this.logger.warn(`events no disponible al liberar order=${orderId}; se reintentará`);
    }
    await this.prisma.order.update({ where: { id: orderId }, data: { releasePending: true } });
    return false;
  }

  // ---------- Después de pagar ----------

  /**
   * Emite las entradas y envía el correo si falta. Nunca cambia el estado PAID:
   * si tickets o notifications fallan, la compra sigue siendo válida.
   */
  async fulfill(orderId: string, requestId?: string): Promise<Order> {
    let order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status !== 'PAID') return order;

    if (order.ticketsStatus !== 'ISSUED') {
      const issued = await this.issueTickets(order, requestId);
      order = await this.prisma.order.update({
        where: { id: orderId },
        data: { ticketsStatus: issued ? 'ISSUED' : 'FAILED' },
      });
    }

    if (
      order.ticketsStatus === 'ISSUED' &&
      order.notificationStatus !== 'SENT' &&
      order.notificationTries < MAX_NOTIFICATION_TRIES
    ) {
      const sent = await this.notify(order, requestId);
      order = await this.prisma.order.update({
        where: { id: orderId },
        data: { notificationStatus: sent ? 'SENT' : 'FAILED', notificationTries: { increment: 1 } },
      });
    }
    return order;
  }

  private async issueTickets(order: Order, requestId?: string): Promise<boolean> {
    try {
      const r = await this.clients.issueTickets(
        {
          orderId: order.id,
          userId: order.userId,
          holderName: order.customerName,
          holderEmail: order.customerEmail,
          event: { id: order.eventId, name: order.eventName, venue: order.venue, startsAt: order.eventStartsAt?.toISOString() },
          sector: { id: order.sectorId, name: order.sectorName },
          quantity: order.quantity,
        },
        requestId,
      );
      if (r.status === 200 || r.status === 201) {
        this.logger.log(`Entradas emitidas order=${order.id}`);
        return true;
      }
      this.logger.error(`tickets respondió ${r.status} order=${order.id}: ${JSON.stringify(r.data)}`);
    } catch {
      this.logger.warn(`tickets no disponible order=${order.id}; se reintentará`);
    }
    return false;
  }

  private async notify(order: Order, requestId?: string): Promise<boolean> {
    try {
      const r = await this.clients.notifyOrderConfirmed(
        {
          to: order.customerEmail,
          customerName: order.customerName,
          orderId: order.id,
          eventName: order.eventName,
          venue: order.venue,
          eventStartsAt: order.eventStartsAt?.toISOString(),
          sectorName: order.sectorName,
          quantity: order.quantity,
          totalCents: order.totalCents,
          ticketsUrl: `${this.webBaseUrl}/mis-entradas?orden=${order.id}`,
        },
        requestId,
      );
      if (r.status === 202 || r.status === 200) {
        this.logger.log(`Correo de confirmación enviado order=${order.id}`);
        return true;
      }
      this.logger.warn(`notifications respondió ${r.status} order=${order.id}`);
    } catch {
      this.logger.warn(`notifications no disponible order=${order.id}; la compra sigue siendo válida`);
    }
    return false;
  }
}
