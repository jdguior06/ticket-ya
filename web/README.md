# web — EntradasYa

Interfaz única para los tres tipos de usuario. React 19 + Vite + TypeScript + Tailwind CSS 4 + React Router.

- Puerto: **5173** (HTTPS en desarrollo) · Datos que guarda: ninguno
- Habla con: todos los servicios, **siempre por el gateway** `/api/<servicio>`. En desarrollo hace de gateway el proxy de Vite (quita solo `/api`, igual que Nginx). payments y notifications no se exponen.

| Usuario | Pantallas |
|---|---|
| Cliente | Cartelera con buscador, detalle y compra, mis entradas (QR en pantalla y PDF), mis compras (con "Generar entradas" si tickets falló) |
| Organizador | Mis eventos (con % vendido), crear o editar evento con sectores, publicar o cancelar, ventas por sector, porteros |
| Portero | Elegir evento, escanear el QR con la cámara del teléfono o escribir el código, resultado grande en verde o rojo con el motivo, contador de ingresos |

## Requisitos

| Herramienta | Versión |
|---|---|
| Node.js | 22 LTS |
| Servicios | auth, events, orders y tickets (y checkin para el portero) levantados |

## Variables de entorno (opcionales)

Se leen de `web/.env` o del entorno. Si no existen, se usan los valores por defecto.

| Variable | Por defecto | Descripción |
|---|---|---|
| `EY_AUTH_URL` | `http://localhost:3001` | Destino de `/api/auth` |
| `EY_EVENTS_URL` | `http://localhost:3002` | Destino de `/api/events` |
| `EY_ORDERS_URL` | `http://localhost:3003` | Destino de `/api/orders` |
| `EY_TICKETS_URL` | `http://localhost:3005` | Destino de `/api/tickets` |
| `EY_CHECKIN_URL` | `http://localhost:3007` | Destino de `/api/checkin` |
| `EY_HTTPS` | `true` | `false` para servir por http (la cámara del teléfono deja de funcionar) |

## Ejecutar en local (PowerShell)

```powershell
cd web
npm install
npm run dev
```

Abre **https://localhost:5173**. La primera vez el navegador avisa que el certificado no es de confianza (es de desarrollo): elige "Avanzado" y luego "Continuar".

O levanta todo junto desde la raíz con `.\scripts\dev.ps1`.

### Datos de demostración

Con auth y events levantados, desde la raíz: `node scripts/seed-demo.mjs`. Crea 4 eventos publicados y estas cuentas:

| Rol | Correo | Contraseña |
|---|---|---|
| Organizador | organizador@entradasya.local | Organizador123 |
| Cliente | cliente@entradasya.local | Cliente123 |
| Portero | portero@entradasya.local | Portero123 |

## Escanear desde el teléfono

1. El teléfono y la PC deben estar en **la misma red Wi-Fi**.
2. Al correr `npm run dev`, Vite muestra la dirección de red, por ejemplo `Network: https://192.168.1.50:5173/`.
3. Abre esa dirección en el teléfono, acepta el aviso del certificado e inicia sesión como portero.
4. Elige el evento y permite el acceso a la cámara.

El navegador **solo permite la cámara en https**, por eso Vite usa un certificado de desarrollo. Si Windows pregunta por el firewall al iniciar Vite, permite el acceso en **redes privadas**.

Cada código se procesa una sola vez aunque siga frente a la cámara. El resultado se muestra 3 segundos (o hasta que lo tocas) y suena un pitido corto si pasa o grave si se rechaza. Si el QR no se lee, se puede escribir el código: acepta minúsculas y espacios.

## Scripts

| Script | Para qué |
|---|---|
| `npm run dev` | Desarrollo con recarga (HTTPS + proxy a los servicios) |
| `npm run build` | Revisa tipos y genera `dist/` (lo que servirá Nginx) |
| `npm run preview` | Sirve `dist/` en el puerto 4173 con el mismo proxy |
| `npm run typecheck` | Solo revisión de tipos |

## Estructura

```
src/
  main.tsx, App.tsx       rutas por rol (RequireRole)
  index.css               tema (colores, tipografías) y la forma de boleto
  lib/api.ts              fetch al gateway, token, errores { code, message }
  lib/auth.tsx            sesión (JWT en localStorage)
  lib/messages.ts         textos en español según el `code` del contrato
  lib/format.ts           Bs, fechas en hora de Bolivia
  components/             Layout, EventTicket, QrImage, ui (botones, campos, alertas)
  pages/                  cliente, org/ (organizador), portero/
```

La pantalla del portero se carga aparte (`lazy`): el lector de QR pesa unos 480 KB y solo lo descarga el portero.

## Diseño

- **Forma de boleto:** las tarjetas de eventos y las entradas tienen muescas y una línea perforada que separa el talón (fecha o QR).
- **Colores:** tinta índigo `#1F1B4D`, fucsia `#E0306E` para la acción principal y ámbar `#FFC23D` en el talón y el contador del portero.
- **Tipografías:** Bricolage Grotesque en los títulos y Figtree en el texto. Van incluidas con `@fontsource`, así que no dependen de internet.
