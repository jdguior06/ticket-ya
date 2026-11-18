# Checkin

Valida el código de una entrada con `tickets` y registra un único ingreso por entrada. El portero puede escanear con la cámara o ingresar el código manualmente desde `/portero`. Porteros y organizadores pueden consultar el total y los ingresos recientes del evento.

## Requisitos

Node.js 22 LTS (22.22.3 o posterior de la serie 22), npm y PostgreSQL 16 o 17. La base `checkin_db` se prepara con `infra/postgres/init.sql`. Para escanear, inicia `tickets` y genera las llaves JWT desde la raíz con `node scripts/generate-jwt-keys.mjs`. Los tokens se obtienen en `auth`.

| Variable | Valor de ejemplo |
|---|---|
| `PORT` | `3007` |
| `SERVICE_NAME` | `checkin` |
| `DATABASE_URL` | URL de `checkin_db` en `.env.example` |
| `JWT_PUBLIC_KEY_PATH` | `../../keys/jwt-public.pem` |
| `INTERNAL_API_KEY` | La misma clave que configura `tickets` |
| `TICKETS_URL` | `http://localhost:3005` |
| `HTTP_TIMEOUT_MS` | `5000` |
| `LOG_LEVEL` | `info` |
| `CORS_ORIGIN` | Opcional. Lista de orígenes si el navegador llama directamente al servicio. |

Desde `services/checkin`, en PowerShell:

```powershell
Copy-Item .env.example .env
npm ci
npx prisma migrate deploy
npm run start:dev
```

Desde la raíz, `scripts/dev.ps1` detecta el servicio y la web reenvía `/api/checkin` al puerto 3007.

## Pruebas manuales

Usa el JWT de un portero y el código de una entrada emitida para el evento.

```powershell
$token = '<JWT del portero>'
$eventId = '<UUID del evento>'
$code = '<código de la entrada>'
$auth = "Authorization: Bearer $token"
$scan = @{ eventId = $eventId; code = $code } | ConvertTo-Json -Compress

curl.exe -i http://localhost:3007/health
$scan | curl.exe -i http://localhost:3007/checkin/scan -H $auth -H 'Content-Type: application/json' --data-binary '@-'
$scan | curl.exe -i http://localhost:3007/checkin/scan -H $auth -H 'Content-Type: application/json' --data-binary '@-'
curl.exe -i "http://localhost:3007/checkin/events/$eventId/stats" -H $auth
curl.exe -i "http://localhost:3007/checkin/events/$eventId/recent?limit=20" -H $auth
```

El primer escaneo de una entrada válida responde `200` con `allowed: true`. Un escaneo posterior devuelve `200` con `ALREADY_USED` y la hora del primer ingreso. La clave primaria de PostgreSQL aplica la restricción aunque lleguen escaneos simultáneos. El nombre del titular y el sector se guardan con el ingreso para que la lista de recientes siga disponible si `tickets` está caído.

Si `tickets` no responde, el escaneo devuelve `503 DEPENDENCY_UNAVAILABLE`. Si falla PostgreSQL, `GET /health` devuelve `503`.
