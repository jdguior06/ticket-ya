import { constants } from 'node:fs';
import { access, mkdir, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Carpeta local donde se guardan los PDF (TICKETS_STORAGE_DIR). */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger('Storage');
  readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.getOrThrow<string>('TICKETS_STORAGE_DIR'));
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    this.logger.log(`PDFs en ${this.root}`);
  }

  /** Ruta absoluta de un archivo relativo, impidiendo salir de la carpeta (path traversal). */
  resolve(relativePath: string): string {
    const full = resolve(this.root, relativePath);
    const rel = relative(this.root, full);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Ruta fuera del almacenamiento: ${relativePath}`);
    return full;
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      return (await stat(this.resolve(relativePath))).isFile();
    } catch {
      return false;
    }
  }

  /** Para /health: la carpeta existe y se puede escribir. */
  async checkWritable(): Promise<void> {
    await access(this.root, constants.W_OK);
  }
}
