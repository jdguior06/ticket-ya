import { HttpException } from '@nestjs/common';

/**
 * Error de negocio con el formato del contrato:
 *   { statusCode, code, message, details }
 * Ejemplo: throw new AppException(409, 'EMAIL_TAKEN', 'El correo ya está registrado');
 */
export class AppException extends HttpException {
  constructor(
    statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super({ statusCode, code, message, details }, statusCode);
  }
}
