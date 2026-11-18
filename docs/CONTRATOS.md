# EntradasYa v1 — Contratos entre servicios

> Este documento es la **fuente de verdad**. Si el código y este documento no coinciden, se corrige uno de los dos en el mismo cambio. Ningún servicio puede cambiar un contrato sin actualizar este archivo.

## 1. Convenciones generales

| Tema | Regla |
|---|---|
| Formato | HTTP + JSON (`Content-Type: application/json`). Fechas en ISO 8601 UTC (`2026-12-05T23:00:00.000Z`). |
| Identificadores | UUID v4 en todos los recursos. |
| Dinero | Enteros en **centavos** (`priceCents`, `amountCents`). Moneda fija `BOB`. Nunca `float`. |
| Nombres | Código, rutas y campos en inglés (`camelCase` en JSON). Documentación y textos de la interfaz en español. |
| Autenticación de usuarios | `Authorization: Bearer <JWT>` emitido por **auth**, firmado con **RS256**. Cada servicio lo valida con la llave pública (`JWT_PUBLIC_KEY_PATH`), sin llamar a auth. |
| Autenticación interna | Header `X-Internal-Key: <INTERNAL_API_KEY>` en todas las rutas `/internal/*` y en los servicios internos (payments, notifications). Sin header válido → `401`. **Es una sola clave compartida por todo el sistema**: el mismo valor en el `.env` de todos los servicios (en local: `dev-internal-key-cambiar`). |
| Tiempo máximo de espera | Toda llamada a otro servicio usa timeout (`HTTP_TIMEOUT_MS`, por defecto `5000`). Timeout o error de red → se trata como servicio caído. |
| Correlación | El servicio que inicia una cadena envía `X-Request-Id` (UUID). Los demás lo reenvían y lo escriben en sus logs. |
| Logs | Consola, una línea por evento: `2026-11-18T14:03:22.120Z INFO [orders] mensaje {json opcional}`. |

### 1.1 Formato de error (todos los servicios)

```json
{
  "statusCode": 409,
  "code": "SOLD_OUT",
  "message": "No hay cupo suficiente en el sector General",
  "details": {}
}
```

`code` es estable y en MAYÚSCULAS; la web decide el texto a mostrar según `code`. Códigos comunes: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `INTERNAL_ERROR` (500), `DEPENDENCY_UNAVAILABLE` (503).

### 1.2 Chequeo de salud (todos los servicios)

`GET /health` — **público en todos los servicios**: sin token y sin `X-Internal-Key`, **también en payments y notifications** (es la única excepción a "todas las rutas exigen `X-Internal-Key`"). Esos dos servicios igual quedan protegidos porque el gateway no los expone. El gateway tampoco expone los `/health`; se consultan directo al puerto de cada servicio.

- `200` → `{ "status": "ok", "service": "orders", "checks": { "db": "up" }, "uptimeSeconds": 120 }`
- `503` → `{ "status": "error", "service": "orders", "checks": { "db": "down" } }`

Servicios sin base de datos (notifications, web) revisan su dependencia principal (notifications → SMTP de Mailpit).

### 1.3 Roles y JWT

Roles: `CUSTOMER` (cliente), `ORGANIZER` (organizador), `DOORMAN` (portero).

Payload del token:

```json
{ "sub": "<userId>", "role": "CUSTOMER", "name": "Diego", "email": "diego@mail.com", "iat": 0, "exp": 0 }
```

Duración: `JWT_EXPIRES_IN` (por defecto `8h`).

## 2. Puertos y gateway

| Servicio | Puerto local | Base de datos | Expuesto por Nginx | Prefijo público |
|---|---|---|---|---|
| web (Vite) | 5173 | — | sí | `/` |
| auth | 3001 | auth_db | sí | `/api/auth` |
| events | 3002 | events_db | sí | `/api/events` |
| orders | 3003 | orders_db | sí | `/api/orders` |
| payments | 3004 | payments_db | **no** | — |
| tickets | 3005 | tickets_db | sí | `/api/tickets` |
| notifications | 3006 | — | **no** | — |
| checkin | 3007 | checkin_db | sí | `/api/checkin` |
| PostgreSQL | 5432 | — | no | — |
| Mailpit | 1025 (SMTP) / 8025 (web) | — | no | — |

