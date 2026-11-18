import { ParseUUIDPipe } from '@nestjs/common';
import { AppException } from './errors/app-exception.js';

/** Valida que un parámetro de ruta sea UUID; si no, responde 404 (el recurso no puede existir). */
export const uuidParam = (resource: string) =>
  new ParseUUIDPipe({ version: '4', exceptionFactory: () => new AppException(404, 'NOT_FOUND', `${resource} no encontrado`) });
