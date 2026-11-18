// Crea (o actualiza) el organizador inicial.  Uso: npm run seed
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const email = (process.env.SEED_ORGANIZER_EMAIL ?? 'organizador@entradasya.local').toLowerCase();
const password = process.env.SEED_ORGANIZER_PASSWORD ?? 'Organizador123';
const name = process.env.SEED_ORGANIZER_NAME ?? 'Organizador Demo';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const passwordHash = await bcrypt.hash(password, 10);
const user = await prisma.user.upsert({
  where: { email },
  update: { role: 'ORGANIZER', passwordHash, name },
  create: { email, name, passwordHash, role: 'ORGANIZER' },
});
console.log(`Organizador listo: ${user.email} (id ${user.id})`);
await prisma.$disconnect();