El gateway (Nginx, o el proxy de Vite en desarrollo) elige el servicio por el segmento después de `/api` y **quita solo `/api`**; el nombre del servicio se mantiene, porque los controladores NestJS ya usan ese prefijo (`@Controller('events')`, `@Controller('auth')`, ...).

| Petición pública | Se reenvía a |
|---|---|
| `GET /api/auth/me` | `GET http://localhost:3001/auth/me` |
| `GET /api/events/123` | `GET http://localhost:3002/events/123` |
| `POST /api/orders` | `POST http://localhost:3003/orders` |
| `GET /api/tickets/abc/pdf` | `GET http://localhost:3005/tickets/abc/pdf` |
| `POST /api/checkin/scan` | `POST http://localhost:3007/checkin/scan` |

Como solo se reenvía `/api/<servicio>/...` → `/<servicio>/...`, las rutas `/internal/*` y `/health` **nunca** son alcanzables desde el gateway.

> En las tablas de abajo, "Ruta" es la ruta **dentro del servicio**.

---

## 3. auth (3001)

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/auth/register` | público | Crea un usuario `CUSTOMER`. |
| POST | `/auth/login` | público | Devuelve el JWT. |
| GET | `/auth/me` | token | Datos del usuario actual. |
| POST | `/auth/users` | ORGANIZER | Crea un usuario `ORGANIZER` o `DOORMAN`. |
| GET | `/auth/users?role=DOORMAN` | ORGANIZER | Lista usuarios por rol. |

Además, un script de semilla crea un organizador inicial (`SEED_ORGANIZER_EMAIL` / `SEED_ORGANIZER_PASSWORD`).

**POST /auth/register**
```json
// request
{ "name": "Diego", "email": "diego@mail.com", "password": "Secreta123" }
// 201
{ "id": "uuid", "name": "Diego", "email": "diego@mail.com", "role": "CUSTOMER", "createdAt": "..." }
```
Errores: `409 EMAIL_TAKEN`, `400 VALIDATION_ERROR` (password mínimo 8 caracteres).

**POST /auth/login**
```json
// request
{ "email": "diego@mail.com", "password": "Secreta123" }
// 200
{ "accessToken": "eyJ...", "expiresIn": "8h", "user": { "id": "uuid", "name": "Diego", "email": "diego@mail.com", "role": "CUSTOMER" } }
```
Errores: `401 INVALID_CREDENTIALS` (mismo error si el correo no existe o la contraseña falla).

Contraseñas: hash con **bcrypt** (10 rondas).

---

## 4. events (3002)

Estados: `DRAFT` (borrador), `PUBLISHED` (publicado), `CANCELLED` (cancelado).

Objeto evento:
```json
{
  "id": "uuid",
  "organizerId": "uuid",
  "name": "Concierto de Rock",
  "description": "texto",
  "venue": "Estadio Tahuichi",
  "startsAt": "2026-12-05T23:00:00.000Z",
  "imageUrl": "https://...",
  "status": "PUBLISHED",
  "sectors": [
    { "id": "uuid", "name": "General", "priceCents": 10000, "capacity": 500, "available": 498 }
  ],
  "createdAt": "...",
  "updatedAt": "..."
}
```

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/events?search=&from=` | público | Cartelera: solo `PUBLISHED`, ordenados por `startsAt`. Sin `from`, solo futuros. `from` acepta hasta 2 días atrás (la pantalla del portero lo usa para ver el evento de hoy ya empezado). |
| GET | `/events/:id` | público* | Detalle. *Si no está publicado, solo lo ve su organizador. |
| GET | `/events/mine` | ORGANIZER | Eventos del organizador (todos los estados). |
| POST | `/events` | ORGANIZER | Crea en `DRAFT`. Incluye sectores. |
| PATCH | `/events/:id` | ORGANIZER dueño | Edita. En `PUBLISHED` no se puede bajar `capacity` por debajo de lo vendido. |
| POST | `/events/:id/publish` | ORGANIZER dueño | `DRAFT` → `PUBLISHED`. Requiere al menos 1 sector. |
| POST | `/events/:id/cancel` | ORGANIZER dueño | → `CANCELLED`. |
| POST | `/internal/reservations` | interno (orders) | Reserva cupos. |
| POST | `/internal/reservations/:orderId/release` | interno (orders) | Libera cupos. |
| GET | `/internal/events/:id` | interno | Evento en cualquier estado (orders lo usa para reportes). |

