import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../common/errors/app-exception.js';
import type { AuthUser } from '../common/auth/auth.types.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateEventDto, ListEventsQuery, SectorInputDto, UpdateEventDto } from './dto.js';
import { toEventResponse, type EventWithSectors } from './events.mapper.js';
import { ImagesService } from './images.service.js';

const LIST_LIMIT = 100;

function assertUniqueSectorNames(sectors: SectorInputDto[]): void {
  const names = sectors.map((s) => s.name.toLowerCase());
  if (new Set(names).size !== names.length) {
    throw new AppException(400, 'VALIDATION_ERROR', 'Los sectores no pueden repetir nombre', {
      fields: { sectors: ['Nombres de sector repetidos'] },
    });
  }
}

function parseFutureDate(value: string): Date {
  const date = new Date(value);
  if (date.getTime() <= Date.now()) {
    throw new AppException(400, 'VALIDATION_ERROR', 'La fecha del evento debe ser futura', {
      fields: { startsAt: ['Debe ser una fecha futura'] },
    });
  }
  return date;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger('Events');

  private readonly publicBasePath: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ImagesService,
    config: ConfigService,
  ) {
    this.publicBasePath = (config.get<string>('EVENTS_PUBLIC_BASE_PATH') ?? '/api/events').replace(/\/$/, '');
  }

  // ---------- Lectura ----------

  async listPublished(query: ListEventsQuery) {
    // Sin `from`: solo eventos futuros (cartelera). Con `from`: se aceptan hasta 2 días atrás,
    // para que el portero vea el evento de hoy aunque ya haya empezado.
    const minFrom = new Date(Date.now() - 2 * 86400e3);
    const requested = query.from ? new Date(query.from) : new Date();
    const where: Prisma.EventWhereInput = {
      status: 'PUBLISHED',
      startsAt: { gte: requested < minFrom ? minFrom : requested },
    };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { venue: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const events = await this.prisma.event.findMany({
      where,
      include: { sectors: true },
      orderBy: { startsAt: 'asc' },
      take: LIST_LIMIT,
    });
    return events.map(toEventResponse);
  }

  async listMine(user: AuthUser) {
    const events = await this.prisma.event.findMany({
      where: { organizerId: user.id },
      include: { sectors: true },
      orderBy: { startsAt: 'desc' },
    });
    return events.map(toEventResponse);
  }

  /** Detalle público: si no está publicado, solo lo ve su organizador. */
  async getPublic(id: string, user?: AuthUser) {
    const event = await this.findOrFail(id);
    if (event.status !== 'PUBLISHED' && event.organizerId !== user?.id) {
      throw new AppException(404, 'NOT_FOUND', 'Evento no encontrado');
    }
    return toEventResponse(event);
  }

  /** Para otros servicios (/internal): cualquier estado. */
  async getInternal(id: string) {
    return toEventResponse(await this.findOrFail(id));
  }

  // ---------- Escritura (organizador) ----------

  async create(user: AuthUser, dto: CreateEventDto) {
    assertUniqueSectorNames(dto.sectors);
    const startsAt = parseFutureDate(dto.startsAt);

    const event = await this.prisma.event.create({
      data: {
        organizerId: user.id,
        name: dto.name,
        description: dto.description ?? '',
        venue: dto.venue,
        startsAt,
        imageUrl: dto.imageUrl ?? null,
        sectors: {
          create: dto.sectors.map((s) => ({
            name: s.name,
            priceCents: s.priceCents,
            capacity: s.capacity,
            available: s.capacity,
          })),
        },
      },
      include: { sectors: true },
    });
    this.logger.log(`Evento creado id=${event.id} organizer=${user.id}`);
    return toEventResponse(event);
  }

  async update(user: AuthUser, id: string, dto: UpdateEventDto) {
    const current = await this.findOwnedOrFail(user, id);
    if (current.status === 'CANCELLED') {
      throw new AppException(409, 'EVENT_NOT_EDITABLE', 'Un evento cancelado no se puede editar');
    }
    if (dto.sectors) assertUniqueSectorNames(dto.sectors);
    const startsAt = dto.startsAt ? parseFutureDate(dto.startsAt) : undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          venue: dto.venue,
          startsAt,
          imageUrl: dto.imageUrl,
        },
      });

      if (!dto.sectors) return;

      const existingIds = new Set(current.sectors.map((s) => s.id));
      const keepIds = new Set(dto.sectors.filter((s) => s.id).map((s) => s.id as string));

      for (const id of keepIds) {
        if (!existingIds.has(id)) {
          throw new AppException(404, 'NOT_FOUND', `El sector ${id} no pertenece a este evento`);
        }
      }

      // 1) Eliminar sectores que ya no vienen (solo si nunca tuvieron reservas).
      for (const sector of current.sectors.filter((s) => !keepIds.has(s.id))) {
        const reservations = await tx.reservation.count({ where: { sectorId: sector.id } });
        if (reservations > 0) {
          throw new AppException(409, 'SECTOR_HAS_SALES', `El sector "${sector.name}" tiene ventas y no se puede eliminar`);
        }
        await tx.sector.delete({ where: { id: sector.id } });
      }

      // 2) Actualizar o crear.
      for (const input of dto.sectors) {
        if (!input.id) {
          await tx.sector.create({
            data: {
              eventId: id,
              name: input.name,
              priceCents: input.priceCents,
              capacity: input.capacity,
              available: input.capacity,
            },
          });
          continue;
        }
        // Cambio de cupo atómico: el disponible se ajusta por la diferencia y
        // nunca se baja el cupo por debajo de lo vendido (capacity - available).
        const changed = await tx.$executeRaw`
          UPDATE sectors
             SET name = ${input.name},
                 price_cents = ${input.priceCents},
                 available = available + (${input.capacity} - capacity),
                 capacity = ${input.capacity},
                 updated_at = NOW()
           WHERE id = ${input.id}::uuid
             AND (capacity - available) <= ${input.capacity}`;
        if (changed === 0) {
          throw new AppException(409, 'CAPACITY_BELOW_SOLD', `El cupo de "${input.name}" no puede ser menor a lo ya vendido`);
        }
      }
    });

    // Si se cambió la foto por un enlace externo, la foto subida ya no se usa.
    if (dto.imageUrl !== undefined) await this.images.remove(id);

    this.logger.log(`Evento actualizado id=${id}`);
    return toEventResponse(await this.findOrFail(id));
  }

  async publish(user: AuthUser, id: string) {
    const event = await this.findOwnedOrFail(user, id);
    if (event.status !== 'DRAFT') {
      throw new AppException(409, 'INVALID_STATUS', 'Solo se puede publicar un evento en borrador');
    }
    if (event.sectors.length === 0) {
      throw new AppException(409, 'NO_SECTORS', 'El evento necesita al menos un sector');
    }
    if (event.startsAt.getTime() <= Date.now()) {
      throw new AppException(409, 'EVENT_IN_PAST', 'No se puede publicar un evento con fecha pasada');
    }
    const updated = await this.prisma.event.update({
      where: { id },
      data: { status: 'PUBLISHED' },
      include: { sectors: true },
    });
    this.logger.log(`Evento publicado id=${id}`);
    return toEventResponse(updated);
  }

  async cancel(user: AuthUser, id: string) {
    const event = await this.findOwnedOrFail(user, id);
    if (event.status === 'CANCELLED') return toEventResponse(event);
    const updated = await this.prisma.event.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: { sectors: true },
    });
    this.logger.log(`Evento cancelado id=${id}`);
    return toEventResponse(updated);
  }

  // ---------- Foto ----------

  /** Sube o reemplaza la foto. imageUrl lleva ?v= para que el navegador no muestre la anterior. */
  async setImage(user: AuthUser, id: string, data: Buffer) {
    const event = await this.findOwnedOrFail(user, id);
    if (event.status === 'CANCELLED') {
      throw new AppException(409, 'EVENT_NOT_EDITABLE', 'Un evento cancelado no se puede editar');
    }
    await this.images.save(id, data);
    const updated = await this.prisma.event.update({
      where: { id },
      data: { imageUrl: `${this.publicBasePath}/${id}/image?v=${Date.now()}` },
      include: { sectors: true },
    });
    return toEventResponse(updated);
  }

  async removeImage(user: AuthUser, id: string) {
    const event = await this.findOwnedOrFail(user, id);
    if (event.status === 'CANCELLED') {
      throw new AppException(409, 'EVENT_NOT_EDITABLE', 'Un evento cancelado no se puede editar');
    }
    await this.images.remove(id);
    const updated = await this.prisma.event.update({ where: { id }, data: { imageUrl: null }, include: { sectors: true } });
    this.logger.log(`Foto quitada evento=${id}`);
    return toEventResponse(updated);
  }

  /** Archivo de la foto para servirlo. Pública: la cartelera la muestra sin sesión. */
  async imageFile(id: string) {
    const file = await this.images.find(id);
    if (!file) throw new AppException(404, 'NOT_FOUND', 'El evento no tiene foto');
    return file;
  }

  // ---------- Auxiliares ----------

  private async findOrFail(id: string): Promise<EventWithSectors> {
    const event = await this.prisma.event.findUnique({ where: { id }, include: { sectors: true } });
    if (!event) throw new AppException(404, 'NOT_FOUND', 'Evento no encontrado');
    return event;
  }

  private async findOwnedOrFail(user: AuthUser, id: string): Promise<EventWithSectors> {
    const event = await this.findOrFail(id);
    if (event.organizerId !== user.id) {
      // 404 y no 403: no revelamos eventos de otros organizadores.
      throw new AppException(404, 'NOT_FOUND', 'Evento no encontrado');
    }
    return event;
  }
}
