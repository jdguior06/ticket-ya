# events — EntradasYa

Administra el catálogo de eventos, sus sectores (precio y cupo) y las **reservas de cupo** que pide orders. Garantiza que **nunca se venda más que el cupo**.

- Puerto: **3002** · Base de datos: **events_db** · Llama a: ningún servicio (solo responde)
- Contrato completo: [`docs/CONTRATOS.md` §4](../../docs/CONTRATOS.md)

## Requisitos

| Herramienta | Versión |
|---|---|
| Node.js | 22 LTS |
| PostgreSQL | 16 o superior, con `infra/postgres/init.sql` ya ejecutado |
| Llave pública JWT | `keys/jwt-public.pem` (la genera `node scripts/generate-jwt-keys.mjs` en la raíz) |

## Variables de entorno

| Variable | Ejemplo | Descripción |
|---|---|---|
| `SERVICE_NAME` | `events` | Nombre en logs y `/health` |
| `PORT` | `3002` | Puerto HTTP |
| `LOG_LEVEL` | `info` | `error`, `warn`, `info` o `debug` |
| `DATABASE_URL` | `postgresql://events_user:events_pass@localhost:5432/events_db?schema=public` | Conexión a events_db |
| `JWT_PUBLIC_KEY_PATH` | `../../keys/jwt-public.pem` | Valida los tokens de auth (sin llamarlo) |
| `INTERNAL_API_KEY` | `dev-internal-key-cambiar` | Clave de las rutas `/internal/*`. **Debe ser la misma en orders** |
| `CORS_ORIGIN` | `https://localhost:5173` | Opcional, solo sin gateway |

## Ejecutar en local (PowerShell)

```powershell
cd services\events
Copy-Item .env.example .env
npm install
npx prisma migrate dev --name init   # SOLO la primera vez (luego: npx prisma migrate deploy)
npm run start:dev
```

Comprobar: `http://localhost:3002/health` → `{"status":"ok",...}`.

### Prueba completa automática

Con **auth** y **events** levantados (y el seed de auth ejecutado):

```powershell
node scripts/smoke-test.mjs
```

Recorre 36 casos: permisos por rol, borradores ocultos, publicar o cancelar, edición de sectores, reservas idempotentes, agotado, liberación y **concurrencia**: 10 compras simultáneas con 3 cupos → ganan exactamente 3 y el disponible nunca queda negativo.

## Endpoints

| Método | Ruta | Acceso |
|---|---|---|
| GET | `/events?search=&from=` | público (cartelera) |
| GET | `/events/mine` | ORGANIZER |
| GET | `/events/:id` | público; si no está publicado, solo su organizador |
| POST | `/events` | ORGANIZER |
| PATCH | `/events/:id` | ORGANIZER dueño |
| POST | `/events/:id/publish` · `/events/:id/cancel` | ORGANIZER dueño |
| POST | `/internal/reservations` | X-Internal-Key (orders) |
| POST | `/internal/reservations/:orderId/release` | X-Internal-Key (orders) |
| GET | `/internal/events/:id` | X-Internal-Key |
| GET | `/health` | público |

### Ejemplos con curl

```bash
TOKEN=<token de organizador>   # POST http://localhost:3001/auth/login

# Crear (queda en DRAFT). Precios en centavos: 10000 = Bs 100
curl -X POST http://localhost:3002/events -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Concierto de Rock","venue":"Estadio Tahuichi","startsAt":"2026-12-20T23:00:00.000Z",
       "sectors":[{"name":"General","priceCents":10000,"capacity":500},{"name":"VIP","priceCents":35000,"capacity":50}]}'

# Publicar
curl -X POST http://localhost:3002/events/<ID>/publish -H "Authorization: Bearer $TOKEN"

# Cartelera
curl "http://localhost:3002/events?search=rock"

# Reservar (lo hace orders)
curl -X POST http://localhost:3002/internal/reservations -H "X-Internal-Key: dev-internal-key-cambiar" \
  -H "Content-Type: application/json" \
  -d '{"orderId":"<uuid>","eventId":"<ID>","sectorId":"<SECTOR_ID>","quantity":2}'
```

## Reglas importantes

- **Anti-sobreventa:** el cupo se descuenta con una sola sentencia `UPDATE ... SET available = available - n WHERE available >= n`. Si no afecta filas, responde `SOLD_OUT`. Nunca se lee el cupo, se calcula en Node y luego se escribe: eso permitiría vender de más con compras simultáneas.
- **Idempotencia:** reservar dos veces la misma `orderId` devuelve la misma reserva (`200`) sin descontar de nuevo. Liberar dos veces devuelve el cupo una sola vez.
- **Edición de sectores (`PATCH`):** `sectors` es la lista completa. Con `id` se actualiza, sin `id` se crea, y los que no vienen se eliminan, siempre que no tengan reservas. El cupo no puede quedar por debajo de lo vendido (`CAPACITY_BELOW_SOLD`).
- **Errores propios:** `SOLD_OUT`, `EVENT_NOT_AVAILABLE`, `EVENT_NOT_EDITABLE`, `SECTOR_HAS_SALES`, `CAPACITY_BELOW_SOLD`, `INVALID_STATUS`, `NO_SECTORS`, `EVENT_IN_PAST`.
- Cancelar un evento impide nuevas ventas. Las entradas ya vendidas no se anulan en la v1.
