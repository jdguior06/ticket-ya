import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InternalKeyGuard } from './common/auth/internal-key.guard.js';
import { createEnvValidator } from './common/config/env.js';
import { HEALTH_CHECKS, HealthController, type HealthCheck } from './common/health/health.controller.js';
import { NotificationsController } from './notifications/notifications.controller.js';
import { NotificationsService } from './notifications/notifications.service.js';
import { isEmail } from 'class-validator';

const validateRequired = createEnvValidator(
  ['PORT', 'INTERNAL_API_KEY', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM', 'SMTP_TIMEOUT_MS'],
  { SERVICE_NAME: 'notifications', LOG_LEVEL: 'info' },
);

function validateEnv(config: Record<string, unknown>) {
  const env = validateRequired(config);
  const port = Number(env.SMTP_PORT);
  const timeout = Number(env.SMTP_TIMEOUT_MS);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_PORT inválido');
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 2147483647) {
    throw new Error('SMTP_TIMEOUT_MS inválido');
  }
  if (typeof env.SMTP_FROM !== 'string' || !isEmail(env.SMTP_FROM)) throw new Error('SMTP_FROM inválido');
  return env;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
  ],
  controllers: [HealthController, NotificationsController],
  providers: [
    InternalKeyGuard,
    NotificationsService,
    {
      provide: HEALTH_CHECKS,
      inject: [NotificationsService],
      useFactory: (dependency: NotificationsService): HealthCheck[] => [
        { name: 'smtp', run: () => dependency.verify() },
      ],
    },
  ],
})
export class AppModule {}
