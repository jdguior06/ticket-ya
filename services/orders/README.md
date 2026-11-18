# orders — EntradasYa

Gestiona las compras y **coordina el flujo**: reserva el cupo en events, cobra en payments, emite las entradas en tickets y pide el correo a notifications. Si algo falla, **compensa**: libera el cupo y reconcilia los pagos de resultado desconocido.

- Puerto: **3003** · Base de datos: **orders_db**
- Llama a: **events**, **payments**, **tickets**, **notifications** (siempre con timeout)
- Contrato completo: [`docs/CONTRATOS.md` §5](../../docs/CONTRATOS.md)

## Requisitos

| Herramienta | Versión |
|---|---|
| Node.js | 22 LTS |
| PostgreSQL | 16 o superior, con `infra/postgres/init.sql` ya ejecutado |
| Llave pública JWT | `keys/jwt-public.pem` |
| Servicios | events, payments, tickets y notifications levantados para comprar. Para ver el historial basta la BD |

## Variables de entorno

| Variable | Ejemplo | Descripción |
|---|---|---|
| `SERVICE_NAME` | `orders` | Nombre en logs y `/health` |
| `PORT` | `3003` | Puerto HTTP |
| `LOG_LEVEL` | `info` | `error`, `warn`, `info` o `debug` |
| `DATABASE_URL` | `postgresql://orders_user:orders_pass@localhost:5432/orders_db?schema=public` | Conexión a orders_db |
| `JWT_PUBLIC_KEY_PATH` | `../../keys/jwt-public.pem` | Valida los tokens de auth |
| `INTERNAL_API_KEY` | `dev-internal-key-cambiar` | **La misma** que en events, payments, tickets y notifications |
| `EVENTS_URL` · `PAYMENTS_URL` · `TICKETS_URL` · `NOTIFICATIONS_URL` | `http://localhost:3002` … | Direcciones de los servicios |
| `HTTP_TIMEOUT_MS` | `5000` | Tiempo máximo de cada llamada |
| `WEB_BASE_URL` | `https://localhost:5173` | Base del enlace "ver mis entradas" del correo |
| `RECONCILE_INTERVAL_MS` | `60000` | Cada cuánto corre el reconciliador (`0` lo desactiva) |
| `RECONCILE_MIN_AGE_MS` | `60000` | Solo toca órdenes sin cambios desde hace este tiempo (para no pisar una compra en curso) |
| `PENDING_TIMEOUT_MS` | `600000` | A los 10 min, una orden pendiente sin pago registrado se cancela y libera el cupo |

## Ejecutar en local (PowerShell)

```powershell
cd services\orders
Copy-Item .env.example .env
npm install
npx prisma migrate dev --name init   # SOLO la primera vez (luego: npx prisma migrate deploy)
npm run start:dev
```

Comprobar: `http://localhost:3003/health` → `{"status":"ok",...}`.

### Prueba completa del flujo (criterios de aceptación 2 y 3)

Con los 6 servicios y Mailpit levantados, desde la **raíz** del repo:

```powershell
node scripts/e2e-compra.mjs
```

Son 24 casos:
- compra completa con PDF y correo;
- evento agotado: no se compra y el cupo no se toca;
- tarjeta `0000` rechazada: el cupo se libera;
- doble clic en "Comprar" con la misma `Idempotency-Key`: una sola orden;
- permisos;
- historial y reporte del organizador;
- correo recibido en Mailpit.

### Probar las fallas a mano

| Prueba | Qué hacer | Qué debe pasar |
|---|---|---|
| Correo caído | Cierra Mailpit (o notifications) y compra | `201`, orden `PAID`, `notificationStatus: FAILED`. Al volver a abrirlo, el reconciliador manda el correo en ≤ 1 min |
| tickets caído | Detén tickets y compra | `201`, orden `PAID`, `ticketsStatus: FAILED`. Levántalo y llama `POST /orders/:id/retry-tickets`, o espera al reconciliador |
| payments caído | Detén payments y compra | `503 PAYMENT_PENDING`, la orden queda `PENDING` **con el cupo retenido**. Al levantar payments, a los 10 min pasa a `CANCELLED` (`PAYMENT_TIMEOUT`) y se devuelve el cupo |
| events caído | Detén events y compra | `503 DEPENDENCY_UNAVAILABLE`, orden `CANCELLED` |

