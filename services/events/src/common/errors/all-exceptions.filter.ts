import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { AppException } from './app-exception.js';

const DEFAULT_CODES: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  503: 'DEPENDENCY_UNAVAILABLE',
};

/** Convierte cualquier error al formato { statusCode, code, message, details }. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof AppException) {
      res.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const raw = typeof body === 'string' ? body : (body as { message?: unknown }).message;
      const message = status === 413 ? 'El archivo es demasiado grande' : Array.isArray(raw) ? raw.join('; ') : typeof raw === 'string' ? raw : exception.message;
      res.status(status).json({
        statusCode: status,
        code: DEFAULT_CODES[status] ?? 'HTTP_ERROR',
        message,
        details: {},
      });
      return;
    }

    this.logger.error('Error no controlado', exception instanceof Error ? exception : String(exception));
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Error interno del servidor',
      details: {},
    });
  }
}
