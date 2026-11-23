import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../errors/app-exception.js';

export interface CallOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  requestId?: string;
  /** Envía X-Internal-Key (para rutas /internal/* y servicios internos). */
  internal?: boolean;
  headers?: Record<string, string>;
}

export interface CallResult<T> {
  status: number;
  data: T;
}

/**
 * Cliente HTTP para llamar a otros servicios. Siempre usa timeout (HTTP_TIMEOUT_MS).
 * - Timeout o error de red  -> AppException 503 DEPENDENCY_UNAVAILABLE
 * - Respuestas 4xx/5xx      -> se devuelven tal cual en { status, data } para que el llamador decida.
 * En auth solo se usa para pedir el correo de bienvenida a notifications.
 */
@Injectable()
export class HttpClient {
  private readonly logger = new Logger('HttpClient');

  constructor(private readonly config: ConfigService) {}

  async call<T = unknown>(service: string, baseUrl: string, path: string, opts: CallOptions = {}): Promise<CallResult<T>> {
    const timeout = Number(this.config.get('HTTP_TIMEOUT_MS') ?? 5000);
    const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.requestId) headers['X-Request-Id'] = opts.requestId;
    if (opts.internal) headers['X-Internal-Key'] = this.config.getOrThrow<string>('INTERNAL_API_KEY');

    const url = `${baseUrl.replace(/\/$/, '')}${path}`;
    const method = opts.method ?? 'GET';
    let response: globalThis.Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(timeout),
      });
    } catch (err) {
      const reason = err instanceof Error && err.name === 'TimeoutError' ? `timeout ${timeout}ms` : (err as Error).message;
      this.logger.warn(`${service} no disponible: ${method} ${url} (${reason}) rid=${opts.requestId ?? '-'}`);
      throw new AppException(503, 'DEPENDENCY_UNAVAILABLE', `El servicio ${service} no está disponible`, { service });
    }

    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    return { status: response.status, data: data as T };
  }
}