**POST /events**
```json
{
  "name": "Concierto de Rock", "description": "texto", "venue": "Estadio Tahuichi",
  "startsAt": "2026-12-05T23:00:00.000Z", "imageUrl": "https://...",
  "sectors": [
    { "name": "General", "priceCents": 10000, "capacity": 500 },
    { "name": "VIP", "priceCents": 35000, "capacity": 50 }
  ]
}
```

**PATCH /events/:id** — todos los campos opcionales. `sectors` es la **lista completa**: con `id` → se actualiza; sin `id` → se crea; los que no vienen → se eliminan (solo si nunca tuvieron reservas).

Errores de gestión de eventos: `409 EVENT_NOT_EDITABLE` (cancelado), `409 SECTOR_HAS_SALES` (eliminar sector con reservas), `409 CAPACITY_BELOW_SOLD` (cupo menor a lo vendido), `409 INVALID_STATUS` (publicar algo que no es borrador), `409 NO_SECTORS`, `409 EVENT_IN_PAST`. Un evento de otro organizador responde `404` (no se revela que existe).

**POST /internal/reservations** — idempotente por `orderId` (si ya existe, devuelve la misma reserva con `200`).
```json
// request
{ "orderId": "uuid", "eventId": "uuid", "sectorId": "uuid", "quantity": 2 }
// 201
{
  "reservationId": "uuid", "orderId": "uuid", "status": "RESERVED",
  "event": { "id": "uuid", "name": "Concierto de Rock", "venue": "Estadio Tahuichi", "startsAt": "...", "organizerId": "uuid" },
  "sector": { "id": "uuid", "name": "General" },
  "quantity": 2, "unitPriceCents": 10000, "totalCents": 20000
}
```
Errores: `409 SOLD_OUT`, `409 EVENT_NOT_AVAILABLE` (no publicado, cancelado o pasado), `404 NOT_FOUND`.

Regla anti-sobreventa: el descuento se hace en una sola sentencia atómica
`UPDATE sectors SET available = available - :q WHERE id = :id AND available >= :q` (0 filas afectadas → `SOLD_OUT`).

**POST /internal/reservations/:orderId/release** — idempotente. `200 { "orderId": "uuid", "status": "RELEASED" }`. Si ya estaba liberada, mismo `200`.

---

## 5. orders (3003)

Estados: `PENDING` (pendiente), `PAID` (pagada), `REJECTED` (rechazada), `CANCELLED` (cancelada, p. ej. agotado).

