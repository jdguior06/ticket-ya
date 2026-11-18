import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CheckinController } from './checkin/checkin.controller.js';
import { CheckinService } from './checkin/checkin.service.js';
import { TicketsClient } from './checkin/tickets.client.js';
import { JwtAuthModule } from './common/auth/jwt-auth.module.js';
import { CommonModule } from './common/common.module.js';
import { createEnvValidator } from './common/config/env.js';
import { HEALTH_CHECKS, HealthController, type HealthCheck } from './common/health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PrismaService } from './prisma/prisma.service.js';

const validateRequired = createEnvValidator(
  ['PORT', 'DATABASE_URL', 'JWT_PUBLIC_KEY_PATH', 'INTERNAL_API_KEY', 'TICKETS_URL'],
  { SERVICE_NAME: 'checkin', LOG_LEVEL: 'info', HTTP_TIMEOUT_MS: '5000' },
);

function validateEnv(config: Record<string, unknown>) {
  const env = validateRequired(config);
  const ticketsUrl = URL.parse(String(env.TICKETS_URL));
  if (ticketsUrl?.protocol !== 'http:' && ticketsUrl?.protocol !== 'https:') {
    throw new Error('TICKETS_URL debe ser una URL HTTP o HTTPS');
  }
  const timeout = Number(env.HTTP_TIMEOUT_MS);
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 2147483647) {
    throw new Error('HTTP_TIMEOUT_MS inválido');
  }
  return env;
}

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), CommonModule, PrismaModule, JwtAuthModule],
  controllers: [HealthController, CheckinController],
  providers: [
    CheckinService,
    TicketsClient,
    {
      provide: HEALTH_CHECKS,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): HealthCheck[] => [{ name: 'db', run: () => prisma.$queryRaw`SELECT 1` }],
    },
  ],
})
export class AppModule {}
