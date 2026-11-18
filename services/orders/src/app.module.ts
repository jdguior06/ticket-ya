import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServiceClients } from './clients/clients.js';
import { JwtAuthModule } from './common/auth/jwt-auth.module.js';
import { CommonModule } from './common/common.module.js';
import { createEnvValidator } from './common/config/env.js';
import { HEALTH_CHECKS, HealthController, type HealthCheck } from './common/health/health.controller.js';
import { OrderWorkflow } from './orders/order-workflow.service.js';
import { OrdersController } from './orders/orders.controller.js';
import { OrdersService } from './orders/orders.service.js';
import { Reconciler } from './orders/reconciler.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PrismaService } from './prisma/prisma.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: createEnvValidator(
        [
          'PORT',
          'DATABASE_URL',
          'JWT_PUBLIC_KEY_PATH',
          'INTERNAL_API_KEY',
          'EVENTS_URL',
          'PAYMENTS_URL',
          'TICKETS_URL',
          'NOTIFICATIONS_URL',
          'WEB_BASE_URL',
        ],
        {
          SERVICE_NAME: 'orders',
          LOG_LEVEL: 'info',
          HTTP_TIMEOUT_MS: '5000',
          RECONCILE_INTERVAL_MS: '60000',
          RECONCILE_MIN_AGE_MS: '60000',
          PENDING_TIMEOUT_MS: '600000',
        },
      ),
    }),
    CommonModule,
    PrismaModule,
    JwtAuthModule,
  ],
  controllers: [HealthController, OrdersController],
  providers: [
    ServiceClients,
    OrderWorkflow,
    OrdersService,
    Reconciler,
    {
      provide: HEALTH_CHECKS,
      inject: [PrismaService],
      // Solo la BD: orders puede mostrar el historial aunque los demás servicios estén caídos.
      useFactory: (prisma: PrismaService): HealthCheck[] => [{ name: 'db', run: () => prisma.$queryRaw`SELECT 1` }],
    },
  ],
})
export class AppModule {}
