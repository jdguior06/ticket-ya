import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../common/errors/app-exception.js';

/** Tamaño máximo de una foto. La web la achica antes de subirla (~300 KB). */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const TYPES = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const;
type Ext = keyof typeof TYPES;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Detecta el formato por los primeros bytes (no por la extensión ni el Content-Type,
 * que los manda el cliente y se pueden falsificar).
 */
export function detectImageType(buf: Buffer): Ext | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/**
 * Fotos de los eventos en disco: EVENTS_IMAGES_DIR/<eventId>.<jpg|png|webp>.
 * Una foto por evento; el nombre sale del id (uuid validado), así que no hay rutas armadas por el usuario.
 */
@Injectable()
export class ImagesService implements OnModuleInit {
  private readonly logger = new Logger('Images');
  readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>('EVENTS_IMAGES_DIR') ?? './storage/images');
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    this.logger.log(`Fotos de eventos en ${this.root}`);
  }

  /** Guarda la foto (reemplaza la anterior). Escribe a un temporal y renombra: nunca queda un archivo a medias. */
  async save(eventId: string, data: Buffer): Promise<Ext> {
    this.assertId(eventId);
    if (data.length === 0) throw new AppException(400, 'VALIDATION_ERROR', 'Falta la foto (campo "image")');
    if (data.length > MAX_IMAGE_BYTES) throw tooLarge();
    const ext = detectImageType(data);
    if (!ext) throw new AppException(415, 'UNSUPPORTED_IMAGE', 'La foto debe ser JPG, PNG o WebP');

    const tmp = join(this.root, `.${eventId}.${randomUUID()}.tmp`);
    await writeFile(tmp, data);
    await rename(tmp, join(this.root, `${eventId}.${ext}`));
    await this.removeOthers(eventId, ext);
    this.logger.log(`Foto guardada evento=${eventId} (${ext}, ${Math.round(data.length / 1024)} KB)`);
    return ext;
  }

  /** Ruta y tipo de la foto del evento, o null si no tiene. */
  async find(eventId: string): Promise<{ path: string; contentType: string } | null> {
    this.assertId(eventId);
    for (const ext of Object.keys(TYPES) as Ext[]) {
      const path = join(this.root, `${eventId}.${ext}`);
      try {
        if ((await stat(path)).isFile()) return { path, contentType: TYPES[ext] };
      } catch {
        /* no existe con esta extensión */
      }
    }
    return null;
  }

  async remove(eventId: string): Promise<void> {
    await this.removeOthers(eventId, null);
  }

  /** Para /health: la carpeta existe y se puede escribir. */
  async checkWritable(): Promise<void> {
    await access(this.root, constants.W_OK);
  }

  private async removeOthers(eventId: string, keep: Ext | null): Promise<void> {
    this.assertId(eventId);
    const names = await readdir(this.root);
    await Promise.all(
      names
        .filter((n) => n.startsWith(`${eventId}.`) && n !== `${eventId}.${keep}`)
        .map((n) => rm(join(this.root, n), { force: true })),
    );
  }

  private assertId(eventId: string): void {
    if (!UUID_RE.test(eventId)) throw new AppException(404, 'NOT_FOUND', 'Evento no encontrado');
  }
}

export function tooLarge() {
  return new AppException(413, 'IMAGE_TOO_LARGE', `La foto no puede pesar más de ${MAX_IMAGE_BYTES / 1024 / 1024} MB`);
}
