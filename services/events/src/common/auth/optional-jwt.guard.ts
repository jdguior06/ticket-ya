import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from './jwt-auth.guard.js';

/**
 * Como JwtAuthGuard, pero el token es opcional: si no viene, la ruta sigue siendo
 * pública (req.user queda vacío). Si viene y es inválido, responde 401.
 */
@Injectable()
export class OptionalJwtGuard implements CanActivate {
  constructor(private readonly jwtGuard: JwtAuthGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.header('authorization')) return true;
    return this.jwtGuard.canActivate(context);
  }
}
