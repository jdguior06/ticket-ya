// Datos de demostración para presentar EntradasYa.
// Requiere auth y events levantados y el seed de auth (organizador inicial).
// Uso (desde la raíz):  node scripts/seed-demo.mjs
//
// Crea (si no existen): los eventos publicados (con foto), un portero y un cliente.
// Foto de cada evento: scripts/demo-fotos/<nombre-del-evento>.jpg|png|webp si existe
// (ej. "noche-de-jazz-en-el-patio.jpg"); si no, se genera una portada de colores.
//   Cliente:  cliente@entradasya.local  / Cliente123
//   Portero:  portero@entradasya.local  / Portero123
//   Organizador (del seed de auth): organizador@entradasya.local / Organizador123
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

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
  {
    name: 'Concierto: Los Angeles Azules',
    venue: 'Casa de la Cultura',
    startsAt: at(0, 19, 55),
    description: 'Los angeles azules en vivo. Cupo limitado.',
    sectors: [{ name: 'Asistente', priceCents: 10000, capacity: 8 }],
  },
];

// ---------- Fotos ----------
const FOTOS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'demo-fotos');
const slug = (name) =>
  name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

const PALETAS = [
  [[233, 30, 140], [255, 183, 3]],
  [[18, 52, 86], [0, 180, 160]],
  [[94, 23, 235], [255, 99, 132]],
  [[10, 70, 40], [190, 230, 80]],
  [[200, 60, 20], [255, 210, 120]],
  [[20, 20, 60], [120, 140, 255]],
];

/** Portada PNG 1200x675: degradado diagonal con dos círculos de luz, distinta para cada nombre. */
function portada(name) {
  const W = 1200;
  const H = 675;
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [a, b] = PALETAS[h % PALETAS.length];
  const c1 = [(h % 700) + 250, (h >> 8) % 400 + 100, 260];
  const c2 = [(h >> 4) % 500 + 100, (h >> 12) % 300 + 300, 200];
  const raw = Buffer.alloc((W * 3 + 1) * H);
  let o = 0;
  for (let y = 0; y < H; y++) {
    raw[o++] = 0;
    for (let x = 0; x < W; x++) {
      const t = (x / W) * 0.65 + (y / H) * 0.35;
      let glow = 0;
      for (const [cx, cy, r] of [c1, c2]) glow += Math.max(0, 1 - Math.hypot(x - cx, y - cy) / r) ** 2 * 0.35;
      for (let i = 0; i < 3; i++) raw[o++] = Math.min(255, Math.round(a[i] + (b[i] - a[i]) * t + 255 * glow));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 2; // RGB
  return {
    data: Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
    type: 'image/png',
    file: 'portada.png',
  };
}

function fotoDe(name) {
  for (const [ext, type] of [['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp']]) {
    const path = join(FOTOS_DIR, `${slug(name)}.${ext}`);
    if (existsSync(path)) return { data: readFileSync(path), type, file: `foto.${ext}` };
  }
  return portada(name);
}

async function subirFoto(event) {
  const foto = fotoDe(event.name);
  const form = new FormData();
  form.append('image', new Blob([foto.data], { type: foto.type }), foto.file);
  const r = await fetch(`${EVENTS}/events/${event.id}/image`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${org}` },
    body: form,
  }).catch(() => null);
  if (r?.ok) console.log(`  foto: ${foto.file === 'portada.png' ? 'portada generada' : `demo-fotos/${slug(event.name)}`}`);
  else console.error(`  no se pudo subir la foto de "${event.name}" (${r ? r.status : 'sin respuesta'})`);
}

// ---------- Eventos ----------
const mine = (await req('GET', `${EVENTS}/events/mine`, null, org)).body ?? [];
for (const e of demo) {
  const existing = mine.find((m) => m.name === e.name && m.status !== 'CANCELLED');
  if (existing) {
    console.log(`= ya existe: ${e.name}`);
    if (!existing.imageUrl) await subirFoto(existing);
    continue;
  }
  const created = await req('POST', `${EVENTS}/events`, e, org);
  if (created.status !== 201) {
    console.error(`No se pudo crear "${e.name}":`, created.body);
    continue;
  }
  await subirFoto(created.body);
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
