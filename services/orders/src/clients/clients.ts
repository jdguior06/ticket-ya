import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClient, type CallResult } from '../common/http/http-client.js';
import type { CardDto } from '../orders/dto.js';

// Respuestas de los otros servicios según docs/CONTRATOS.md.

export interface ReservationResponse {
  reservationId: string;
  orderId: string;
  status: 'RESERVED' | 'RELEASED';
  event: { id: string; name: string; venue: string; startsAt: string; organizerId: string };
  sector: { id: string; name: string };
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

export interface PaymentResponse {
  paymentId: string;
  orderId: string;
  status: 'APPROVED' | 'REJECTED';
  reason: string | null;
  amountCents: number;
}

export interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Clientes de events, payments, tickets y notifications.
 * Todos usan HttpClient (timeout + X-Request-Id + X-Internal-Key).
 * Un servicio caído o lento lanza AppException 503 DEPENDENCY_UNAVAILABLE.
 */
@Injectable()
export class ServiceClients {
  private readonly urls: Record<'events' | 'payments' | 'tickets' | 'notifications', string>;

  constructor(
    private readonly http: HttpClient,
    config: ConfigService,
  ) {
    this.urls = {
      events: config.getOrThrow<string>('EVENTS_URL'),
      payments: config.getOrThrow<string>('PAYMENTS_URL'),
      tickets: config.getOrThrow<string>('TICKETS_URL'),
      notifications: config.getOrThrow<string>('NOTIFICATIONS_URL'),
    };
  }

  reserve(body: { orderId: string; eventId: string; sectorId: string; quantity: number }, requestId?: string) {
    return this.http.call<ReservationResponse | ErrorBody>('events', this.urls.events, '/internal/reservations', {
      method: 'POST',
      body,
      internal: true,
      requestId,
    });
  }

  release(orderId: string, requestId?: string): Promise<CallResult<unknown>> {
    return this.http.call('events', this.urls.events, `/internal/reservations/${orderId}/release`, {
      method: 'POST',
      internal: true,
      requestId,
    });
  }

  getEvent(eventId: string, requestId?: string) {
    return this.http.call<{ id: string; name: string; organizerId: string } | ErrorBody>(
      'events',
      this.urls.events,
      `/internal/events/${eventId}`,
      { internal: true, requestId },
    );
  }

  pay(body: { orderId: string; amountCents: number; currency: 'BOB'; card: CardDto }, requestId?: string) {
    return this.http.call<PaymentResponse | ErrorBody>('payments', this.urls.payments, '/payments', {
      method: 'POST',
      body,
      internal: true,
      requestId,
    });
  }

  getPayment(orderId: string, requestId?: string) {
    return this.http.call<PaymentResponse | ErrorBody>('payments', this.urls.payments, `/payments/order/${orderId}`, {
      internal: true,
      requestId,
    });
  }

  issueTickets(body: Record<string, unknown>, requestId?: string) {
    return this.http.call<{ orderId: string; tickets: unknown[] } | ErrorBody>(
      'tickets',
      this.urls.tickets,
      '/internal/tickets/issue',
      { method: 'POST', body, internal: true, requestId },
    );
  }

  notifyOrderConfirmed(body: Record<string, unknown>, requestId?: string) {
    return this.http.call<{ status: string } | ErrorBody>(
      'notifications',
      this.urls.notifications,
      '/notifications/order-confirmed',
      { method: 'POST', body, internal: true, requestId },
    );
  }
}
