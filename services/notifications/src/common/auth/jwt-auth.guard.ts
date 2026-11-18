import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AppException } from '../errors/app-exception.js';
import { ROLES, type AuthUser, type JwtPayload } from './auth.types.js';

/** Valida el header Authorization: Bearer <JWT> con la llave pública y llena req.user. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new AppException(401, 'UNAUTHORIZED', 'Falta el token de acceso');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new AppException(401, 'UNAUTHORIZED', 'Token inválido o vencido');
    }
    if (!payload.sub || !ROLES.includes(payload.role)) {
      throw new AppException(401, 'UNAUTHORIZED', 'Token inválido');
    }

    req.user = { id: payload.sub, role: payload.role, name: payload.name, email: payload.email };
    return true;
  }
}
