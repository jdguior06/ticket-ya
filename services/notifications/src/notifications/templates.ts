// Plantillas de correo: cada una devuelve asunto, versión HTML y versión de texto
// (los clientes que no muestran HTML usan el texto). HTML con tablas y estilos en línea,
// que es lo que entienden Gmail, Outlook y Mailpit.

const C = {
  tinta: '#1f1b4d',
  suave: '#5b5885',
  papel: '#f3f4f8',
  linea: '#dfe1ec',
  fucsia: '#e0306e',
  ambar: '#ffc23d',
};
const FONT = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface Email {
  subject: string;
  html: string;
  text: string;
}

/** Todo texto que viene de afuera (nombres, eventos) se escapa antes de ir al HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const eventDate = new Intl.DateTimeFormat('es-BO', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/La_Paz' });

export function formatBs(cents: number): string {
  return `Bs ${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px"><tr>
<td style="border-radius:999px;background:${C.fucsia}">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px">${escapeHtml(label)}</a>
</td></tr></table>`;
}

/** Marco común: logo, tarjeta blanca y pie. `preheader` es el texto que se ve en la bandeja. */
function layout(preheader: string, body: string): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EntradasYa</title></head>
<body style="margin:0;padding:0;background:${C.papel}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.papel}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 18px;font-family:${FONT};font-size:22px;font-weight:800;color:${C.tinta}">Entradas<span style="color:${C.fucsia}">Ya</span></td></tr>
<tr><td style="background:#ffffff;border-radius:18px;border:1px solid ${C.linea};padding:32px 28px;font-family:${FONT};font-size:16px;line-height:1.55;color:${C.tinta}">
${body}
</td></tr>
<tr><td style="padding:18px 4px;font-family:${FONT};font-size:13px;line-height:1.5;color:${C.suave}">
Recibes este correo porque tienes una cuenta en EntradasYa.<br>Es un mensaje automático: no hace falta responderlo.
</td></tr>
</table></td></tr></table></body></html>`;
}

function detailRow(label: string, value: string): string {
  return `<tr><td style="padding:7px 0;color:${C.suave};font-size:15px;width:38%;vertical-align:top">${escapeHtml(label)}</td>
<td style="padding:7px 0;font-size:15px;font-weight:600">${escapeHtml(value)}</td></tr>`;
}

export function orderConfirmedEmail(o: {
  customerName: string;
  orderId: string;
  eventName: string;
  venue: string;
  eventStartsAt: Date;
  sectorName: string;
  quantity: number;
  totalCents: number;
  ticketsUrl: string;
}): Email {
  const when = eventDate.format(o.eventStartsAt);
  const entradas = `${o.quantity} ${o.quantity === 1 ? 'entrada' : 'entradas'}`;
  const total = formatBs(o.totalCents);

  const html = layout(
    `Tus ${entradas} para ${o.eventName} están listas.`,
    `<p style="margin:0 0 6px;font-size:16px">Hola, ${escapeHtml(o.customerName)}:</p>
<p style="margin:0 0 22px">Tu compra está confirmada. Estas son tus entradas para</p>
<p style="margin:0;font-size:24px;line-height:1.25;font-weight:800">${escapeHtml(o.eventName)}</p>
<p style="margin:6px 0 0;color:${C.suave}">${escapeHtml(when)} · ${escapeHtml(o.venue)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;border-top:2px dashed ${C.linea};padding-top:10px">
${detailRow('Sector', o.sectorName)}
${detailRow('Cantidad', entradas)}
${detailRow('Total pagado', total)}
${detailRow('N.º de compra', o.orderId.slice(0, 8).toUpperCase())}
</table>
${button(o.ticketsUrl, 'Ver y descargar mis entradas')}
<p style="margin:16px 0 0;font-size:14px;color:${C.suave}">Cada entrada tiene un código QR que se lee una sola vez en la puerta. Llévala en el celular o impresa, y no la compartas.</p>`,
  );

  const text = [
    `Hola, ${o.customerName}:`,
    '',
    `Tu compra está confirmada.`,
    '',
    `Evento: ${o.eventName}`,
    `Fecha: ${when}`,
    `Lugar: ${o.venue}`,
    `Sector: ${o.sectorName}`,
    `Cantidad: ${entradas}`,
    `Total pagado: ${total}`,
    `N.º de compra: ${o.orderId}`,
    '',
    `Ver y descargar tus entradas: ${o.ticketsUrl}`,
    '',
    'Cada entrada tiene un código QR que se lee una sola vez en la puerta.',
  ].join('\n');

  return { subject: `Tus entradas para ${o.eventName}`, html, text };
}

export function welcomeEmail(w: { name: string; webUrl: string }): Email {
  const html = layout(
    'Tu cuenta está lista: ya puedes comprar entradas.',
    `<p style="margin:0 0 6px;font-size:24px;line-height:1.25;font-weight:800">¡Hola, ${escapeHtml(w.name)}!</p>
<p style="margin:12px 0 0">Tu cuenta en EntradasYa está lista. Ya puedes ver la cartelera, comprar entradas y tenerlas siempre a mano en <strong>Mis entradas</strong>.</p>
${button(w.webUrl, 'Ver la cartelera')}
<p style="margin:16px 0 0;font-size:14px;color:${C.suave}">Si no creaste esta cuenta, ignora este correo.</p>`,
  );
  const text = [
    `¡Hola, ${w.name}!`,
    '',
    'Tu cuenta en EntradasYa está lista. Ya puedes ver la cartelera y comprar entradas.',
    '',
    `Cartelera: ${w.webUrl}`,
    '',
    'Si no creaste esta cuenta, ignora este correo.',
  ].join('\n');
  return { subject: 'Bienvenido a EntradasYa', html, text };
}
