import { createReadStream } from 'node:fs';
import { Controller, Get, Param, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { Roles, RolesGuard } from '../common/auth/roles.guard.js';
import type { AuthUser } from '../common/auth/auth.types.js';
import { uuidParam } from '../common/uuid-param.js';
import { TicketsService } from './tickets.service.js';

@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CUSTOMER')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.tickets.listMine(user.id);
  }

  @Get('order/:orderId')
  byOrder(@CurrentUser() user: AuthUser, @Param('orderId', uuidParam('Orden')) orderId: string) {
    return this.tickets.listByOrder(user.id, orderId);
  }

  @Get(':id/pdf')
  async pdf(
    @CurrentUser() user: AuthUser,
    @Param('id', uuidParam('Entrada')) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.tickets.pdfFor(user.id, id);
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(createReadStream(file.path), {
      type: 'application/pdf',
      disposition: `attachment; filename="${file.filename}"`,
    });
  }
}
