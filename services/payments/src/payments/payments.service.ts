import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../common/errors/app-exception.js';
import { Prisma, type Payment } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreatePaymentDto } from './dto.js';

function paymentResponse(payment: Payment) {
  const { id, orderId, status, reason, amountCents, currency, cardLast4, createdAt } = payment;
  return { paymentId: id, orderId, status, reason, amountCents, currency, cardLast4, createdAt };
}

function replayPayment(payment: Payment, amountCents: number) {
  if (payment.amountCents !== amountCents) {
    throw new AppException(409, 'IDEMPOTENCY_CONFLICT', 'La orden ya tiene un pago con otro monto');
  }
  return { created: false, payment: paymentResponse(payment) };
}

function rejectionReason(card: CreatePaymentDto['card'], last4: string) {
  if (last4 === '0000') return 'CARD_DECLINED';
  if (last4 === '9999') return 'INSUFFICIENT_FUNDS';

  const now = new Date();
  if (card.expYear < now.getUTCFullYear() ||
      (card.expYear === now.getUTCFullYear() && card.expMonth < now.getUTCMonth() + 1)) {
    return 'CARD_EXPIRED';
  }
  return null;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');

  constructor(private readonly prisma: PrismaService) {}

  async create({ orderId, amountCents, currency, card }: CreatePaymentDto) {
    const existing = await this.prisma.payment.findUnique({ where: { orderId } });
    if (existing) return replayPayment(existing, amountCents);

    const cardLast4 = card.number.slice(-4);
    const reason = rejectionReason(card, cardLast4);
    try {
      const payment = await this.prisma.payment.create({
        data: { orderId, amountCents, currency, cardLast4, reason, status: reason ? 'REJECTED' : 'APPROVED' },
      });
      this.logger.log('Pago registrado', { orderId, status: payment.status, reason, cardLast4 });
      return { created: true, payment: paymentResponse(payment) };
    } catch (error) {
      // Si otra petición ganó la carrera, aplicar la misma regla de idempotencia.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.prisma.payment.findUnique({ where: { orderId } });
        if (winner) return replayPayment(winner, amountCents);
      }
      throw error;
    }
  }

  async findByOrder(orderId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { orderId } });
    if (!payment) throw new AppException(404, 'NOT_FOUND', 'La orden no tiene una transacción');
    return paymentResponse(payment);
  }
}