Para no esperar minutos en las pruebas, usa en tu `.env`: `RECONCILE_INTERVAL_MS=1000`, `RECONCILE_MIN_AGE_MS=1500` y `PENDING_TIMEOUT_MS=8000`.

## Endpoints

| Método | Ruta | Acceso |
|---|---|---|
| POST | `/orders` (header opcional `Idempotency-Key`) | CUSTOMER |
| GET | `/orders/mine` | CUSTOMER |
| GET | `/orders/:id` | CUSTOMER dueño |
| POST | `/orders/:id/retry-tickets` | CUSTOMER dueño |
| GET | `/orders/reports/events/:eventId` | ORGANIZER dueño del evento |
| GET | `/health` | público |

```bash
curl -X POST http://localhost:3003/orders -H "Authorization: Bearer <TOKEN_CLIENTE>" \
  -H "Content-Type: application/json" -H "Idempotency-Key: compra-123456" \
  -d '{"eventId":"<uuid>","sectorId":"<uuid>","quantity":2,
       "card":{"number":"4111111111111111","holder":"DIEGO G","expMonth":12,"expYear":2028,"cvv":"123"}}'
```

| Respuesta | Cuándo |
|---|---|
| `201` orden `PAID` | Compra correcta (aunque tickets o el correo hayan fallado: mira `ticketsStatus` y `notificationStatus`) |
| `200` | Misma `Idempotency-Key`: devuelve la orden ya creada, sin volver a cobrar |
| `409 SOLD_OUT` / `EVENT_NOT_AVAILABLE` | Sin cupo, o evento no publicado o pasado. Orden `CANCELLED` |
| `402 PAYMENT_REJECTED` | Tarjeta rechazada (`details.reason`). Orden `REJECTED` y cupo liberado |
| `503 PAYMENT_PENDING` | No se pudo confirmar el pago. Orden `PENDING`; la resuelve el reconciliador |
| `503 DEPENDENCY_UNAVAILABLE` | events no responde. Orden `CANCELLED` |

Los errores de compra traen `details.orderId` y `details.order`, para que la web muestre el estado.

## Cómo funciona

```
POST /orders
 1. Orden PENDING ──► 2. events: reservar ──(SOLD_OUT)──► CANCELLED
                          │
                          ▼
                     3. payments: cobrar ──(REJECTED)──► liberar cupo ► REJECTED
                          │      └─(sin respuesta)──► consultar / reintentar ──► PENDING (reconciliador)
                          ▼
                     PAID ► 4. tickets: emitir ► 5. notifications: correo
                              (si fallan, la orden sigue PAID y se reintenta)
```

- **Nunca se libera un cupo sin saber qué pasó con el pago.** Si payments no responde, orders consulta `GET /payments/order/:id` y reintenta el `POST`, que es idempotente y no puede cobrar dos veces. Si sigue sin respuesta, la orden queda `PENDING` con el cupo retenido.
- **Reconciliador** (dentro de orders, cada `RECONCILE_INTERVAL_MS`):
  1. resuelve las órdenes `PENDING` consultando payments; si payments está caído, no las toca;
  2. reintenta liberar los cupos que events no pudo devolver (`release_pending`);
  3. reintenta emitir entradas y enviar correos pendientes (máximo 5 intentos de correo).

  Solo **consulta** payments: nunca vuelve a cobrar, porque no guarda los datos de la tarjeta.
- **Transiciones seguras:** cada cambio de estado es `UPDATE ... WHERE status = 'PENDING'`. Si la compra y el reconciliador actúan a la vez, solo uno gana.
- **Datos de tarjeta:** se validan y se reenvían a payments. No se guardan ni se escriben en los logs.
