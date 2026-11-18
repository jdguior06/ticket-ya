import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtAuthModule } from './common/auth/jwt-auth.module.js';
import { CommonModule } from './common/common.module.js';
import { createEnvValidator } from './common/config/env.js';
import { HEALTH_CHECKS, HealthController, type HealthCheck } from './common/health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PrismaService } from './prisma/prisma.service.js';
import { AuthController } from './users/auth.controller.js';
import { UsersService } from './users/users.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: createEnvValidator(
        ['PORT', 'DATABASE_URL', 'JWT_PRIVATE_KEY_PATH', 'JWT_PUBLIC_KEY_PATH'],
        { SERVICE_NAME: 'auth', JWT_EXPIRES_IN: '8h', LOG_LEVEL: 'info' },
      ),
    }),
    CommonModule,
    PrismaModule,
    JwtAuthModule,
  ],
  controllers: [HealthController, AuthController],
  providers: [
    UsersService,
    {
      provide: HEALTH_CHECKS,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): HealthCheck[] => [{ name: 'db', run: () => prisma.$queryRaw`SELECT 1` }],
    },
  ],
})
export class AppModule {}
