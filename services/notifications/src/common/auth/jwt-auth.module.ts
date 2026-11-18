import { readFileSync } from 'node:fs';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { InternalKeyGuard } from './internal-key.guard.js';

/**
 * Registra JwtService con la llave pública (todos los servicios) y, si existe
 * JWT_PRIVATE_KEY_PATH, también con la privada (solo auth firma tokens).
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const publicKey = readFileSync(config.getOrThrow<string>('JWT_PUBLIC_KEY_PATH'), 'utf8');
        const privatePath = config.get<string>('JWT_PRIVATE_KEY_PATH');
        return {
          publicKey,
          privateKey: privatePath ? readFileSync(privatePath, 'utf8') : undefined,
          signOptions: { algorithm: 'RS256' },
          verifyOptions: { algorithms: ['RS256'] },
        };
      },
    }),
  ],
  providers: [JwtAuthGuard, RolesGuard, InternalKeyGuard],
  exports: [JwtModule, JwtAuthGuard, RolesGuard, InternalKeyGuard],
})
export class JwtAuthModule {}
