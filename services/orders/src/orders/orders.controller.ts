import { Body, Controller, Get, Headers, HttpCode, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { Roles, RolesGuard } from '../common/auth/roles.guard.js';
import type { AuthUser } from '../common/auth/auth.types.js';
import { AppException } from '../common/errors/app-exception.js';
import { uuidParam } from '../common/uuid-param.js';
import { CreateOrderDto } from './dto.js';
import { OrdersService } from './orders.service.js';

type RequestWithId = Request & { requestId?: string };

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** Compra. 201 nueva; 200 si la Idempotency-Key ya se usó (devuelve la misma orden). */
  @Post()
  @Roles('CUSTOMER')
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: RequestWithId,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (idempotencyKey !== undefined && !/^[A-Za-z0-9_-]{8,100}$/.test(idempotencyKey)) {
      throw new AppException(400, 'VALIDATION_ERROR', 'Idempotency-Key inválida (8 a 100 caracteres: letras, números, - o _)');
    }
    const { created, order } = await this.orders.purchase(user, dto, idempotencyKey, req.requestId);
    res.status(created ? 201 : 200);
    return order;
  }

  @Get('mine')
  @Roles('CUSTOMER')
  mine(@CurrentUser() user: AuthUser) {
    return this.orders.listMine(user.id);
  }

  // Antes de ':id' para que "reports" no se tome como id.
  @Get('reports/events/:eventId')
  @Roles('ORGANIZER')
  report(@CurrentUser() user: AuthUser, @Param('eventId', uuidParam('Evento')) eventId: string, @Req() req: RequestWithId) {
    return this.orders.eventReport(user, eventId, req.requestId);
  }

  @Get(':id')
  @Roles('CUSTOMER')
  detail(@CurrentUser() user: AuthUser, @Param('id', uuidParam('Orden')) id: string) {
    return this.orders.getMine(user.id, id);
  }

  @Post(':id/retry-tickets')
  @HttpCode(200)
  @Roles('CUSTOMER')
  retry(@CurrentUser() user: AuthUser, @Param('id', uuidParam('Orden')) id: string, @Req() req: RequestWithId) {
    return this.orders.retryTickets(user.id, id, req.requestId);
  }
}
