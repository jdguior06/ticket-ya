import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Configuración de Prisma 7: la URL de la base sale de DATABASE_URL (.env).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // process.env (y no env()) para que `prisma generate` funcione aunque aún no exista .env
    url: process.env.DATABASE_URL ?? '',
  },
});
