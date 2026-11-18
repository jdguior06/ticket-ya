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
  checkin/        3007  ingreso al evento
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
