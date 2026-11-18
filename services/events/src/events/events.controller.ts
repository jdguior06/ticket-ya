import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { OptionalJwtGuard } from '../common/auth/optional-jwt.guard.js';
import { Roles, RolesGuard } from '../common/auth/roles.guard.js';
import type { AuthUser } from '../common/auth/auth.types.js';
import { uuidParam } from '../common/uuid-param.js';
import { CreateEventDto, ListEventsQuery, UpdateEventDto } from './dto.js';
import { EventsService } from './events.service.js';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /** Cartelera pública: solo publicados y futuros. */
  @Get()
  list(@Query() query: ListEventsQuery) {
    return this.events.listPublished(query);
  }

  // Declarada antes de ':id' para que "mine" no se tome como id.
  @Get('mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER')
  mine(@CurrentUser() user: AuthUser) {
    return this.events.listMine(user);
  }

  @Get(':id')
  @UseGuards(OptionalJwtGuard)
  detail(@Param('id', uuidParam('Evento')) id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.events.getPublic(id, req.user);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEventDto) {
    return this.events.create(user, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER')
  update(@CurrentUser() user: AuthUser, @Param('id', uuidParam('Evento')) id: string, @Body() dto: UpdateEventDto) {
    return this.events.update(user, id, dto);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER')
  publish(@CurrentUser() user: AuthUser, @Param('id', uuidParam('Evento')) id: string) {
    return this.events.publish(user, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER')
  cancel(@CurrentUser() user: AuthUser, @Param('id', uuidParam('Evento')) id: string) {
    return this.events.cancel(user, id);
  }
}
