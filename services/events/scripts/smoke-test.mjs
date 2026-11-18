// Prueba de punta a punta de events. Requiere auth (3001) y events (3002) levantados,
// el seed de auth ejecutado y la misma INTERNAL_API_KEY que en events/.env.
// Uso (desde services/events):  node scripts/smoke-test.mjs
import { randomUUID } from 'node:crypto';

const AUTH = 'http://localhost:3001';
const EV = 'http://localhost:3002';
const IK = { 'X-Internal-Key': process.env.INTERNAL_API_KEY ?? 'dev-internal-key-cambiar' };
let fails = 0;

async function req(method, url, body, headers = {}) {
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}
function check(name, cond, extra) {
  if (!cond) fails++;
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${!cond && extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''}`);
}
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

// --- verificar que los servicios estén levantados
for (const [name, base, folder] of [['auth', AUTH, 'services\\auth'], ['events', EV, 'services\\events']]) {
  try {
    const h = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
    const body = await h.json();
    if (h.status !== 200) {
      console.error(`✗ ${name} responde pero no está sano: ${JSON.stringify(body)} (¿PostgreSQL apagado o falta la migración?)`);
      process.exit(1);
    }
  } catch {
    console.error(`✗ ${name} no responde en ${base}. Levántalo en otra terminal:\n    cd ${folder}\n    npm run start:dev`);
    process.exit(1);
  }
}
const login = await req('POST', `${AUTH}/auth/login`, { email: 'organizador@entradasya.local', password: 'Organizador123' });
if (login.status !== 200) {
  console.error('✗ No se pudo iniciar sesión con el organizador inicial. Ejecuta en services\\auth:  npm run seed');
  process.exit(1);
}

// --- tokens
const org = login.body.accessToken;
const tag = Date.now();
await req('POST', `${AUTH}/auth/register`, { name: 'Cliente Prueba', email: `cliente${tag}@prueba.local`, password: 'Cliente123' });
const cli = (await req('POST', `${AUTH}/auth/login`, { email: `cliente${tag}@prueba.local`, password: 'Cliente123' })).body.accessToken;
// segundo organizador (para probar que no puede tocar eventos ajenos)
await req('POST', `${AUTH}/auth/users`, { name: 'Otro Org', email: `org${tag}@prueba.local`, password: 'Organizador123', role: 'ORGANIZER' }, bearer(org));
const org2 = (await req('POST', `${AUTH}/auth/login`, { email: `org${tag}@prueba.local`, password: 'Organizador123' })).body.accessToken;
check('tokens', org && cli && org2);

const future = new Date(Date.now() + 7 * 86400e3).toISOString();

// --- crear
let r = await req('POST', `${EV}/events`, { name: 'Concierto', venue: 'Estadio', startsAt: future, sectors: [{ name: 'General', priceCents: 10000, capacity: 5 }] }, bearer(cli));
check('cliente no crea eventos (403)', r.status === 403, r);
r = await req('POST', `${EV}/events`, { name: 'Concierto', venue: 'Estadio', startsAt: '2020-01-01T00:00:00.000Z', sectors: [{ name: 'General', priceCents: 10000, capacity: 5 }] }, bearer(org));
check('fecha pasada (400)', r.status === 400 && r.body.code === 'VALIDATION_ERROR', r);
r = await req('POST', `${EV}/events`, { name: 'Concierto', venue: 'Estadio', startsAt: future, sectors: [{ name: 'A', priceCents: 1, capacity: 1 }, { name: 'a', priceCents: 1, capacity: 1 }] }, bearer(org));
check('sectores repetidos (400)', r.status === 400, r);
r = await req('POST', `${EV}/events`, { name: 'Concierto de Rock', description: 'Gran show', venue: 'Estadio Tahuichi', startsAt: future, imageUrl: 'https://picsum.photos/800', sectors: [{ name: 'VIP', priceCents: 35000, capacity: 2 }, { name: 'General', priceCents: 10000, capacity: 5 }] }, bearer(org));
check('crear evento (201, DRAFT)', r.status === 201 && r.body.status === 'DRAFT' && r.body.sectors[0].name === 'General', r);
const ev = r.body;
const gen = ev.sectors.find((s) => s.name === 'General');
const vip = ev.sectors.find((s) => s.name === 'VIP');

// --- visibilidad de borrador
r = await req('GET', `${EV}/events/${ev.id}`);
check('borrador oculto al público (404)', r.status === 404, r);
r = await req('GET', `${EV}/events/${ev.id}`, null, bearer(org));
check('borrador visible al dueño', r.status === 200, r);
r = await req('GET', `${EV}/events/${ev.id}`, null, bearer('basura'));
check('token inválido en ruta opcional (401)', r.status === 401, r);
r = await req('GET', `${EV}/events/no-es-uuid`);
check('id inválido (404)', r.status === 404, r);
r = await req('GET', `${EV}/events`);
check('cartelera sin borradores', r.status === 200 && !r.body.some((e) => e.id === ev.id), r);

// --- reservar antes de publicar
r = await req('POST', `${EV}/internal/reservations`, { orderId: randomUUID(), eventId: ev.id, sectorId: gen.id, quantity: 1 }, IK);
check('reservar en borrador (409 EVENT_NOT_AVAILABLE)', r.status === 409 && r.body.code === 'EVENT_NOT_AVAILABLE', r);

// --- publicar
r = await req('POST', `${EV}/events/${ev.id}/publish`, null, bearer(org2));
check('otro organizador no publica (404)', r.status === 404, r);
r = await req('POST', `${EV}/events/${ev.id}/publish`, null, bearer(org));
check('publicar (200)', r.status === 200 && r.body.status === 'PUBLISHED', r);
r = await req('POST', `${EV}/events/${ev.id}/publish`, null, bearer(org));
check('publicar dos veces (409)', r.status === 409, r);
r = await req('GET', `${EV}/events?search=rock`);
check('cartelera con búsqueda', r.body.some((e) => e.id === ev.id), r);

// --- internas sin clave
r = await req('POST', `${EV}/internal/reservations`, { orderId: randomUUID(), eventId: ev.id, sectorId: gen.id, quantity: 1 });
check('interna sin X-Internal-Key (401)', r.status === 401, r);

// --- reserva + idempotencia
const o1 = randomUUID();
r = await req('POST', `${EV}/internal/reservations`, { orderId: o1, eventId: ev.id, sectorId: gen.id, quantity: 2 }, IK);
check('reservar 2 (201)', r.status === 201 && r.body.totalCents === 20000 && r.body.event.organizerId, r);
r = await req('POST', `${EV}/internal/reservations`, { orderId: o1, eventId: ev.id, sectorId: gen.id, quantity: 2 }, IK);
check('repetir misma orden (200, no descuenta)', r.status === 200, r);
r = await req('GET', `${EV}/events/${ev.id}`);
check('General disponible = 3', r.body.sectors.find((s) => s.name === 'General').available === 3, r.body.sectors);
r = await req('POST', `${EV}/internal/reservations`, { orderId: randomUUID(), eventId: ev.id, sectorId: gen.id, quantity: 7 }, IK);
check('más de 6 (400)', r.status === 400, r);
r = await req('POST', `${EV}/internal/reservations`, { orderId: randomUUID(), eventId: ev.id, sectorId: vip.id, quantity: 3 }, IK);
check('agotado VIP (409 SOLD_OUT)', r.status === 409 && r.body.code === 'SOLD_OUT', r);

// --- concurrencia: 10 pedidos de 1 con solo 3 disponibles
const results = await Promise.all(
  Array.from({ length: 10 }, () => req('POST', `${EV}/internal/reservations`, { orderId: randomUUID(), eventId: ev.id, sectorId: gen.id, quantity: 1 }, IK)),
);
const okCount = results.filter((x) => x.status === 201).length;
const soldOut = results.filter((x) => x.body?.code === 'SOLD_OUT').length;
check(`concurrencia: 3 ganan y 7 agotado (ganaron ${okCount}, agotado ${soldOut})`, okCount === 3 && soldOut === 7);
r = await req('GET', `${EV}/events/${ev.id}`);
check('General disponible = 0 (nunca negativo)', r.body.sectors.find((s) => s.name === 'General').available === 0, r.body.sectors);

// --- concurrencia misma orden
const same = randomUUID();
const dup = await Promise.all(Array.from({ length: 5 }, () => req('POST', `${EV}/internal/reservations`, { orderId: same, eventId: ev.id, sectorId: vip.id, quantity: 1 }, IK)));
r = await req('GET', `${EV}/events/${ev.id}`);
check(`misma orden 5 veces en paralelo descuenta 1 (status ${dup.map((d) => d.status).join(',')})`, r.body.sectors.find((s) => s.name === 'VIP').available === 1, r.body.sectors);

// --- liberar
r = await req('POST', `${EV}/internal/reservations/${o1}/release`, null, IK);
check('liberar (200)', r.status === 200 && r.body.status === 'RELEASED', r);
const rel = await Promise.all(Array.from({ length: 3 }, () => req('POST', `${EV}/internal/reservations/${o1}/release`, null, IK)));
r = await req('GET', `${EV}/events/${ev.id}`);
check('liberar repetido en paralelo devuelve 2 una sola vez', rel.every((x) => x.status === 200) && r.body.sectors.find((s) => s.name === 'General').available === 2, r.body.sectors);
r = await req('POST', `${EV}/internal/reservations/${randomUUID()}/release`, null, IK);
check('liberar orden inexistente (404)', r.status === 404, r);

// --- editar
r = await req('PATCH', `${EV}/events/${ev.id}`, { sectors: [{ id: gen.id, name: 'General', priceCents: 12000, capacity: 2 }, { id: vip.id, name: 'VIP', priceCents: 35000, capacity: 2 }] }, bearer(org));
check('bajar cupo General por debajo de lo vendido (409)', r.status === 409 && r.body.code === 'CAPACITY_BELOW_SOLD', r);
r = await req('PATCH', `${EV}/events/${ev.id}`, { name: 'Concierto de Rock 2026', sectors: [{ id: gen.id, name: 'General', priceCents: 12000, capacity: 10 }, { id: vip.id, name: 'VIP', priceCents: 35000, capacity: 2 }, { name: 'Preferencia', priceCents: 20000, capacity: 4 }] }, bearer(org));
const g2 = r.body?.sectors?.find((s) => s.name === 'General');
check('subir cupo General 5->10 (disponible 2->7) y agregar sector', r.status === 200 && g2.capacity === 10 && g2.available === 7 && r.body.sectors.length === 3, r);
r = await req('PATCH', `${EV}/events/${ev.id}`, { sectors: [{ id: gen.id, name: 'General', priceCents: 12000, capacity: 10 }] }, bearer(org));
check('eliminar VIP con ventas (409)', r.status === 409 && r.body.code === 'SECTOR_HAS_SALES', r);
r = await req('PATCH', `${EV}/events/${ev.id}`, { foo: 1 }, bearer(org));
check('campo desconocido (400)', r.status === 400, r);

// --- interno y cancelar
r = await req('GET', `${EV}/internal/events/${ev.id}`, null, IK);
check('internal/events (200)', r.status === 200 && r.body.organizerId, r);
r = await req('GET', `${EV}/events/mine`, null, bearer(org));
check('mis eventos', r.status === 200 && r.body.some((e) => e.id === ev.id), r);
r = await req('POST', `${EV}/events/${ev.id}/cancel`, null, bearer(org));
check('cancelar (200)', r.status === 200 && r.body.status === 'CANCELLED', r);
r = await req('POST', `${EV}/internal/reservations`, { orderId: randomUUID(), eventId: ev.id, sectorId: gen.id, quantity: 1 }, IK);
check('reservar en cancelado (409)', r.status === 409 && r.body.code === 'EVENT_NOT_AVAILABLE', r);
r = await req('PATCH', `${EV}/events/${ev.id}`, { name: 'x x x' }, bearer(org));
check('editar cancelado (409)', r.status === 409, r);

console.log(fails === 0 ? '\nTODO OK' : `\n${fails} FALLAS`);
process.exit(fails ? 1 : 0);
