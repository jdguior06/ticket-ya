import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InternalKeyGuard } from './common/auth/internal-key.guard.js';
import { createEnvValidator } from './common/config/env.js';
import { HEALTH_CHECKS, HealthController, type HealthCheck } from './common/health/health.controller.js';
import { PaymentsController } from './payments/payments.controller.js';
import { PaymentsService } from './payments/payments.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PrismaService } from './prisma/prisma.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: createEnvValidator(
        ['PORT', 'INTERNAL_API_KEY', 'DATABASE_URL'],
        { SERVICE_NAME: 'payments', LOG_LEVEL: 'info' },
      ),
    }),
    PrismaModule,
  ],
  controllers: [HealthController, PaymentsController],
  providers: [
    InternalKeyGuard,
    PaymentsService,
    {
      provide: HEALTH_CHECKS,
      inject: [PrismaService],
      useFactory: (dependency: PrismaService): HealthCheck[] => [
        { name: 'db', run: () => dependency.$queryRaw`SELECT 1` },
      ],
    },
  ],
})
export class AppModule {}