Objeto orden:
```json
{
  "id": "uuid", "userId": "uuid", "status": "PAID",
  "eventId": "uuid", "eventName": "Concierto de Rock", "eventStartsAt": "...", "venue": "Estadio Tahuichi",
  "sectorId": "uuid", "sectorName": "General",
  "quantity": 2, "unitPriceCents": 10000, "totalCents": 20000,
  "failureCode": null,
  "ticketsStatus": "ISSUED",
  "notificationStatus": "SENT",
  "createdAt": "...", "updatedAt": "..."
}
```
`ticketsStatus`: `NOT_ISSUED` | `ISSUED` | `FAILED`. `notificationStatus`: `NOT_SENT` | `SENT` | `FAILED`.

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/orders` | CUSTOMER | Compra (orquesta todo el flujo). |
| GET | `/orders/mine` | CUSTOMER | Historial del cliente. |
| GET | `/orders/:id` | CUSTOMER dueño | Detalle. |
| POST | `/orders/:id/retry-tickets` | CUSTOMER dueño | Reintenta emitir entradas si `ticketsStatus = FAILED`. |
| GET | `/orders/reports/events/:eventId` | ORGANIZER dueño del evento | Ventas e ingresos del evento. |

**POST /orders**
```json
// request (Idempotency-Key: <uuid> opcional en headers)
{
  "eventId": "uuid", "sectorId": "uuid", "quantity": 2,
  "card": { "number": "4111111111111111", "holder": "DIEGO G", "expMonth": 12, "expYear": 2028, "cvv": "123" }
}
```
`quantity` de 1 a 6. Los datos de tarjeta **no se guardan**; solo se reenvían a payments.

Flujo (orden estricto):
1. Crea la orden `PENDING`.
2. events `POST /internal/reservations`. `SOLD_OUT` / `EVENT_NOT_AVAILABLE` → orden `CANCELLED`, responde `409` con ese `code`.
3. payments `POST /payments`. `REJECTED` → events `release`, orden `REJECTED`, responde `402 PAYMENT_REJECTED`. `APPROVED` → paso 4.
   **Si payments no responde (timeout o error de red) el resultado es desconocido**: payments pudo haber guardado la aprobación y perderse la respuesta. Por eso **nunca se libera el cupo sin confirmar**:
   1. orders consulta `GET /payments/order/:orderId`. `APPROVED` → paso 4. `REJECTED` → como arriba. `404` → reintenta `POST /payments` (es idempotente por `orderId`, no puede cobrar dos veces). Máximo 2 reintentos, con esperas de 500 ms y 1000 ms.
   2. Si aun así no hay respuesta: la orden **queda `PENDING` con el cupo reservado** y se responde `503 PAYMENT_PENDING` ("No pudimos confirmar el pago; revisa Mis compras en unos minutos").
   3. **Reconciliador** de orders: cada `RECONCILE_INTERVAL_MS` (por defecto 60000) revisa órdenes `PENDING` con más de 30 s y consulta `GET /payments/order/:orderId`:
      - `APPROVED` → `PAID` y continúa con los pasos 4 y 5;
      - `REJECTED` → `release` y `REJECTED`;
      - `404` y la orden tiene más de `PENDING_TIMEOUT_MS` (por defecto 600000 = 10 min) → `release` y `CANCELLED` con `failureCode: "PAYMENT_TIMEOUT"`;
      - payments sigue sin responder → no se toca, se reintenta en la siguiente vuelta.
   El reconciliador **solo consulta**, nunca reenvía el cobro (no tiene los datos de la tarjeta).
4. Orden `PAID`. tickets `POST /internal/tickets/issue`. Si falla → `ticketsStatus = FAILED` (la orden **sigue pagada**).
5. notifications `POST /notifications/order-confirmed`. Si falla → `notificationStatus = FAILED` (la compra **sigue siendo válida**).
6. Responde `201` con la orden.

Detalles de la implementación:
- **Idempotency-Key** (header opcional): de 8 a 100 caracteres `[A-Za-z0-9_-]`. Si el mismo cliente repite la clave → `200` con la misma orden, sin reservar ni cobrar de nuevo.
- Los datos de tarjeta se validan en orders (`400` **sin crear orden**) antes de reservar.
- Si events no responde al reservar → orden `CANCELLED` (`failureCode: EVENTS_UNAVAILABLE`), se intenta liberar y responde `503 DEPENDENCY_UNAVAILABLE`. Una liberación que falla queda marcada y la reintenta el reconciliador.
- El correo se envía **solo después de emitir las entradas** (el enlace debe funcionar). El reconciliador reintenta las entradas `FAILED` y los correos `FAILED` (máximo 5 intentos de correo).
- `POST /orders/:id/retry-tickets`: `409 INVALID_STATUS` si la orden no está `PAID`; `503 DEPENDENCY_UNAVAILABLE` si tickets sigue caído.
- Todos los errores de `POST /orders` incluyen `details.orderId` y `details.order` (estado actual). `402` incluye además `details.reason`.
- El objeto orden incluye `paidAt`. En el reporte, cada sector trae también `paidOrders`.

**GET /orders/reports/events/:eventId** — orders consulta `GET /internal/events/:id` para verificar que `organizerId` coincide con el token.
```json
{
  "eventId": "uuid", "eventName": "Concierto de Rock",
  "paidOrders": 40, "ticketsSold": 75, "revenueCents": 950000,
  "bySector": [ { "sectorId": "uuid", "sectorName": "General", "ticketsSold": 60, "revenueCents": 600000 } ],
  "rejectedOrders": 3
}
```

---

## 6. payments (3004) — interno

Todas las rutas exigen `X-Internal-Key`, excepto `GET /health`.

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/payments` | Procesa un cobro simulado. |
| GET | `/payments/order/:orderId` | Consulta la transacción de una orden: `200` con el mismo objeto que devuelve `POST /payments`, o `404 NOT_FOUND` si esa orden no tiene transacción. |

