import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { InternalKeyGuard } from '../common/auth/internal-key.guard.js';
import { IssueTicketsDto, ValidateQuery } from './dto.js';
import { TicketsService } from './tickets.service.js';

/** Rutas solo para otros servicios (X-Internal-Key). Nginx nunca las expone. */
@Controller('internal/tickets')
@UseGuards(InternalKeyGuard)
export class InternalTicketsController {
  constructor(private readonly tickets: TicketsService) {}

  /** orders: emitir entradas. 201 si se creó alguna, 200 si ya existían todas. */
  @Post('issue')
  async issue(@Body() dto: IssueTicketsDto, @Res({ passthrough: true }) res: Response) {
    const { created, tickets } = await this.tickets.issue(dto);
    res.status(created ? 201 : 200);
    return { orderId: dto.orderId, tickets };
  }

  /** checkin: ¿el código existe, es de este evento y es válido? Siempre 200. */
  @Get('validate')
  validate(@Query() query: ValidateQuery) {
    return this.tickets.validate(query);
  }
}
