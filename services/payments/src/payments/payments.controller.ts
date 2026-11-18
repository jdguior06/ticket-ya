import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { InternalKeyGuard } from '../common/auth/internal-key.guard.js';
import { CreatePaymentDto } from './dto.js';
import { PaymentsService } from './payments.service.js';

@Controller('payments')
@UseGuards(InternalKeyGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  async create(@Body() dto: CreatePaymentDto, @Res({ passthrough: true }) res: Response) {
    const { created, payment } = await this.payments.create(dto);
    res.status(created ? 201 : 200);
    return payment;
  }

  @Get('order/:orderId')
  findByOrder(@Param('orderId', new ParseUUIDPipe({ version: '4' })) orderId: string) {
    return this.payments.findByOrder(orderId);
  }
}