**POST /payments** — idempotente por `orderId`: si la orden ya tiene transacción, devuelve **la misma** (`200`) sin cobrar de nuevo.
```json
// request
{ "orderId": "uuid", "amountCents": 20000, "currency": "BOB",
  "card": { "number": "4111111111111111", "holder": "DIEGO G", "expMonth": 12, "expYear": 2028, "cvv": "123" } }
// 201 (nuevo) o 200 (repetido)
{ "paymentId": "uuid", "orderId": "uuid", "status": "APPROVED", "reason": null,
  "amountCents": 20000, "currency": "BOB", "cardLast4": "1111", "createdAt": "..." }
```
Reglas de simulación (en este orden):
- Tarjeta terminada en `0000` → `REJECTED`, `reason: "CARD_DECLINED"`.
- Tarjeta terminada en `9999` → `REJECTED`, `reason: "INSUFFICIENT_FUNDS"`.
- Tarjeta vencida → `REJECTED`, `reason: "CARD_EXPIRED"`.
- Cualquier otra → `APPROVED`.

Validaciones: `amountCents` entero **≥ 1**. Si llega un `orderId` que ya tiene transacción pero con **otro `amountCents`**, responde `409 IDEMPOTENCY_CONFLICT` (no devuelve en silencio el pago anterior, porque sería un error de orders).

Se guarda solo `cardLast4`, nunca el número completo ni el CVV. Un rechazo responde igual `201`/`200` (es un resultado válido, no un error HTTP).

---

## 7. tickets (3005)

Objeto entrada:
```json
{
  "id": "uuid", "code": "EY-7KQ2-M9XD-4TPA", "orderId": "uuid", "userId": "uuid",
  "eventId": "uuid", "eventName": "Concierto de Rock", "venue": "Estadio Tahuichi", "eventStartsAt": "...",
  "sectorName": "General", "holderName": "Diego", "status": "VALID", "pdfUrl": "/api/tickets/uuid/pdf",
  "createdAt": "..."
}
```
`status`: `VALID` | `VOID`. Código: `EY-` + 12 caracteres aleatorios (alfabeto sin `0/O/1/I`), generado con `crypto.randomBytes`. El QR contiene **solo el código**.

