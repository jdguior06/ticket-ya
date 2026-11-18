import { readFileSync } from 'node:fs';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { InternalKeyGuard } from './internal-key.guard.js';

/** Verifica con la llave pública los JWT que emite auth. */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const publicKey = readFileSync(config.getOrThrow<string>('JWT_PUBLIC_KEY_PATH'), 'utf8');
        return {
          publicKey,
          verifyOptions: { algorithms: ['RS256'] },
        };
      },
    }),
  ],
  providers: [JwtAuthGuard, RolesGuard, InternalKeyGuard],
  exports: [JwtModule, JwtAuthGuard, RolesGuard, InternalKeyGuard],
})
export class JwtAuthModule {}
