import type { Event, Sector } from '../generated/prisma/client.js';

export type EventWithSectors = Event & { sectors: Sector[] };

/** Objeto evento del contrato (docs/CONTRATOS.md §4). */
export function toEventResponse(event: EventWithSectors) {
  return {
    id: event.id,
    organizerId: event.organizerId,
    name: event.name,
    description: event.description,
    venue: event.venue,
    startsAt: event.startsAt,
    imageUrl: event.imageUrl,
    status: event.status,
    sectors: [...event.sectors]
      .sort((a, b) => a.priceCents - b.priceCents || a.name.localeCompare(b.name))
      .map((s) => ({
        id: s.id,
        name: s.name,
        priceCents: s.priceCents,
        capacity: s.capacity,
        available: s.available,
      })),
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}
