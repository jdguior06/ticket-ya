import { timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AppException } from '../errors/app-exception.js';

/** Exige el header X-Internal-Key en rutas /internal/* y servicios internos. */
@Injectable()
export class InternalKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('INTERNAL_API_KEY');
    const received = context.switchToHttp().getRequest<Request>().header('x-internal-key') ?? '';
    if (!expected) {
      throw new AppException(500, 'INTERNAL_ERROR', 'INTERNAL_API_KEY no está configurada');
    }
    const a = Buffer.from(received);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new AppException(401, 'UNAUTHORIZED', 'Clave interna inválida');
    }
    return true;
  }
}
