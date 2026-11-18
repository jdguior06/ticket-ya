import { Body, Controller, Get, HttpCode, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { InternalKeyGuard } from '../common/auth/internal-key.guard.js';
import { uuidParam } from '../common/uuid-param.js';
import { ReserveDto } from '../events/dto.js';
import { EventsService } from '../events/events.service.js';
import { ReservationsService } from './reservations.service.js';

/** Rutas solo para otros servicios (X-Internal-Key). Nginx nunca las expone. */
@Controller('internal')
@UseGuards(InternalKeyGuard)
export class InternalController {
  constructor(
    private readonly reservations: ReservationsService,
    private readonly events: EventsService,
  ) {}

  /** 201 si se creó la reserva, 200 si ya existía para ese orderId. */
  @Post('reservations')
  async reserve(@Body() dto: ReserveDto, @Res({ passthrough: true }) res: Response) {
    const { created, body } = await this.reservations.reserve(dto);
    res.status(created ? 201 : 200);
    return body;
  }

  @Post('reservations/:orderId/release')
  @HttpCode(200)
  release(@Param('orderId', uuidParam('Reserva')) orderId: string) {
    return this.reservations.release(orderId);
  }

  @Get('events/:id')
  event(@Param('id', uuidParam('Evento')) id: string) {
    return this.events.getInternal(id);
  }
}
