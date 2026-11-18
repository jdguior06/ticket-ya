import type { LoggerService } from '@nestjs/common';

type Level = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

const LEVEL_ORDER: Record<Level, number> = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };

/**
 * Logger de consola con el formato del proyecto:
 *   2026-11-18T14:03:22.120Z INFO  [auth] (Contexto) mensaje
 * El nivel mínimo sale de LOG_LEVEL (error | warn | info | debug).
 */
export class AppLogger implements LoggerService {
  private readonly minLevel: number;

  constructor(
    private readonly service: string,
    level: string = 'info',
  ) {
    const key = level.toUpperCase() as Level;
    this.minLevel = LEVEL_ORDER[key] ?? LEVEL_ORDER.INFO;
  }

  log(message: unknown, ...params: unknown[]): void {
    this.write('INFO', message, params);
  }

  error(message: unknown, ...params: unknown[]): void {
    this.write('ERROR', message, params);
  }

  warn(message: unknown, ...params: unknown[]): void {
    this.write('WARN', message, params);
  }

  debug(message: unknown, ...params: unknown[]): void {
    this.write('DEBUG', message, params);
  }

  verbose(message: unknown, ...params: unknown[]): void {
    this.write('DEBUG', message, params);
  }

  private write(level: Level, message: unknown, params: unknown[]): void {
    if (LEVEL_ORDER[level] > this.minLevel) return;

    // Nest pasa el contexto como último parámetro (string).
    const rest = [...params];
    const context = typeof rest[rest.length - 1] === 'string' ? (rest.pop() as string) : undefined;

    const text = message instanceof Error ? message.message : typeof message === 'string' ? message : JSON.stringify(message);
    let line = `${new Date().toISOString()} ${level.padEnd(5)} [${this.service}]${context ? ` (${context})` : ''} ${text}`;

    for (const extra of rest) {
      if (extra instanceof Error) line += `\n${extra.stack ?? extra.message}`;
      else if (typeof extra === 'string') line += `\n${extra}`;
      else if (extra !== undefined) line += ` ${JSON.stringify(extra)}`;
    }
    if (message instanceof Error && message.stack) line += `\n${message.stack}`;

    if (level === 'ERROR') process.stderr.write(line + '\n');
    else process.stdout.write(line + '\n');
  }
}
