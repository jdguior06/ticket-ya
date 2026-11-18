# tickets — EntradasYa

Genera una entrada por asiento con un **código único** y un **PDF con QR**, permite al cliente descargarlas y le dice a checkin si un código es válido.

- Puerto: **3005** · Base de datos: **tickets_db** · Archivos: carpeta local `TICKETS_STORAGE_DIR`
- Llama a: ningún servicio. Le llaman **orders** (emitir) y **checkin** (validar).
- Contrato completo: [`docs/CONTRATOS.md` §7](../../docs/CONTRATOS.md)

## Requisitos

| Herramienta | Versión |
|---|---|
| Node.js | 22 LTS |
| PostgreSQL | 16 o superior, con `infra/postgres/init.sql` ya ejecutado |
| Llave pública JWT | `keys/jwt-public.pem` |

Las librerías de PDF (`pdfkit`) y QR (`qrcode`) son JavaScript puro: no necesitan compilación nativa en Windows ni en Docker.

## Variables de entorno

| Variable | Ejemplo | Descripción |
|---|---|---|
| `SERVICE_NAME` | `tickets` | Nombre en logs y `/health` |
| `PORT` | `3005` | Puerto HTTP |
| `LOG_LEVEL` | `info` | `error`, `warn`, `info` o `debug` |
| `DATABASE_URL` | `postgresql://tickets_user:tickets_pass@localhost:5432/tickets_db?schema=public` | Conexión a tickets_db |
| `JWT_PUBLIC_KEY_PATH` | `../../keys/jwt-public.pem` | Valida los tokens de auth |
| `INTERNAL_API_KEY` | `dev-internal-key-cambiar` | Clave interna compartida por todo el sistema |
| `TICKETS_STORAGE_DIR` | `../../storage/tickets` | Carpeta de los PDF (se crea sola; `storage/` está en `.gitignore`) |
| `TICKETS_PUBLIC_BASE_PATH` | `/api/tickets` | Prefijo del `pdfUrl` que ve la web (pasa por el gateway) |

## Ejecutar en local (PowerShell)

```powershell
cd services\tickets
Copy-Item .env.example .env
npm install
npx prisma migrate dev --name init   # SOLO la primera vez (luego: npx prisma migrate deploy)
npm run start:dev
```

Comprobar: `http://localhost:3005/health` → `{"status":"ok","checks":{"db":"up","storage":"up"}}`. Revisa la base de datos y que la carpeta de PDFs exista y se pueda escribir.

### Prueba completa automática

Con **auth** y **tickets** levantados:

```powershell
node scripts/smoke-test.mjs
```

Son 23 casos:
- emisión, reintentos idempotentes y 5 emisiones simultáneas de la misma orden;
- permisos: un cliente no ve ni descarga las entradas de otro;
- descarga del PDF;
- validación: código válido, de otro evento, inexistente, escrito a mano en minúsculas o con basura.

## Endpoints

| Método | Ruta | Acceso |
|---|---|---|
| GET | `/tickets/mine` | CUSTOMER |
| GET | `/tickets/order/:orderId` | CUSTOMER dueño |
| GET | `/tickets/:id/pdf` | CUSTOMER dueño (descarga `application/pdf`) |
| POST | `/internal/tickets/issue` | X-Internal-Key (orders) |
| GET | `/internal/tickets/validate?code=&eventId=` | X-Internal-Key (checkin) |
| GET | `/health` | público |

```bash
# Emitir (lo hace orders)
curl -X POST http://localhost:3005/internal/tickets/issue -H "X-Internal-Key: dev-internal-key-cambiar" \
  -H "Content-Type: application/json" \
  -d '{"orderId":"<uuid>","userId":"<uuid>","holderName":"Diego","holderEmail":"diego@mail.com",
       "event":{"id":"<uuid>","name":"Concierto de Rock","venue":"Estadio Tahuichi","startsAt":"2026-12-05T23:00:00.000Z"},
       "sector":{"id":"<uuid>","name":"General"},"quantity":2}'

# Validar (lo hace checkin)
curl "http://localhost:3005/internal/tickets/validate?code=EY-7KQ2-M9XD-4TPA&eventId=<uuid>" -H "X-Internal-Key: dev-internal-key-cambiar"

# Descargar (cliente)
curl -o entrada.pdf http://localhost:3005/tickets/<ticketId>/pdf -H "Authorization: Bearer <TOKEN>"
```

## Cómo funciona

- **Código:** `EY-XXXX-XXXX-XXXX`, con 12 caracteres aleatorios de `crypto.randomBytes` (60 bits). Sin `0/O/1/I`, para que el portero no los confunda si lo escribe a mano. El QR contiene **solo el código**.
- **Emisión idempotente:**
  - cada entrada tiene `seq` (1..cantidad) y la combinación `(orderId, seq)` es única;
  - un candado de PostgreSQL por orden hace que los pedidos simultáneos se ejecuten de uno en uno;
  - si orders reintenta, recibe las mismas entradas y se completan las que falten;
  - si la orden ya existe con otro usuario, evento o sector, responde `409 IDEMPOTENCY_CONFLICT`.
- **PDF:**
  - uno por entrada, en `TICKETS_STORAGE_DIR/<orderId>/<ticketId>.pdf`;
  - se escribe en un archivo temporal y luego se renombra, así nunca queda un PDF a medias;
  - si un archivo se borra, se regenera al descargarlo.
- **Validación:**
  - siempre responde `200`, con `valid` y `reason` (`INVALID_CODE`, `WRONG_EVENT`, `TICKET_VOID`);
  - tickets **no** sabe si la entrada ya se usó: eso lo controla checkin;
  - el código se normaliza (mayúsculas, sin espacios) por si el portero lo escribe a mano.
- **Datos del evento:** se copian al emitir, porque tickets nunca lee la base de events.
