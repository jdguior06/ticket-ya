import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { InternalKeyGuard } from '../common/auth/internal-key.guard.js';
import { OrderConfirmedDto, WelcomeDto } from './dto.js';
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

  /** Correo de bienvenida (opcional en el PDF). auth lo pide sin esperar la respuesta. */
  @Post('welcome')
  @HttpCode(202)
  welcome(@Body() dto: WelcomeDto) {
    return this.notifications.welcome(dto);
  }
}
