import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { InternalKeyGuard } from '../common/auth/internal-key.guard.js';
import { OrderConfirmedDto } from './dto.js';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
@UseGuards(InternalKeyGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('order-confirmed')
  @HttpCode(202)
  orderConfirmed(@Body() dto: OrderConfirmedDto) {
    return this.notifications.orderConfirmed(dto);
  }
}
