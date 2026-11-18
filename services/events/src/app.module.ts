import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtAuthModule } from './common/auth/jwt-auth.module.js';
import { OptionalJwtGuard } from './common/auth/optional-jwt.guard.js';
import { CommonModule } from './common/common.module.js';
import { createEnvValidator } from './common/config/env.js';
import { HEALTH_CHECKS, HealthController, type HealthCheck } from './common/health/health.controller.js';
import { EventsController } from './events/events.controller.js';
import { EventsService } from './events/events.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PrismaService } from './prisma/prisma.service.js';
import { InternalController } from './reservations/internal.controller.js';
import { ReservationsService } from './reservations/reservations.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: createEnvValidator(['PORT', 'DATABASE_URL', 'JWT_PUBLIC_KEY_PATH', 'INTERNAL_API_KEY'], {
        SERVICE_NAME: 'events',
        LOG_LEVEL: 'info',
      }),
    }),
    CommonModule,
    PrismaModule,
    JwtAuthModule,
  ],
  controllers: [HealthController, EventsController, InternalController],
  providers: [
    EventsService,
    ReservationsService,
    OptionalJwtGuard,
    {
      provide: HEALTH_CHECKS,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): HealthCheck[] => [{ name: 'db', run: () => prisma.$queryRaw`SELECT 1` }],
    },
  ],
})
export class AppModule {}
