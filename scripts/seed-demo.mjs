// Datos de demostración para presentar EntradasYa.
// Requiere auth y events levantados y el seed de auth (organizador inicial).
// Uso (desde la raíz):  node scripts/seed-demo.mjs
//
// Crea (si no existen): 4 eventos publicados, un portero y un cliente.
//   Cliente:  cliente@entradasya.local  / Cliente123
//   Portero:  portero@entradasya.local  / Portero123
//   Organizador (del seed de auth): organizador@entradasya.local / Organizador123
const AUTH = process.env.AUTH_URL ?? 'http://localhost:3001';
const EVENTS = process.env.EVENTS_URL ?? 'http://localhost:3002';

async function req(method, url, body, token) {
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => null);
  if (!r) throw new Error(`No responde ${url}. ¿Están levantados auth y events?`);
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}

const login = await req('POST', `${AUTH}/auth/login`, { email: 'organizador@entradasya.local', password: 'Organizador123' });
if (login.status !== 200) {
  console.error('No existe el organizador inicial. Ejecuta en services\\auth:  npm run seed');
  process.exit(1);
}
const org = login.body.accessToken;

// Fecha en hora de Bolivia (UTC-4): días desde hoy + hora local
function at(days, hour, minute = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour + 4, minute, 0, 0);
  return d.toISOString();
}

const demo = [
  {
    name: 'Noche de jazz en el Patio',
    venue: 'Manzana 1, Santa Cruz',
    startsAt: at(3, 20, 30),
    description: 'Cuatro bandas locales y una jam session al cierre. Mesas por orden de llegada en el sector General.',
    sectors: [
      { name: 'General', priceCents: 8000, capacity: 150 },
      { name: 'Mesa preferente', priceCents: 15000, capacity: 30 },
    ],
  },
  {
    name: 'Clásico cruceño: Blooming vs. Oriente',
    venue: 'Estadio Tahuichi Aguilera',
    startsAt: at(6, 19, 0),
    description: 'Fecha del campeonato. Las puertas abren dos horas antes del partido.',
    sectors: [
      { name: 'General', priceCents: 5000, capacity: 800 },
      { name: 'Preferencia', priceCents: 10000, capacity: 300 },
      { name: 'Butaca', priceCents: 18000, capacity: 12 },
    ],
  },
  {
    name: 'Feria del libro y la ilustración',
    venue: 'Fexpocruz, pabellón Brasil',
    startsAt: at(10, 10, 0),
    description: 'Editoriales independientes, firmas de autores y talleres para niños. La entrada vale para todo el día.',
    sectors: [{ name: 'Entrada general', priceCents: 2000, capacity: 1000 }],
  },
  {
    name: 'Charla: datos para el agro guarayo',
    venue: 'Casa de la Cultura, Ascensión de Guarayos',
    startsAt: at(1, 18, 30),
    description: 'Cómo usar sensores baratos y planillas para decidir riego y fertilización. Cupo limitado.',
    sectors: [{ name: 'Asistente', priceCents: 3000, capacity: 8 }],
  },
];

const mine = (await req('GET', `${EVENTS}/events/mine`, null, org)).body ?? [];
for (const e of demo) {
  if (mine.some((m) => m.name === e.name && m.status !== 'CANCELLED')) {
    console.log(`= ya existe: ${e.name}`);
    continue;
  }
  const created = await req('POST', `${EVENTS}/events`, e, org);
  if (created.status !== 201) {
    console.error(`No se pudo crear "${e.name}":`, created.body);
    continue;
  }
  await req('POST', `${EVENTS}/events/${created.body.id}/publish`, null, org);
  console.log(`+ publicado: ${e.name}`);
}

for (const u of [
  { name: 'Portero Demo', email: 'portero@entradasya.local', password: 'Portero123', role: 'DOORMAN' },
]) {
  const r = await req('POST', `${AUTH}/auth/users`, u, org);
  console.log(r.status === 201 ? `+ portero: ${u.email} / ${u.password}` : `= portero ya existe: ${u.email}`);
}
const c = await req('POST', `${AUTH}/auth/register`, { name: 'Cliente Demo', email: 'cliente@entradasya.local', password: 'Cliente123' });
console.log(c.status === 201 ? '+ cliente: cliente@entradasya.local / Cliente123' : '= cliente ya existe: cliente@entradasya.local');
