# EntradasYa v1

Plataforma de venta de entradas para eventos, construida como microservicios. Proyecto de clase del módulo **Contenedores** (Diplomado DevSecOps, FICCT-U.A.G.R.M.).

- **Servicios:** NestJS (Node.js 22) con Prisma y PostgreSQL.
- **Web:** React + Vite + Tailwind.
- **Comunicación:** solo HTTP/JSON. Cada servicio tiene su propia base de datos.
- **Versión 1:** todo local, sin contenedores.

Contratos entre servicios: [`docs/CONTRATOS.md`](docs/CONTRATOS.md)

## Estructura

```
services/
  auth/           3001  usuarios, login, JWT
  events/         3002  eventos, sectores, cupos
  orders/         3003  compras (orquestador)
  payments/       3004  pagos simulados (interno)
  tickets/        3005  entradas, PDF y QR
  notifications/  3006  correos vía Mailpit (interno)
  checkin/        3007  ingreso al evento (lectura única del QR)
web/              5173  interfaz para cliente, organizador y portero
infra/postgres/         script de bases y usuarios
scripts/                utilidades (llaves JWT)
docs/                   contratos, asignación y bitácora
```

## Requisitos (Windows)

| Herramienta | Versión | Para qué |
|---|---|---|
| Node.js | 22 LTS | todos los servicios y la web |
| PostgreSQL | 16 o 17 | bases de datos |
| Mailpit | última | correo de prueba (`mailpit.exe`, SMTP 1025, web 8025) |
| Git | última | control de versiones |

## Puesta en marcha (primera vez)

```powershell
# 1. Bases de datos y usuarios (pide la contraseña del usuario postgres)
psql -U postgres -f infra/postgres/init.sql

# 2. Llaves para los JWT (crea la carpeta keys/, que no se sube a git)
node scripts/generate-jwt-keys.mjs

# 3. Mailpit (en otra terminal)
mailpit
#   -> bandeja en http://localhost:8025

# 4. Cada servicio: ver su README (copiar .env.example a .env, npm install, migrar, npm run start:dev)
```

## Levantar todo con un comando (PowerShell)

`scripts/dev.ps1` arranca Mailpit y los 6 servicios, cada uno en su ventana (**EntradasYa - auth**, **EntradasYa - events**, …). Primero revisa que estén Node, PostgreSQL, las llaves JWT, los `.env`, la misma `INTERNAL_API_KEY` en todos y los puertos libres. Después espera a que cada `/health` responda.

```powershell
.\scripts\dev.ps1 -Setup        # primera vez: crea .env, npm install, migraciones y seed
.\scripts\dev.ps1               # levantar todo
.\scripts\dev.ps1 -Status       # ver qué está arriba
.\scripts\dev.ps1 -Stop         # detener todo
.\scripts\dev.ps1 -Only auth,events   # solo algunos servicios
.\scripts\dev.ps1 -Background   # sin ventanas; logs en .dev\logs\
```

Si Windows dice que la ejecución de scripts está deshabilitada:
`powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1` (o una sola vez: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`).

Para Mailpit, el script lo busca en el PATH (`winget install --id axllent.mailpit`) o en la variable `MAILPIT_PATH`.

Con todo arriba, la prueba completa de compra es `node scripts/e2e-compra.mjs`.

## Datos de demostración

Con auth y events levantados: `node scripts/seed-demo.mjs`. Crea 4 eventos publicados, un cliente (`cliente@entradasya.local` / `Cliente123`) y un portero (`portero@entradasya.local` / `Portero123`). La web queda en **https://localhost:5173** (ver [`web/README.md`](web/README.md)).

## Usuarios de prueba

| Rol | Cómo se crea |
|---|---|
| Organizador | Semilla de auth (`npm run seed` en services/auth) |
| Portero | El organizador lo crea desde la web (`/organizador/personal`) |
| Cliente | Registro público en la web |

## Tarjetas de prueba (payments)

| Termina en | Resultado |
|---|---|
| `0000` | Rechazada (`CARD_DECLINED`) |
| `9999` | Rechazada (`INSUFFICIENT_FUNDS`) |
| fecha vencida | Rechazada (`CARD_EXPIRED`) |
| cualquier otra | Aprobada |
