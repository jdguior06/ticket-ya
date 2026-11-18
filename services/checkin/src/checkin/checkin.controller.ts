import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../common/auth/auth.types.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { Roles, RolesGuard } from '../common/auth/roles.guard.js';
import { uuidParam } from '../common/uuid-param.js';
import { CheckinService } from './checkin.service.js';
import { RecentQuery, ScanDto } from './dto.js';

@Controller('checkin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CheckinController {
  constructor(private readonly checkin: CheckinService) {}

  @Post('scan')
  @HttpCode(200)
  @Roles('DOORMAN')
  scan(@Body() dto: ScanDto, @CurrentUser() user: AuthUser, @Req() req: Request & { requestId?: string }) {
    return this.checkin.scan(dto, user.id, req.requestId);
  }

  @Get('events/:eventId/stats')
  @Roles('DOORMAN', 'ORGANIZER')
  stats(@Param('eventId', uuidParam('Evento')) eventId: string) {
    return this.checkin.stats(eventId.toLowerCase());
  }

  @Get('events/:eventId/recent')
  @Roles('DOORMAN', 'ORGANIZER')
  recent(@Param('eventId', uuidParam('Evento')) eventId: string, @Query() query: RecentQuery) {
    return this.checkin.recent(eventId.toLowerCase(), query.limit);
  }
}
