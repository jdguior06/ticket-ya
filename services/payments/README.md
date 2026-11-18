# Payments

Servicio interno de cobros simulados de EntradasYa. Usa el puerto local 3004. Persiste una transacción por orden, incluidos los rechazos. De la tarjeta guarda únicamente los últimos cuatro dígitos.

## Requisitos

Node.js 22 LTS (22.22.3 o posterior de la serie 22), npm y PostgreSQL 16 o 17 con `payments_db` y su usuario (ver `infra/postgres/init.sql` en la raíz). Usa tarjetas ficticias para probar.

| Variable | Valor de ejemplo |
|---|---|
| `PORT` | `3004` |
| `SERVICE_NAME` | `payments` |
| `DATABASE_URL` | URL de `payments_db` en `.env.example` |
| `INTERNAL_API_KEY` | La misma clave que configura `orders` |
| `LOG_LEVEL` | `info` |

Desde `services/payments`, en PowerShell:

```powershell
Copy-Item .env.example .env
npm ci
npx prisma migrate deploy
npm run start:dev
```

## Pruebas manuales

```powershell
curl.exe -i http://localhost:3004/health
$key = 'entradasya-local-change-me' # Usa el valor de INTERNAL_API_KEY de tu .env.
$orderId = [guid]::NewGuid().ToString()
$payment = @{
  orderId = $orderId
  amountCents = 20000
  currency = 'BOB'
  card = @{ number = '4111111111111111'; holder = 'Cliente de prueba'; expMonth = 12; expYear = 2099; cvv = '123' }
} | ConvertTo-Json -Compress
$payment | curl.exe -i http://localhost:3004/payments -H "X-Internal-Key: $key" -H 'Content-Type: application/json' --data-binary '@-'
$payment | curl.exe -i http://localhost:3004/payments -H "X-Internal-Key: $key" -H 'Content-Type: application/json' --data-binary '@-'
curl.exe -i "http://localhost:3004/payments/order/$orderId" -H "X-Internal-Key: $key"
```

El primer POST devuelve 201 y la repetición devuelve 200 con la misma transacción. La consulta devuelve 404 si la orden aún no tiene un pago. Si PostgreSQL no responde, `/health` devuelve 503.

`npm run build` compila y `npm run lint` ejecuta Oxlint.
