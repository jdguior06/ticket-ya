import { Controller, Get, Inject, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

export interface HealthCheck {
  name: string;
  run: () => Promise<unknown>;
}

export const HEALTH_CHECKS = Symbol('HEALTH_CHECKS');

const CHECK_TIMEOUT_MS = 2000;

/** GET /health — 200 si todas las dependencias responden, 503 si alguna falla. */
@Controller('health')
export class HealthController {
  constructor(
    @Inject(HEALTH_CHECKS) private readonly checks: HealthCheck[],
    private readonly config: ConfigService,
  ) {}

  @Get()
  async health(@Res() res: Response): Promise<void> {
    const results: Record<string, 'up' | 'down'> = {};
    await Promise.all(
      this.checks.map(async (check) => {
        try {
          await Promise.race([
            check.run(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS)),
          ]);
          results[check.name] = 'up';
        } catch {
          results[check.name] = 'down';
        }
      }),
    );

    const ok = Object.values(results).every((r) => r === 'up');
    res.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'error',
      service: this.config.get<string>('SERVICE_NAME'),
      checks: results,
      ...(ok ? { uptimeSeconds: Math.round(process.uptime()) } : {}),
    });
  }
}
