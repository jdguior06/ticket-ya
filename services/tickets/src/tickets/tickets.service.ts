import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../common/errors/app-exception.js';
import { Prisma, type Ticket } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CODE_PATTERN, type IssueTicketsDto, type ValidateQuery } from './dto.js';
import { StorageService } from './storage.service.js';
import { generateTicketCode } from './ticket-code.js';
import { TicketPdfService } from './ticket-pdf.service.js';

const MAX_CODE_ATTEMPTS = 3;

@Injectable()
export class TicketsService {
  private readonly logger = new Logger('Tickets');
  private readonly publicBase: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: TicketPdfService,
    private readonly storage: StorageService,
    config: ConfigService,
  ) {
    this.publicBase = (config.get<string>('TICKETS_PUBLIC_BASE_PATH') ?? '/api/tickets').replace(/\/$/, '');
  }

  /** Objeto entrada del contrato (docs/CONTRATOS.md §7). */
  toResponse(t: Ticket) {
    return {
      id: t.id,
      code: t.code,
      orderId: t.orderId,
      userId: t.userId,
      eventId: t.eventId,
      eventName: t.eventName,
      venue: t.venue,
      eventStartsAt: t.eventStartsAt,
      sectorName: t.sectorName,
      holderName: t.holderName,
      status: t.status,
      pdfUrl: `${this.publicBase}/${t.id}/pdf`,
      createdAt: t.createdAt,
    };
  }

  // ---------- Emisión (orders) ----------

  /**
   * Emite una entrada por asiento, con su PDF. Idempotente por orderId:
   * si orders reintenta, se completan las que falten y se devuelven las mismas.
   * Devuelve created=true si en esta llamada se creó al menos una entrada.
   */
  async issue(dto: IssueTicketsDto): Promise<{ created: boolean; tickets: ReturnType<TicketsService['toResponse']>[] }> {
    const { tickets, created } = await this.createRows(dto);

    // PDFs fuera de la transacción: se generan los que falten (también sirve para reintentos).
    for (const ticket of tickets) {
      if (ticket.pdfPath && (await this.storage.exists(ticket.pdfPath))) continue;
      const pdfPath = await this.pdf.generate(ticket, dto.quantity);
      ticket.pdfPath = pdfPath;
      await this.prisma.ticket.update({ where: { id: ticket.id }, data: { pdfPath } });
    }

    if (created > 0) this.logger.log(`Emitidas ${created} entrada(s) order=${dto.orderId} event=${dto.event.id}`);
    return { created: created > 0, tickets: tickets.map((t) => this.toResponse(t)) };
  }

  private async createRows(dto: IssueTicketsDto, attempt = 1): Promise<{ tickets: Ticket[]; created: number }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Candado por orden: dos pedidos simultáneos de la misma orden se ejecutan uno tras otro.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.orderId}))`;

        const existing = await tx.ticket.findMany({ where: { orderId: dto.orderId }, orderBy: { seq: 'asc' } });
        if (existing.length > 0) {
          const first = existing[0];
          if (first.userId !== dto.userId || first.eventId !== dto.event.id || first.sectorId !== dto.sector.id) {
            throw new AppException(409, 'IDEMPOTENCY_CONFLICT', 'La orden ya tiene entradas con otros datos');
          }
          if (existing.length > dto.quantity) {
            throw new AppException(409, 'IDEMPOTENCY_CONFLICT', 'La orden ya tiene más entradas que las pedidas');
          }
        }

        const have = new Set(existing.map((t) => t.seq));
        const created: Ticket[] = [];
        for (let seq = 1; seq <= dto.quantity; seq++) {
          if (have.has(seq)) continue;
          created.push(
            await tx.ticket.create({
              data: {
                code: generateTicketCode(),
                orderId: dto.orderId,
                seq,
                userId: dto.userId,
                holderName: dto.holderName,
                holderEmail: dto.holderEmail.toLowerCase(),
                eventId: dto.event.id,
                eventName: dto.event.name,
                venue: dto.event.venue,
                eventStartsAt: new Date(dto.event.startsAt),
                sectorId: dto.sector.id,
                sectorName: dto.sector.name,
              },
            }),
          );
        }
        const all = [...existing, ...created].sort((a, b) => a.seq - b.seq);
        return { tickets: all, created: created.length };
      });
    } catch (err) {
      // Choque de código aleatorio (prácticamente imposible: 2^60 combinaciones). Se reintenta todo.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && attempt < MAX_CODE_ATTEMPTS) {
        this.logger.warn(`Código repetido, reintentando order=${dto.orderId}`);
        return this.createRows(dto, attempt + 1);
      }
      throw err;
    }
  }

  // ---------- Cliente ----------

  async listMine(userId: string) {
    const tickets = await this.prisma.ticket.findMany({
      where: { userId },
      orderBy: [{ eventStartsAt: 'desc' }, { orderId: 'asc' }, { seq: 'asc' }],
    });
    return tickets.map((t) => this.toResponse(t));
  }

  async listByOrder(userId: string, orderId: string) {
    const tickets = await this.prisma.ticket.findMany({ where: { orderId, userId }, orderBy: { seq: 'asc' } });
    if (tickets.length === 0) throw new AppException(404, 'NOT_FOUND', 'No hay entradas para esa orden');
    return tickets.map((t) => this.toResponse(t));
  }

  /** Devuelve la ruta absoluta del PDF; si el archivo se perdió, lo vuelve a generar. */
  async pdfFor(userId: string, ticketId: string): Promise<{ path: string; filename: string }> {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    // 404 también si es de otro usuario: no se revela que existe.
    if (!ticket || ticket.userId !== userId) throw new AppException(404, 'NOT_FOUND', 'Entrada no encontrada');

    if (!ticket.pdfPath || !(await this.storage.exists(ticket.pdfPath))) {
      const total = await this.prisma.ticket.count({ where: { orderId: ticket.orderId } });
      const pdfPath = await this.pdf.generate(ticket, total);
      await this.prisma.ticket.update({ where: { id: ticket.id }, data: { pdfPath } });
      ticket.pdfPath = pdfPath;
      this.logger.warn(`PDF regenerado ticket=${ticket.id}`);
    }
    return { path: this.storage.resolve(ticket.pdfPath), filename: `entrada-${ticket.code}.pdf` };
  }

  // ---------- Validación (checkin) ----------

  async validate(query: ValidateQuery) {
    if (!CODE_PATTERN.test(query.code)) return { valid: false, reason: 'INVALID_CODE', ticket: null };

    const ticket = await this.prisma.ticket.findUnique({ where: { code: query.code } });
    if (!ticket) return { valid: false, reason: 'INVALID_CODE', ticket: null };

    const summary = {
      id: ticket.id,
      code: ticket.code,
      eventId: ticket.eventId,
      holderName: ticket.holderName,
      sectorName: ticket.sectorName,
    };
    if (ticket.eventId !== query.eventId) return { valid: false, reason: 'WRONG_EVENT', ticket: summary };
    if (ticket.status !== 'VALID') return { valid: false, reason: 'TICKET_VOID', ticket: summary };
    return { valid: true, reason: null, ticket: summary };
  }
}
