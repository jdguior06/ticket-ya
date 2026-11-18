import { randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { Ticket } from '../generated/prisma/client.js';
import { StorageService } from './storage.service.js';

const TIME_ZONE = 'America/La_Paz';

function formatDate(date: Date): string {
  const text = new Intl.DateTimeFormat('es-BO', {
    timeZone: TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Crea el PDF de una entrada (datos del evento + QR con el código). */
@Injectable()
export class TicketPdfService {
  constructor(private readonly storage: StorageService) {}

  /** Genera el PDF y lo guarda. Devuelve la ruta relativa (<orderId>/<ticketId>.pdf). */
  async generate(ticket: Ticket, total: number): Promise<string> {
    const relative = `${ticket.orderId}/${ticket.id}.pdf`;
    const absolute = this.storage.resolve(relative);
    const buffer = await this.render(ticket, total);

    // Escritura atómica: si el proceso se corta, nunca queda un PDF a medias con el nombre final.
    await mkdir(dirname(absolute), { recursive: true });
    const tmp = join(dirname(absolute), `.${ticket.id}.${randomUUID()}.tmp`);
    await writeFile(tmp, buffer);
    await rename(tmp, absolute);
    return relative;
  }

  async render(ticket: Ticket, total: number): Promise<Buffer> {
    const qr = await QRCode.toBuffer(ticket.code, { errorCorrectionLevel: 'M', margin: 1, width: 600 });

    const doc = new PDFDocument({
      size: 'A5',
      margin: 36,
      info: { Title: `Entrada ${ticket.code}`, Author: 'EntradasYa', Subject: ticket.eventName },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const width = doc.page.width - 72;
    const accent = '#4F46E5';

    // Encabezado
    doc.rect(0, 0, doc.page.width, 64).fill(accent);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(20).text('EntradasYa', 36, 22);
    doc.font('Helvetica').fontSize(10).text(`Entrada ${ticket.seq} de ${total}`, 36, 28, { width, align: 'right' });

    // Evento
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(18).text(ticket.eventName, 36, 88, { width });
    doc.moveDown(0.4);
    doc.font('Helvetica').fontSize(11).fillColor('#374151');
    doc.text(formatDate(ticket.eventStartsAt), { width });
    doc.text(ticket.venue, { width });

    // Sector y titular
    doc.moveDown(0.8);
    const boxY = doc.y;
    doc.roundedRect(36, boxY, width, 52, 6).fill('#F3F4F6');
    doc.fillColor('#6B7280').fontSize(8).text('SECTOR', 48, boxY + 10);
    doc.text('TITULAR', 48 + width / 2, boxY + 10);
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(13).text(ticket.sectorName, 48, boxY + 24, { width: width / 2 - 24 });
    doc.text(ticket.holderName, 48 + width / 2, boxY + 24, { width: width / 2 - 24 });

    // QR centrado
    const qrSize = 210;
    const qrY = boxY + 72;
    doc.image(qr, (doc.page.width - qrSize) / 2, qrY, { width: qrSize, height: qrSize });

    // Código legible
    doc.font('Courier-Bold').fontSize(18).fillColor('#111827')
      .text(ticket.code, 36, qrY + qrSize + 10, { width, align: 'center', characterSpacing: 1 });

    // Pie
    doc.font('Helvetica').fontSize(8).fillColor('#6B7280')
      .text('Válida para un solo ingreso. No compartas este código: el primer escaneo registra la entrada.', 36, qrY + qrSize + 40, { width, align: 'center' })
      .moveDown(0.3)
      .text(`Orden ${ticket.orderId}`, { width, align: 'center' });

    doc.end();
    return done;
  }
}
