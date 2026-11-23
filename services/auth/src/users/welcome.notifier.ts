import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClient } from '../common/http/http-client.js';

/**
 * Correo de bienvenida (opcional en el PDF). Se pide a notifications "sin esperar":
 * el registro responde 201 de inmediato y, si notifications está caído, solo queda en el log.
 * Si no hay NOTIFICATIONS_URL o INTERNAL_API_KEY en el .env, no se envía.
 */
@Injectable()
export class WelcomeNotifier {
  private readonly logger = new Logger('Welcome');
  private readonly url: string | undefined;
  private readonly enabled: boolean;

  constructor(
    private readonly http: HttpClient,
    config: ConfigService,
  ) {
    this.url = config.get<string>('NOTIFICATIONS_URL');
    this.enabled = Boolean(this.url && config.get<string>('INTERNAL_API_KEY'));
    if (!this.enabled) this.logger.warn('Sin NOTIFICATIONS_URL o INTERNAL_API_KEY: no se enviará el correo de bienvenida');
  }

  /** No devuelve promesa a propósito: nunca debe demorar ni romper el registro. */
  send(user: { id: string; name: string; email: string }, requestId?: string): void {
    if (!this.enabled) return;
    this.http
      .call('notifications', this.url!, '/notifications/welcome', {
        method: 'POST',
        internal: true,
        requestId,
        body: { to: user.email, name: user.name },
      })
      .then((r) => {
        if (r.status >= 300) this.logger.warn(`notifications respondió ${r.status} a la bienvenida de ${user.id}`);
        else this.logger.log(`Bienvenida enviada a ${user.id}`);
      })
      .catch(() => this.logger.warn(`notifications no disponible: sin correo de bienvenida para ${user.id}`));
  }
}
