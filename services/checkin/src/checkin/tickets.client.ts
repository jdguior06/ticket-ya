import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../common/errors/app-exception.js';
import { HttpClient } from '../common/http/http-client.js';

interface TicketSummary {
  id: string;
  eventId: string;
  code: string;
  holderName: string;
  sectorName: string;
}

type TicketValidation =
  | { valid: true; reason: null; ticket: TicketSummary }
  | { valid: false; reason: 'INVALID_CODE' | 'WRONG_EVENT' | 'TICKET_VOID'; ticket: TicketSummary | null };

@Injectable()
export class TicketsClient {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    config: ConfigService,
  ) {
    this.baseUrl = config.getOrThrow<string>('TICKETS_URL');
  }

  async validate(code: string, eventId: string, requestId?: string): Promise<TicketValidation> {
    const query = new URLSearchParams({ code, eventId });
    const { status, data } = await this.http.call<TicketValidation | null>(
      'tickets',
      this.baseUrl,
      `/internal/tickets/validate?${query}`,
      { internal: true, requestId },
    );
    if (status !== 200 || (data?.valid !== true && data?.valid !== false) || (data.valid && !data.ticket)) {
      throw new AppException(503, 'DEPENDENCY_UNAVAILABLE', 'El servicio tickets no pudo validar la entrada', {
        service: 'tickets',
      });
    }
    return data;
  }
}
