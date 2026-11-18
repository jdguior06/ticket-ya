import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtAuthModule } from './common/auth/jwt-auth.module.js';
import { CommonModule } from './common/common.module.js';
import { createEnvValidator } from './common/config/env.js';
import { HEALTH_CHECKS, HealthController, type HealthCheck } from './common/health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PrismaService } from './prisma/prisma.service.js';
import { InternalTicketsController } from './tickets/internal.controller.js';
import { StorageService } from './tickets/storage.service.js';
import { TicketPdfService } from './tickets/ticket-pdf.service.js';
import { TicketsController } from './tickets/tickets.controller.js';
import { TicketsService } from './tickets/tickets.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: createEnvValidator(
        ['PORT', 'DATABASE_URL', 'JWT_PUBLIC_KEY_PATH', 'INTERNAL_API_KEY', 'TICKETS_STORAGE_DIR'],
        { SERVICE_NAME: 'tickets', LOG_LEVEL: 'info', TICKETS_PUBLIC_BASE_PATH: '/api/tickets' },
      ),
    }),
    CommonModule,
    PrismaModule,
    JwtAuthModule,
  ],
  controllers: [HealthController, TicketsController, InternalTicketsController],
  providers: [
    TicketsService,
    TicketPdfService,
    StorageService,
    {
      provide: HEALTH_CHECKS,
      inject: [PrismaService, StorageService],
      useFactory: (prisma: PrismaService, storage: StorageService): HealthCheck[] => [
        { name: 'db', run: () => prisma.$queryRaw`SELECT 1` },
        { name: 'storage', run: () => storage.checkWritable() },
      ],
    },
  ],
})
export class AppModule {}
