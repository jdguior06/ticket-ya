import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../common/errors/app-exception.js';
import { Prisma, type Reservation } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ReserveDto } from '../events/dto.js';

type ReservationFull = Reservation & {
  event: { id: string; name: string; venue: string; startsAt: Date; organizerId: string };
  sector: { id: string; name: string };
};

const INCLUDE = {
  event: { select: { id: true, name: true, venue: true, startsAt: true, organizerId: true } },
  sector: { select: { id: true, name: true } },
} as const;

function toResponse(r: ReservationFull) {
  return {
    reservationId: r.id,
    orderId: r.orderId,
    status: r.status,
    event: r.event,
    sector: r.sector,
    quantity: r.quantity,
    unitPriceCents: r.unitPriceCents,
    totalCents: r.totalCents,
  };
}

/**
 * Reserva y libera cupos a pedido de orders.
 * Reglas:
 *  - Idempotente por orderId (reintentos de orders no descuentan dos veces).
 *  - Nunca se vende más que el cupo: el descuento es un UPDATE atómico con "available >= cantidad".
 */
@Injectable()
export class ReservationsService {
  private readonly logger = new Logger('Reservations');

  constructor(private readonly prisma: PrismaService) {}

  /** Devuelve { created, body }: created=false si la reserva ya existía. */
  async reserve(dto: ReserveDto): Promise<{ created: boolean; body: ReturnType<typeof toResponse> }> {
    const existing = await this.findByOrder(dto.orderId);
    if (existing) return { created: false, body: toResponse(existing) };

    try {
      const reservation = await this.prisma.$transaction(async (tx) => {
        const sector = await tx.sector.findUnique({ where: { id: dto.sectorId }, include: { event: true } });
        if (!sector || sector.eventId !== dto.eventId) {
          throw new AppException(404, 'NOT_FOUND', 'Evento o sector no encontrado');
        }
        if (sector.event.status !== 'PUBLISHED' || sector.event.startsAt.getTime() <= Date.now()) {
          throw new AppException(409, 'EVENT_NOT_AVAILABLE', 'El evento no está disponible para la venta');
        }

        const taken = await tx.$executeRaw`
          UPDATE sectors
             SET available = available - ${dto.quantity}, updated_at = NOW()
           WHERE id = ${dto.sectorId}::uuid AND available >= ${dto.quantity}`;
        if (taken === 0) {
          throw new AppException(409, 'SOLD_OUT', `No hay cupo suficiente en el sector ${sector.name}`, {
            sectorId: sector.id,
          });
        }

        return tx.reservation.create({
          data: {
            orderId: dto.orderId,
            eventId: dto.eventId,
            sectorId: dto.sectorId,
            quantity: dto.quantity,
            unitPriceCents: sector.priceCents,
            totalCents: sector.priceCents * dto.quantity,
          },
          include: INCLUDE,
        });
      });

      this.logger.log(`Reserva order=${dto.orderId} sector=${dto.sectorId} cantidad=${dto.quantity}`);
      return { created: true, body: toResponse(reservation) };
    } catch (err) {
      // Dos pedidos simultáneos con el mismo orderId: el segundo choca con el UNIQUE
      // y la transacción se revierte (no descuenta). Devolvemos la reserva del primero.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const winner = await this.findByOrder(dto.orderId);
        if (winner) return { created: false, body: toResponse(winner) };
      }
      if (err instanceof AppException && err.code === 'SOLD_OUT') {
        this.logger.warn(`Agotado order=${dto.orderId} sector=${dto.sectorId} cantidad=${dto.quantity}`);
      }
      throw err;
    }
  }

  /** Libera los cupos de una orden. Idempotente: si ya estaba liberada responde igual. */
  async release(orderId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({ where: { orderId } });
      if (!reservation) throw new AppException(404, 'NOT_FOUND', 'No hay reserva para esa orden');

      // Solo un pedido puede pasar de RESERVED a RELEASED (evita devolver el cupo dos veces).
      const switched = await tx.reservation.updateMany({
        where: { orderId, status: 'RESERVED' },
        data: { status: 'RELEASED', releasedAt: new Date() },
      });
      if (switched.count === 1) {
        await tx.$executeRaw`
          UPDATE sectors
             SET available = available + ${reservation.quantity}, updated_at = NOW()
           WHERE id = ${reservation.sectorId}::uuid`;
        return { released: true, quantity: reservation.quantity, sectorId: reservation.sectorId };
      }
      return { released: false, quantity: 0, sectorId: reservation.sectorId };
    });

    if (result.released) {
      this.logger.log(`Liberado order=${orderId} sector=${result.sectorId} cantidad=${result.quantity}`);
    }
    return { orderId, status: 'RELEASED' as const };
  }

  private findByOrder(orderId: string): Promise<ReservationFull | null> {
    return this.prisma.reservation.findUnique({ where: { orderId }, include: INCLUDE });
  }
}
