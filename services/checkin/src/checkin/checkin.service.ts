import { Injectable } from '@nestjs/common';
import { Prisma, type CheckIn } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ScanDto } from './dto.js';
import { TicketsClient } from './tickets.client.js';

function summarizeTicket({ code, holderName, sectorName }: Pick<CheckIn, 'code' | 'holderName' | 'sectorName'>) {
  return { code, holderName, sectorName };
}

@Injectable()
export class CheckinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tickets: TicketsClient,
  ) {}

  async scan(dto: ScanDto, doormanId: string, requestId?: string) {
    if (!dto.code) return { allowed: false, reason: 'INVALID_CODE', ticket: null };

    const eventId = dto.eventId.toLowerCase();
    const validation = await this.tickets.validate(dto.code, eventId, requestId);
    if (!validation.valid) {
      return {
        allowed: false,
        reason: validation.reason,
        ticket: validation.ticket ? summarizeTicket(validation.ticket) : null,
      };
    }

    const ticket = summarizeTicket(validation.ticket);
    const ticketId = validation.ticket.id;
    let checkIn: CheckIn;
    try {
      checkIn = await this.prisma.checkIn.create({ data: { ticketId, eventId, doormanId, ...ticket } });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err;

      // La clave primaria de la entrada garantiza un único ingreso, incluso entre instancias.
      const first = await this.prisma.checkIn.findUniqueOrThrow({ where: { ticketId } });
      return {
        allowed: false,
        reason: 'ALREADY_USED',
        firstCheckedInAt: first.checkedInAt,
        ticket: summarizeTicket(first),
      };
    }

    const totalCheckedIn = await this.prisma.checkIn.count({ where: { eventId } });
    return { allowed: true, reason: null, checkedInAt: checkIn.checkedInAt, ticket, totalCheckedIn };
  }

  async stats(eventId: string) {
    const totals = await this.prisma.checkIn.aggregate({
      where: { eventId },
      _count: true,
      _max: { checkedInAt: true },
    });
    return { eventId, totalCheckedIn: totals._count, lastCheckInAt: totals._max.checkedInAt };
  }

  recent(eventId: string, limit: number) {
    return this.prisma.checkIn.findMany({
      where: { eventId },
      orderBy: [{ checkedInAt: 'desc' }, { ticketId: 'desc' }],
      take: limit,
      select: { code: true, holderName: true, sectorName: true, checkedInAt: true, doormanId: true },
    });
  }
}
