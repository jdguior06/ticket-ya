# auth — EntradasYa

Gestiona usuarios, roles e inicio de sesión. Emite tokens **JWT RS256** que los demás servicios validan con la llave pública, sin llamar a auth.

- Puerto: **3001** · Base de datos: **auth_db** · Llama a: ningún servicio
- Contrato completo: [`docs/CONTRATOS.md` §3](../../docs/CONTRATOS.md)

## Requisitos

| Herramienta | Versión |
|---|---|
| Node.js | 22 LTS |
| PostgreSQL | 16 o superior, con `infra/postgres/init.sql` ya ejecutado |
| Llaves JWT | `node scripts/generate-jwt-keys.mjs` ejecutado desde la raíz del repo |

## Variables de entorno

| Variable | Ejemplo | Descripción |
|---|---|---|
| `SERVICE_NAME` | `auth` | Nombre que aparece en logs y en `/health` |
| `PORT` | `3001` | Puerto HTTP |
| `LOG_LEVEL` | `info` | `error`, `warn`, `info` o `debug` |
| `DATABASE_URL` | `postgresql://auth_user:auth_pass@localhost:5432/auth_db?schema=public` | Conexión a auth_db |
| `JWT_PRIVATE_KEY_PATH` | `../../keys/jwt-private.pem` | Llave privada (solo auth la tiene) |
| `JWT_PUBLIC_KEY_PATH` | `../../keys/jwt-public.pem` | Llave pública |
| `JWT_EXPIRES_IN` | `8h` | Duración del token |
| `CORS_ORIGIN` | `https://localhost:5173` | Opcional. Solo si el navegador llama directo sin gateway |
| `SEED_ORGANIZER_NAME` / `_EMAIL` / `_PASSWORD` | ver `.env.example` | Organizador inicial que crea `npm run seed` |

## Ejecutar en local (PowerShell)

```powershell
cd services\auth
Copy-Item .env.example .env          # 1. variables (ajusta si cambiaste contraseñas)
npm install                          # 2. dependencias (también genera el cliente Prisma)
npx prisma migrate dev --name init   # 3. SOLO la primera vez: crea la migración y las tablas
npm run seed                         # 4. crea el organizador inicial
npm run start:dev                    # 5. arranca con recarga automática
```

En Linux es igual, cambiando `Copy-Item` por `cp` y `\` por `/`.

Las veces siguientes basta con `npm run start:dev`. Si otra persona clona el repo, en el paso 3 usa `npx prisma migrate deploy` (aplica las migraciones que ya existen sin crear nuevas).

| Script | Para qué |
|---|---|
| `npm run start:dev` | Desarrollo con recarga |
| `npm run build` / `npm run start:prod` | Compilar y ejecutar `dist/` |
| `npm run lint` | Revisión estática |
| `npm run prisma:studio` | Ver y editar los datos en el navegador |
| `npm run seed` | Crear o actualizar el organizador inicial |

## Probar con curl

```bash
# Salud (200 si la BD responde, 503 si no)
curl http://localhost:3001/health

# Registro (siempre crea CUSTOMER)
curl -X POST http://localhost:3001/auth/register -H "Content-Type: application/json" \
  -d '{"name":"Diego","email":"diego@mail.com","password":"Secreta123"}'

# Login -> accessToken
curl -X POST http://localhost:3001/auth/login -H "Content-Type: application/json" \
  -d '{"email":"diego@mail.com","password":"Secreta123"}'

# Usuario actual
curl http://localhost:3001/auth/me -H "Authorization: Bearer <TOKEN>"

# Organizador crea un portero
curl -X POST http://localhost:3001/auth/users -H "Authorization: Bearer <TOKEN_ORGANIZADOR>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Portero Uno","email":"portero1@mail.com","password":"Portero123","role":"DOORMAN"}'
```

En PowerShell, `curl` es un alias distinto: usa `curl.exe` con las comillas escapadas, o `Invoke-RestMethod`:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3001/auth/login -ContentType "application/json" `
  -Body '{"email":"organizador@entradasya.local","password":"Organizador123"}'
```

## Estructura

```
src/
  main.ts                 arranque: logger, validación, filtro de errores, X-Request-Id
  app.module.ts           módulos, variables requeridas y chequeo de salud
  common/                 PLANTILLA que copian los demás servicios
    auth/                 JwtAuthGuard, RolesGuard + @Roles, InternalKeyGuard, @CurrentUser
    errors/               AppException y filtro global { statusCode, code, message, details }
    health/               GET /health
    http/http-client.ts   llamadas a otros servicios con timeout (auth no lo usa)
    logger/               logs: fecha ISO, nivel, [servicio], mensaje
    config/env.ts         valida variables al arrancar
  prisma/                 PrismaService (adaptador pg)
  users/                  controlador /auth, servicio y DTOs
  generated/prisma/       cliente generado (no se sube a git)
prisma/
  schema.prisma           modelo User
  seed.ts                 organizador inicial
```

## Seguridad
- Contraseñas con bcrypt (10 rondas); nunca se devuelven ni se loguean.
- El login responde igual si el correo no existe o la contraseña está mal, y tarda lo mismo en ambos casos.
- El registro público no permite elegir rol; solo un `ORGANIZER` crea porteros u organizadores.
- La llave privada (`keys/`) está en `.gitignore`.
