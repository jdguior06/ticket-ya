import type { Order } from '../generated/prisma/client.js';

/** Objeto orden del contrato (docs/CONTRATOS.md §5). No expone datos internos. */
export function toOrderResponse(o: Order) {
  return {
    id: o.id,
    userId: o.userId,
    status: o.status,
    eventId: o.eventId,
    eventName: o.eventName,
    eventStartsAt: o.eventStartsAt,
    venue: o.venue,
    sectorId: o.sectorId,
    sectorName: o.sectorName,
    quantity: o.quantity,
    unitPriceCents: o.unitPriceCents,
    totalCents: o.totalCents,
    failureCode: o.failureCode,
    ticketsStatus: o.ticketsStatus,
    notificationStatus: o.notificationStatus,
    paidAt: o.paidAt,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

export type OrderResponse = ReturnType<typeof toOrderResponse>;