PDF: uno por entrada, en `TICKETS_STORAGE_DIR/<orderId>/<ticketId>.pdf`.

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/tickets/mine` | CUSTOMER | Todas las entradas del cliente. |
| GET | `/tickets/order/:orderId` | CUSTOMER dueño | Entradas de una orden. |
| GET | `/tickets/:id/pdf` | CUSTOMER dueño | Descarga el PDF (`application/pdf`). |
| POST | `/internal/tickets/issue` | interno (orders) | Emite entradas y PDFs. |
| GET | `/internal/tickets/validate?code=&eventId=` | interno (checkin) | Valida un código. |

**POST /internal/tickets/issue** — idempotente por `orderId`.
```json
// request
{
  "orderId": "uuid", "userId": "uuid", "holderName": "Diego", "holderEmail": "diego@mail.com",
  "event": { "id": "uuid", "name": "Concierto de Rock", "venue": "Estadio Tahuichi", "startsAt": "..." },
  "sector": { "id": "uuid", "name": "General" },
  "quantity": 2
}
// 201 (o 200 si ya existían)
{ "orderId": "uuid", "tickets": [ { "...objeto entrada..." } ] }
```

Si la orden ya tiene entradas con otro `userId`, evento o sector, o con más entradas que `quantity` → `409 IDEMPOTENCY_CONFLICT`. Si tiene menos (un intento anterior quedó a medias), se completan las que falten.

**GET /internal/tickets/validate**
```json
// 200 (siempre 200; el resultado va en el cuerpo)
{ "valid": true, "reason": null, "ticket": { "id": "uuid", "code": "EY-...", "eventId": "uuid", "holderName": "Diego", "sectorName": "General" } }
// código inexistente
{ "valid": false, "reason": "INVALID_CODE", "ticket": null }
// de otro evento
{ "valid": false, "reason": "WRONG_EVENT", "ticket": { "...": "..." } }
// anulada
{ "valid": false, "reason": "TICKET_VOID", "ticket": { "...": "..." } }
```
tickets **no** sabe si la entrada ya se usó: eso lo controla checkin.

El `code` se normaliza (sin espacios y en mayúsculas). Un código con formato inválido **no** devuelve 400: responde `200` con `valid: false` y `INVALID_CODE`, para que el portero vea el motivo. El `/health` de tickets también revisa que la carpeta de PDFs se pueda escribir (`checks.storage`).

---

## 8. notifications (3006) — interno

Todas las rutas exigen `X-Internal-Key`, excepto `GET /health`. Envía por SMTP a Mailpit. No guarda datos; solo logs.

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/notifications/order-confirmed` | Correo de confirmación de compra. |
| POST | `/notifications/welcome` | (Opcional) Bienvenida. |

**POST /notifications/order-confirmed**
```json
// request
{
  "to": "diego@mail.com", "customerName": "Diego", "orderId": "uuid",
  "eventName": "Concierto de Rock", "venue": "Estadio Tahuichi", "eventStartsAt": "...",
  "sectorName": "General", "quantity": 2, "totalCents": 20000,
  "ticketsUrl": "http://localhost:5173/mis-entradas?orden=uuid"
}
// 202
{ "status": "SENT", "messageId": "<...>" }
```
Si el SMTP falla → `503 DEPENDENCY_UNAVAILABLE` (orders lo registra y sigue).

---

