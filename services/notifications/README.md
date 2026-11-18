# Notifications

Servicio interno de confirmaciones de compra de EntradasYa. Usa el puerto local 3006 y entrega correos de texto por SMTP a Mailpit. Mailpit muestra los mensajes en http://localhost:8025.

## Requisitos

Node.js 22 LTS (22.22.3 o posterior de la serie 22), npm y Mailpit local con SMTP en el puerto 1025.

| Variable | Valor de ejemplo |
|---|---|
| `PORT` | `3006` |
| `SERVICE_NAME` | `notifications` |
| `INTERNAL_API_KEY` | La misma clave que configura `orders` |
| `LOG_LEVEL` | `info` |
| `SMTP_HOST` | `localhost` |
| `SMTP_PORT` | `1025` |
| `SMTP_FROM` | `entradasya@example.test` |
| `SMTP_TIMEOUT_MS` | `1500` |

Inicia `mailpit.exe` en otra terminal. Desde `services/notifications`, en PowerShell:

```powershell
Copy-Item .env.example .env
npm ci
npm run start:dev
```

## Pruebas manuales

```powershell
curl.exe -i http://localhost:3006/health
$key = 'entradasya-local-change-me' # Usa el valor de INTERNAL_API_KEY de tu .env.
$orderId = [guid]::NewGuid().ToString()
$notification = @{
  to = 'cliente@example.test'
  customerName = 'Cliente de prueba'
  orderId = $orderId
  eventName = 'Concierto'
  venue = 'Estadio Tahuichi'
  eventStartsAt = '2026-12-05T23:00:00.000Z'
  sectorName = 'General'
  quantity = 2
  totalCents = 20000
  ticketsUrl = "http://localhost:5173/mis-entradas?orden=$orderId"
} | ConvertTo-Json -Compress
$notification | curl.exe -i http://localhost:3006/notifications/order-confirmed -H "X-Internal-Key: $key" -H 'Content-Type: application/json' --data-binary '@-'
```

La confirmación devuelve 202 con el identificador del mensaje. Si SMTP no responde, el envío y `/health` devuelven 503.

`npm run build` compila y `npm run lint` ejecuta Oxlint.
