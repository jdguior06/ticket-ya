import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { MAX_NOTIFICATION_TRIES, OrderWorkflow } from './order-workflow.service.js';

const BATCH = 50;

/**
 * Reconciliador (docs/CONTRATOS.md §5 paso 3.3). Cada RECONCILE_INTERVAL_MS:
 *  1. Órdenes PENDING antiguas: consulta el pago -> PAID / REJECTED / CANCELLED por timeout.
 *  2. Cupos que no se pudieron liberar (releasePending) -> reintenta.
 *  3. Órdenes PAID sin entradas o sin correo -> reintenta emitir / enviar.
 * Solo CONSULTA payments: nunca vuelve a cobrar (no tiene los datos de la tarjeta).
 * Solo toca órdenes sin cambios en los últimos RECONCILE_MIN_AGE_MS, para no pisar una compra en curso.
 */
@Injectable()
export class Reconciler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Reconciler');
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly intervalMs: number;
  private readonly minAgeMs: number;
  private readonly pendingTimeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: OrderWorkflow,
    config: ConfigService,
  ) {
    this.intervalMs = Number(config.get('RECONCILE_INTERVAL_MS') ?? 60000);
    this.minAgeMs = Number(config.get('RECONCILE_MIN_AGE_MS') ?? 60000);
    this.pendingTimeoutMs = Number(config.get('PENDING_TIMEOUT_MS') ?? 600000);
  }

  onApplicationBootstrap(): void {
    if (this.intervalMs <= 0) {
      this.logger.warn('Reconciliador desactivado (RECONCILE_INTERVAL_MS=0)');
      return;
    }
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs);
    this.timer.unref();
    this.logger.log(`Reconciliador cada ${this.intervalMs} ms`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Una pasada completa. Público para poder probarlo. No corre dos veces a la vez. */
  async runOnce(): Promise<{ pending: number; released: number; fulfilled: number }> {
    if (this.running) return { pending: 0, released: 0, fulfilled: 0 };
    this.running = true;
    try {
      const pending = await this.reconcilePending();
      const released = await this.retryReleases();
      const fulfilled = await this.retryFulfillment();
      if (pending + released + fulfilled > 0) {
        this.logger.log(`Pasada: pendientes=${pending} liberadas=${released} completadas=${fulfilled}`);
      }
      return { pending, released, fulfilled };
    } catch (err) {
      this.logger.error('Error en el reconciliador', err as Error);
      return { pending: 0, released: 0, fulfilled: 0 };
    } finally {
      this.running = false;
    }
  }

  private cutoff(ms: number): Date {
    return new Date(Date.now() - ms);
  }

  private async reconcilePending(): Promise<number> {
    const orders = await this.prisma.order.findMany({
      where: { status: 'PENDING', updatedAt: { lt: this.cutoff(this.minAgeMs) } },
      orderBy: { createdAt: 'asc' },
      take: BATCH,
    });
    let handled = 0;
    const expired = (createdAt: Date) => createdAt < this.cutoff(this.pendingTimeoutMs);

    for (const order of orders) {
      // Se cortó antes de confirmar la reserva (p. ej. se cayó orders): solo se cancela tras el timeout.
      if (!order.reserved) {
        if (!expired(order.createdAt)) continue;
        if (await this.workflow.transition(order.id, 'PENDING', { status: 'CANCELLED', failureCode: 'RESERVATION_TIMEOUT' })) {
          await this.workflow.release(order.id);
          this.logger.warn(`Orden sin reserva cancelada por timeout id=${order.id}`);
          handled++;
        }
        continue;
      }

      const check = await this.workflow.checkPayment(order.id);
      if (check.state === 'UNREACHABLE') continue; // payments caído: se reintenta en la próxima pasada

      if (check.state === 'FOUND' && check.payment.status === 'APPROVED') {
        if (await this.workflow.transition(order.id, 'PENDING', { status: 'PAID', paidAt: new Date() })) {
          this.logger.log(`Pago confirmado por reconciliación id=${order.id}`);
          await this.workflow.fulfill(order.id);
          handled++;
        }
      } else if (check.state === 'FOUND') {
        if (await this.workflow.transition(order.id, 'PENDING', { status: 'REJECTED', failureCode: check.payment.reason ?? 'PAYMENT_REJECTED' })) {
          await this.workflow.release(order.id);
          this.logger.warn(`Pago rechazado confirmado por reconciliación id=${order.id}`);
          handled++;
        }
      } else if (expired(order.createdAt)) {
        // payments RESPONDE que no hay transacción y ya pasó PENDING_TIMEOUT_MS.
        if (await this.workflow.transition(order.id, 'PENDING', { status: 'CANCELLED', failureCode: 'PAYMENT_TIMEOUT' })) {
          await this.workflow.release(order.id);
          this.logger.warn(`Orden cancelada: sin pago tras el timeout id=${order.id}`);
          handled++;
        }
      }
    }
    return handled;
  }

  private async retryReleases(): Promise<number> {
    const orders = await this.prisma.order.findMany({ where: { releasePending: true }, take: BATCH });
    let done = 0;
    for (const order of orders) if (await this.workflow.release(order.id)) done++;
    return done;
  }

  private async retryFulfillment(): Promise<number> {
    const orders = await this.prisma.order.findMany({
      where: {
        status: 'PAID',
        updatedAt: { lt: this.cutoff(this.minAgeMs) },
        OR: [
          { ticketsStatus: { not: 'ISSUED' } },
          { notificationStatus: { not: 'SENT' }, notificationTries: { lt: MAX_NOTIFICATION_TRIES } },
        ],
      },
      take: BATCH,
    });
    let done = 0;
    for (const order of orders) {
      const after = await this.workflow.fulfill(order.id);
      if (after.ticketsStatus !== order.ticketsStatus || after.notificationStatus === 'SENT') done++;
    }
    return done;
  }
}
