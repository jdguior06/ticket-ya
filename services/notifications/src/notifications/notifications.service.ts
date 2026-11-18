import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { AppException } from '../common/errors/app-exception.js';
import type { OrderConfirmedDto } from './dto.js';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');
  private readonly transport: ReturnType<typeof nodemailer.createTransport>;
  private readonly from: string;

  constructor(config: ConfigService) {
    const timeout = Number(config.getOrThrow('SMTP_TIMEOUT_MS'));
    this.from = config.getOrThrow<string>('SMTP_FROM');
    this.transport = nodemailer.createTransport({
      host: config.getOrThrow<string>('SMTP_HOST'),
      port: Number(config.getOrThrow('SMTP_PORT')),
      secure: false,
      dnsTimeout: timeout,
      connectionTimeout: timeout,
      greetingTimeout: timeout,
      socketTimeout: timeout,
    });
  }

  verify() {
    return this.transport.verify();
  }

  async orderConfirmed(order: OrderConfirmedDto) {
    const bolivianos = Math.floor(order.totalCents / 100);
    const centavos = String(order.totalCents % 100).padStart(2, '0');
    const text = [
      `Hola, ${order.customerName}.`,
      `Tu compra ${order.orderId} está confirmada.`,
      `Evento: ${order.eventName}`,
      `Lugar: ${order.venue}`,
      `Fecha: ${order.eventStartsAt}`,
      `Sector: ${order.sectorName}`,
      `Entradas: ${order.quantity}`,
      `Total: Bs ${bolivianos}.${centavos}`,
      `Tus entradas: ${order.ticketsUrl}`,
    ].join('\n');

    try {
      const result = await this.transport.sendMail({
        from: this.from,
        to: order.to,
        subject: 'EntradasYa: compra confirmada',
        text,
      });
      this.logger.log(`Confirmación enviada para la orden ${order.orderId}`);
      return { status: 'SENT', messageId: result.messageId };
    } catch {
      this.logger.warn(`SMTP no disponible para la orden ${order.orderId}`);
      throw new AppException(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo enviar el correo');
    }
  }
}