## 9. checkin (3007)

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/checkin/scan` | DOORMAN | Valida y registra un ingreso. |
| GET | `/checkin/events/:eventId/stats` | DOORMAN u ORGANIZER | Total de ingresos del evento. |
| GET | `/checkin/events/:eventId/recent?limit=20` | DOORMAN u ORGANIZER | Últimos ingresos. |

**POST /checkin/scan**
```json
// request
{ "code": "EY-7KQ2-M9XD-4TPA", "eventId": "uuid" }
// 200 permitido
{ "allowed": true, "reason": null, "checkedInAt": "...", "ticket": { "code": "EY-...", "holderName": "Diego", "sectorName": "General" }, "totalCheckedIn": 76 }
// 200 rechazado
{ "allowed": false, "reason": "ALREADY_USED", "firstCheckedInAt": "2026-12-05T23:41:10.000Z", "ticket": { "...": "..." } }
```
`reason`: `INVALID_CODE` | `WRONG_EVENT` | `TICKET_VOID` | `ALREADY_USED`. Si tickets no responde → `503 DEPENDENCY_UNAVAILABLE` (la web muestra "Sin conexión, reintente").

**GET /checkin/events/:eventId/stats**
```json
{ "eventId": "uuid", "totalCheckedIn": 76, "lastCheckInAt": "2026-12-05T23:41:10.000Z" }
```

**GET /checkin/events/:eventId/recent?limit=20** (máximo 100, más reciente primero)
```json
[ { "code": "EY-...", "holderName": "Diego", "sectorName": "General", "checkedInAt": "...", "doormanId": "uuid" } ]
```

Lectura única: la tabla de ingresos tiene restricción `UNIQUE (ticket_id)`. Dos escaneos simultáneos → solo uno gana; el otro recibe `ALREADY_USED`.

Se guarda: `ticketId`, `code`, `eventId`, `doormanId` (del token), `checkedInAt`.

---

## 10. web (5173)

Rutas de la interfaz:

| Ruta | Rol | Pantalla |
|---|---|---|
| `/` | todos | Cartelera |
| `/eventos/:id` | todos | Detalle y compra |
| `/login`, `/registro` | público | Acceso |
| `/mis-compras` | CUSTOMER | Historial de órdenes |
| `/mis-entradas` | CUSTOMER | Entradas y descarga de PDF |
| `/organizador` | ORGANIZER | Mis eventos |
| `/organizador/eventos/nuevo`, `/organizador/eventos/:id` | ORGANIZER | Crear / editar / publicar |
| `/organizador/eventos/:id/ventas` | ORGANIZER | Ventas e ingresos |
| `/organizador/personal` | ORGANIZER | Crear porteros |
| `/portero` | DOORMAN | Elegir evento y escanear (cámara del teléfono o código a mano) |

El token se guarda en `localStorage` y se envía en cada petición. El escáner usa la cámara trasera; en desarrollo Vite corre con HTTPS para que el teléfono permita la cámara.

---

## Historial de cambios

| Fecha | Cambio | Pedido por |
|---|---|---|
| 2026-11-18 | v1 inicial. | Claude |
| 2026-11-18 | §2: el gateway quita solo `/api` (con tabla de ejemplos). §1.2, §6 y §8: `/health` es público también en payments y notifications. §5 paso 3: un timeout de payments ya no libera el cupo; se reconcilia con `GET /payments/order/:orderId`, reintentos idempotentes y reconciliador periódico (`503 PAYMENT_PENDING`). §6: `GET /payments/order/:orderId` responde `404` si no hay transacción. | Revisión de Codex |
| 2026-11-18 | §4: semántica de `PATCH /events/:id` (lista completa de sectores) y códigos de error de gestión de eventos. | Claude (implementación de events) |
| 2026-11-18 | §1: `INTERNAL_API_KEY` es una sola clave compartida. §6: `amountCents ≥ 1` y `409 IDEMPOTENCY_CONFLICT` si se repite un `orderId` con otro monto. | Claude (revisión de payments) |
| 2026-11-18 | §7: `409 IDEMPOTENCY_CONFLICT` en la emisión, normalización del código en la validación y chequeo de la carpeta en `/health`. | Claude (implementación de tickets) |
| 2026-11-18 | §5: detalles de orders (Idempotency-Key, validación previa de tarjeta, events caído, correo después de las entradas, reintentos del reconciliador, `details.order` en errores, `paidAt`). | Claude (implementación de orders) |
| 2026-11-18 | §4: `from` en la cartelera acepta hasta 2 días atrás (para el portero). | Claude (web) |
| 2026-11-18 | §9: forma de las respuestas de `stats` y `recent` de checkin (la web usa `totalCheckedIn`). | Claude (web) |
