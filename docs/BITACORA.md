# Bitácora de EntradasYa

Registrar aquí cada problema de instalación, versiones, ejecución o despliegue.

| Fecha | Servicio / herramienta | Problema | Causa | Solución |
|---|---|---|---|---|
| 2026-11-18 | repo | Inicio del proyecto: se definen contratos y estructura del monorepo. | — | — |
| 2026-11-18 | npm 10 | `npm install` sin lockfile falla con `Cannot read properties of null (reading 'edgesOut')` en el template de NestJS 12. | Bug de npm al resolver dependencias *peer* del template. | Primera instalación con `--legacy-peer-deps`; desde que existe `package-lock.json`, `npm install` / `npm ci` funcionan normal. |
| 2026-11-18 | Prisma 7 | En el entorno de Claude no se puede descargar el `schema-engine` (dominio binaries.prisma.sh bloqueado). | Restricción de red del entorno de IA, no del proyecto. | `prisma generate` funciona sin el binario; la migración inicial la crea Diego en su PC con `npx prisma migrate dev --name init`. |
