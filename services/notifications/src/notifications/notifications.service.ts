import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { AppException } from '../common/errors/app-exception.js';
import type { OrderConfirmedDto, WelcomeDto } from './dto.js';
import { orderConfirmedEmail, welcomeEmail, type Email } from './templates.js';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');
  private readonly transport: ReturnType<typeof nodemailer.createTransport>;
  private readonly from: { name: string; address: string };
  private readonly webBaseUrl: string;

  constructor(config: ConfigService) {
    const timeout = Number(config.getOrThrow('SMTP_TIMEOUT_MS'));
    this.from = { name: 'EntradasYa', address: config.getOrThrow<string>('SMTP_FROM') };
    this.webBaseUrl = (config.get<string>('WEB_BASE_URL') ?? 'https://localhost:5173').replace(/\/$/, '');
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
    const eventStartsAt = new Date(order.eventStartsAt);
    if (Number.isNaN(eventStartsAt.getTime())) {
      throw new AppException(400, 'VALIDATION_ERROR', 'La fecha del evento no es válida');
    }

    const email = orderConfirmedEmail({ ...order, eventStartsAt });
    const messageId = await this.send(order.to, email, `la orden ${order.orderId}`);
    return { status: 'SENT', messageId };
  }

  async welcome(dto: WelcomeDto) {
    const email = welcomeEmail({ name: dto.name, webUrl: `${this.webBaseUrl}/` });
    const messageId = await this.send(dto.to, email, 'la bienvenida');
    return { status: 'SENT', messageId };
  }

  private async send(to: string, email: Email, what: string): Promise<string> {
    try {
      const result = await this.transport.sendMail({ from: this.from, to, subject: email.subject, text: email.text, html: email.html });
      this.logger.log(`Correo enviado: ${what}`);
      return result.messageId;
    } catch (err) {
      this.logger.warn(`SMTP no disponible para ${what}`, {
        message: err instanceof Error ? err.message : String(err),
      });
      throw new AppException(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo enviar el correo');
    }
  }
}
