// Prueba de punta a punta del flujo de compra de EntradasYa.
// Requiere los 7 servicios levantados (auth, events, orders, payments, tickets, notifications, checkin),
// el seed de auth y Mailpit. Uso (desde la raíz del repo):  node scripts/e2e-compra.mjs
//
// Variables opcionales: AUTH_URL, EVENTS_URL, ORDERS_URL, TICKETS_URL, CHECKIN_URL, MAILPIT_URL (http://localhost:8025)
import { randomUUID } from 'node:crypto';

const URL = {
  auth: process.env.AUTH_URL ?? 'http://localhost:3001',
  events: process.env.EVENTS_URL ?? 'http://localhost:3002',
  orders: process.env.ORDERS_URL ?? 'http://localhost:3003',
  tickets: process.env.TICKETS_URL ?? 'http://localhost:3005',
  checkin: process.env.CHECKIN_URL ?? 'http://localhost:3007',
};
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
let fails = 0;

async function req(method, url, body, headers = {}) {
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  if ((r.headers.get('content-type') ?? '').includes('application/pdf')) {
    return { status: r.status, pdf: Buffer.from(await r.arrayBuffer()) };
  }
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}
function check(name, cond, extra) {
  if (!cond) fails++;
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${!cond && extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''}`);
}
const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const card = (number) => ({ number, holder: 'CLIENTE PRUEBA', expMonth: 12, expYear: 2030, cvv: '123' });

// --- 0. servicios arriba
const all = { ...URL, payments: 'http://localhost:3004', notifications: 'http://localhost:3006' };
for (const [name, base] of Object.entries(all)) {
  try {
    const h = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
    if (h.status !== 200) throw new Error(await h.text());
  } catch (e) {
    console.error(`✗ ${name} no está disponible en ${base} (${e.message}). Levántalo con: cd services\\${name} ; npm run start:dev`);
    process.exit(1);
  }
}
console.log('Los 7 servicios responden.\n');

// --- 1. organizador crea y publica un evento
const org = await req('POST', `${URL.auth}/auth/login`, { email: 'organizador@entradasya.local', password: 'Organizador123' });
if (org.status !== 200) {
  console.error('✗ No existe el organizador inicial. Ejecuta en services\\auth:  npm run seed');
  process.exit(1);
}
const orgToken = org.body.accessToken;
const startsAt = new Date(Date.now() + 14 * 86400e3).toISOString();
let r = await req('POST', `${URL.events}/events`, {
  name: `Prueba E2E ${new Date().toISOString().slice(11, 19)}`,
  venue: 'Estadio Tahuichi',
  startsAt,
  sectors: [
    { name: 'General', priceCents: 10000, capacity: 3 },
    { name: 'VIP', priceCents: 35000, capacity: 1 },
  ],
}, bearer(orgToken));
const event = r.body;
await req('POST', `${URL.events}/events/${event.id}/publish`, null, bearer(orgToken));
const general = event.sectors.find((s) => s.name === 'General');
const vip = event.sectors.find((s) => s.name === 'VIP');
check('organizador crea y publica evento (General 3 cupos, VIP 1)', r.status === 201 && general && vip, r.body);
const available = async (sectorId) =>
  (await req('GET', `${URL.events}/events/${event.id}`)).body.sectors.find((s) => s.id === sectorId).available;

// --- 2. cliente se registra
const tag = Date.now();
const email = `e2e${tag}@prueba.local`;
await req('POST', `${URL.auth}/auth/register`, { name: 'Cliente E2E', email, password: 'Cliente123' });
const cli = (await req('POST', `${URL.auth}/auth/login`, { email, password: 'Cliente123' })).body.accessToken;
check('cliente registrado e inicia sesión', !!cli);

// --- 3. compra feliz
const buy = (sectorId, quantity, number = '4111111111111111', headers = {}) =>
  req('POST', `${URL.orders}/orders`, { eventId: event.id, sectorId, quantity, card: card(number) }, { ...bearer(cli), ...headers });

r = await buy(general.id, 2);
const order1 = r.body;
check('compra 2 General -> 201 PAID', r.status === 201 && order1.status === 'PAID', r.body);
check('total 2 x Bs 100 = 20000 centavos', order1.totalCents === 20000, order1);
check('entradas emitidas (ISSUED)', order1.ticketsStatus === 'ISSUED', order1);
check('correo enviado (SENT)', order1.notificationStatus === 'SENT', order1);
check('General disponible 3 -> 1', (await available(general.id)) === 1);

r = await req('GET', `${URL.tickets}/tickets/order/${order1.id}`, null, bearer(cli));
check('tickets: 2 entradas con código', r.status === 200 && r.body.length === 2 && r.body.every((t) => t.code.startsWith('EY-')), r.body);
const myTickets = r.body ?? [];
const pdf = r.body?.[0] ? await req('GET', `${URL.tickets}/tickets/${r.body[0].id}/pdf`, null, bearer(cli)) : {};
check('descarga del PDF', pdf.status === 200 && pdf.pdf?.subarray(0, 5).toString() === '%PDF-');

// --- 4. agotado
r = await buy(general.id, 2);
check('comprar 2 con 1 disponible -> 409 SOLD_OUT', r.status === 409 && r.body.code === 'SOLD_OUT', r.body);
check('la orden queda CANCELLED', r.body?.details?.order?.status === 'CANCELLED', r.body?.details);
check('General sigue en 1 (no se tocó)', (await available(general.id)) === 1);

// --- 5. pago rechazado libera cupos
r = await buy(vip.id, 1, '4000000000000000');
check('tarjeta terminada en 0000 -> 402 PAYMENT_REJECTED', r.status === 402 && r.body.code === 'PAYMENT_REJECTED', r.body);
check('motivo CARD_DECLINED y orden REJECTED', r.body?.details?.reason === 'CARD_DECLINED' && r.body?.details?.order?.status === 'REJECTED', r.body?.details);
check('VIP vuelve a 1 (cupo liberado)', (await available(vip.id)) === 1);

// --- 6. idempotencia (doble clic en "Comprar")
const key = `e2e-${randomUUID()}`;
const [a, b] = await Promise.all([buy(general.id, 1, undefined, { 'Idempotency-Key': key }), buy(general.id, 1, undefined, { 'Idempotency-Key': key })]);
check(`doble clic con la misma Idempotency-Key -> una sola orden (${a.status}, ${b.status})`, a.body.id === b.body.id, [a.body, b.body]);
check('General 1 -> 0 (se descontó una vez)', (await available(general.id)) === 0);

// --- 7. validaciones y permisos
r = await buy(general.id, 7);
check('7 entradas -> 400', r.status === 400, r.body);
r = await req('POST', `${URL.orders}/orders`, { eventId: event.id, sectorId: vip.id, quantity: 1, card: card('4111111111111111') }, bearer(orgToken));
check('organizador no puede comprar (403)', r.status === 403, r.body);
r = await req('POST', `${URL.orders}/orders`, { eventId: event.id, sectorId: vip.id, quantity: 1, card: { number: '12' } }, bearer(cli));
check('tarjeta mal formada -> 400 sin crear orden', r.status === 400, r.body);

// --- 8. historial
r = await req('GET', `${URL.orders}/orders/mine`, null, bearer(cli));
const statuses = r.body.map((o) => o.status).sort().join(',');
check(`mis compras: PAID x2, CANCELLED, REJECTED (${statuses})`, statuses === 'CANCELLED,PAID,PAID,REJECTED', r.body);
r = await req('GET', `${URL.orders}/orders/${order1.id}`, null, bearer(cli));
check('detalle de mi orden', r.status === 200 && r.body.id === order1.id, r.body);

// --- 9. reporte del organizador
r = await req('GET', `${URL.orders}/orders/reports/events/${event.id}`, null, bearer(orgToken));
check('reporte: 2 órdenes pagadas, 3 entradas, Bs 300, 1 rechazada',
  r.status === 200 && r.body.paidOrders === 2 && r.body.ticketsSold === 3 && r.body.revenueCents === 30000 && r.body.rejectedOrders === 1, r.body);
r = await req('GET', `${URL.orders}/orders/reports/events/${event.id}`, null, bearer(cli));
check('cliente no ve reportes (403)', r.status === 403, r.body);

// --- 10. ingreso al evento (checkin)
const doormanEmail = `portero${tag}@prueba.local`;
await req('POST', `${URL.auth}/auth/users`, { name: 'Portero E2E', email: doormanEmail, password: 'Portero123', role: 'DOORMAN' }, bearer(orgToken));
const doorman = (await req('POST', `${URL.auth}/auth/login`, { email: doormanEmail, password: 'Portero123' })).body.accessToken;
const scan = (code, eventId = event.id, token = doorman) => req('POST', `${URL.checkin}/checkin/scan`, { code, eventId }, bearer(token));
const [t1, t2] = myTickets;

r = await scan(t1.code);
check('portero escanea entrada válida -> ingreso permitido', r.status === 200 && r.body.allowed === true && r.body.ticket?.holderName === 'Cliente E2E', r.body);
r = await scan(t1.code);
check('SEGUNDO escaneo del mismo código -> rechazado ALREADY_USED', r.body.allowed === false && r.body.reason === 'ALREADY_USED', r.body);
check('el rechazo informa la hora del primer ingreso', !!r.body.firstCheckedInAt, r.body);
r = await scan(` ${t2.code.toLowerCase()} `);
check('código escrito a mano (minúsculas y espacios) -> permitido', r.body.allowed === true, r.body);
// Entrada nueva (la de la compra con Idempotency-Key) escaneada por 5 puertas a la vez: entra UNA sola.
const t3 = (await req('GET', `${URL.tickets}/tickets/order/${a.body.id}`, null, bearer(cli))).body?.[0];
const par = await Promise.all(Array.from({ length: 5 }, () => scan(t3.code)));
const allowed = par.filter((x) => x.body.allowed === true).length;
const used = par.filter((x) => x.body.reason === 'ALREADY_USED').length;
check(`5 escaneos SIMULTÁNEOS de una entrada nueva -> 1 permitido y 4 ALREADY_USED (${allowed} y ${used})`, allowed === 1 && used === 4, par.map((x) => x.body));
r = await scan('EY-AAAA-BBBB-CCCC');
check('código inexistente -> INVALID_CODE', r.body.allowed === false && r.body.reason === 'INVALID_CODE', r.body);
const otherEvent = (await req('GET', `${URL.events}/events`)).body.find((e) => e.id !== event.id);
if (otherEvent) {
  r = await scan(t1.code, otherEvent.id);
  check('entrada de otro evento -> WRONG_EVENT', r.body.allowed === false && r.body.reason === 'WRONG_EVENT', r.body);
}
r = await scan(t1.code, event.id, cli);
check('un cliente no puede registrar ingresos (403)', r.status === 403, r.body);
r = await req('GET', `${URL.checkin}/checkin/events/${event.id}/stats`, null, bearer(orgToken));
check('organizador ve 3 ingresos', r.status === 200 && r.body.totalCheckedIn === 3, r.body);

// --- 11. correo en Mailpit (si está disponible su API)
try {
  const m = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`, { signal: AbortSignal.timeout(2000) });
  const data = await m.json();
  check(`Mailpit recibió el correo de confirmación (${data.messages_count ?? 0})`, (data.messages_count ?? 0) >= 2, data.messages_count);
} catch {
  console.log('--   Mailpit no responde en ' + MAILPIT + ': se omite la revisión del correo');
}

console.log(fails === 0 ? '\nTODO OK' : `\n${fails} FALLAS`);
process.exit(fails ? 1 : 0);
