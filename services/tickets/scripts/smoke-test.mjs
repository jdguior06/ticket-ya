// Prueba de punta a punta de tickets. Requiere auth (3001) y tickets (3005) levantados,
// el seed de auth ejecutado y la misma INTERNAL_API_KEY que en tickets/.env.
// Uso (desde services/tickets):  node scripts/smoke-test.mjs
import { randomUUID } from 'node:crypto';

const AUTH = 'http://localhost:3001';
const TK = 'http://localhost:3005';
const IK = { 'X-Internal-Key': process.env.INTERNAL_API_KEY ?? 'dev-internal-key-cambiar' };
let fails = 0;

async function req(method, url, body, headers = {}) {
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = r.headers.get('content-type') ?? '';
  if (type.includes('application/pdf')) {
    return { status: r.status, headers: r.headers, pdf: Buffer.from(await r.arrayBuffer()) };
  }
  const text = await r.text();
  return { status: r.status, headers: r.headers, body: text ? JSON.parse(text) : null };
}
function check(name, cond, extra) {
  if (!cond) fails++;
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${!cond && extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''}`);
}
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

// --- verificar servicios
for (const [name, base, folder] of [['auth', AUTH, 'services\\auth'], ['tickets', TK, 'services\\tickets']]) {
  try {
    const h = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
    if (h.status !== 200) {
      console.error(`✗ ${name} responde pero no está sano: ${await h.text()}`);
      process.exit(1);
    }
  } catch {
    console.error(`✗ ${name} no responde en ${base}. Levántalo en otra terminal:\n    cd ${folder}\n    npm run start:dev`);
    process.exit(1);
  }
}

// --- dos clientes
const tag = Date.now();
const users = [];
for (const n of [1, 2]) {
  const email = `cliente${n}-${tag}@prueba.local`;
  const reg = await req('POST', `${AUTH}/auth/register`, { name: `Cliente ${n}`, email, password: 'Cliente123' });
  const login = await req('POST', `${AUTH}/auth/login`, { email, password: 'Cliente123' });
  users.push({ id: reg.body.id, email, token: login.body.accessToken });
}
const [c1, c2] = users;
check('clientes creados', c1.token && c2.token);

const event = { id: randomUUID(), name: 'Concierto de Rock', venue: 'Estadio Tahuichi', startsAt: '2026-12-05T23:00:00.000Z' };
const sector = { id: randomUUID(), name: 'General' };
const orderId = randomUUID();
const issueBody = { orderId, userId: c1.id, holderName: 'Cliente Uno', holderEmail: c1.email, event, sector, quantity: 3 };

// --- emitir
let r = await req('POST', `${TK}/internal/tickets/issue`, issueBody);
check('emitir sin clave (401)', r.status === 401, r.body);
r = await req('POST', `${TK}/internal/tickets/issue`, { ...issueBody, quantity: 7 }, IK);
check('más de 6 (400)', r.status === 400, r.body);
r = await req('POST', `${TK}/internal/tickets/issue`, issueBody, IK);
check('emitir 3 (201)', r.status === 201 && r.body.tickets.length === 3, r.body);
const tickets = r.body.tickets;
const codes = tickets.map((t) => t.code);
check('códigos únicos con formato EY-XXXX-XXXX-XXXX', new Set(codes).size === 3 && codes.every((c) => /^EY-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(c)), codes);
check('pdfUrl por el gateway', tickets[0].pdfUrl === `/api/tickets/${tickets[0].id}/pdf`, tickets[0]);

r = await req('POST', `${TK}/internal/tickets/issue`, issueBody, IK);
check('reintento de orders (200, mismas entradas)', r.status === 200 && r.body.tickets.map((t) => t.code).join() === codes.join(), r.body);
r = await req('POST', `${TK}/internal/tickets/issue`, { ...issueBody, userId: c2.id }, IK);
check('misma orden con otro usuario (409 IDEMPOTENCY_CONFLICT)', r.status === 409 && r.body.code === 'IDEMPOTENCY_CONFLICT', r.body);

// concurrencia: misma orden nueva 5 veces en paralelo
const o2 = randomUUID();
const par = await Promise.all(Array.from({ length: 5 }, () => req('POST', `${TK}/internal/tickets/issue`, { ...issueBody, orderId: o2, quantity: 2 }, IK)));
const sets = new Set(par.map((p) => p.body.tickets.map((t) => t.code).join()));
check(`misma orden 5 veces en paralelo -> 2 entradas (status ${par.map((p) => p.status).join(',')})`, sets.size === 1 && par.every((p) => p.body.tickets.length === 2) && par.filter((p) => p.status === 201).length === 1);

// --- cliente
r = await req('GET', `${TK}/tickets/mine`, null, bearer(c1.token));
check('mis entradas (5)', r.status === 200 && r.body.length === 5, r.body);
r = await req('GET', `${TK}/tickets/mine`, null, bearer(c2.token));
check('otro cliente no ve nada', r.status === 200 && r.body.length === 0, r.body);
r = await req('GET', `${TK}/tickets/order/${orderId}`, null, bearer(c1.token));
check('entradas de una orden', r.status === 200 && r.body.length === 3, r.body);
r = await req('GET', `${TK}/tickets/order/${orderId}`, null, bearer(c2.token));
check('orden ajena (404)', r.status === 404, r.body);
r = await req('GET', `${TK}/tickets/mine`);
check('sin token (401)', r.status === 401, r.body);

// --- PDF
r = await req('GET', `${TK}/tickets/${tickets[0].id}/pdf`, null, bearer(c1.token));
check('descargar PDF', r.status === 200 && r.pdf?.subarray(0, 5).toString() === '%PDF-' && r.pdf.length > 5000, { status: r.status, bytes: r.pdf?.length });
check('nombre del archivo', (r.headers.get('content-disposition') ?? '').includes(`entrada-${tickets[0].code}.pdf`), r.headers.get('content-disposition'));
if (process.env.SAVE_PDF) (await import('node:fs')).writeFileSync(process.env.SAVE_PDF, r.pdf);
r = await req('GET', `${TK}/tickets/${tickets[0].id}/pdf`, null, bearer(c2.token));
check('PDF ajeno (404)', r.status === 404, r.body);

// --- validar (checkin)
const v = (code, eventId = event.id) => req('GET', `${TK}/internal/tickets/validate?code=${encodeURIComponent(code)}&eventId=${eventId}`, null, IK);
r = await v(codes[0]);
check('código válido', r.status === 200 && r.body.valid === true && r.body.ticket.holderName === 'Cliente Uno', r.body);
r = await v(` ${codes[1].toLowerCase()} `);
check('escrito a mano en minúsculas y con espacios', r.body.valid === true, r.body);
r = await v(codes[0], randomUUID());
check('otro evento (WRONG_EVENT)', r.body.valid === false && r.body.reason === 'WRONG_EVENT', r.body);
r = await v('EY-AAAA-BBBB-CCCC');
check('código inexistente (INVALID_CODE)', r.body.valid === false && r.body.reason === 'INVALID_CODE', r.body);
r = await v('cualquier cosa');
check('basura (INVALID_CODE, no 400)', r.status === 200 && r.body.reason === 'INVALID_CODE', r.body);
r = await req('GET', `${TK}/internal/tickets/validate?code=${codes[0]}&eventId=${event.id}`);
check('validar sin clave (401)', r.status === 401, r.body);

console.log(fails === 0 ? '\nTODO OK' : `\n${fails} FALLAS`);
process.exit(fails ? 1 : 0);
