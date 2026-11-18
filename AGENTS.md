# AGENTS.md — Reglas para agentes de IA (Codex, Claude) y colaboradores

Este repositorio es **EntradasYa v1**: 7 microservicios NestJS + 1 web React, comunicados solo por HTTP/JSON. Lee esto completo antes de tocar código.

## Documentos obligatorios
1. `docs/CONTRATOS.md` — rutas, JSON, errores y puertos. **Es la fuente de verdad.** No inventes rutas ni campos. Si un contrato debe cambiar, cámbialo en ese archivo en el mismo commit y avísalo en el resumen.
2. `docs/BITACORA.md` — registra ahí cualquier problema de instalación, versión o ejecución que encuentres (fecha, problema, solución).
3. `docs/ASIGNACION.md` — qué servicio trabaja cada agente. **Solo modifica las carpetas que tienes asignadas.**

## Stack fijo (no cambiar sin aprobación de Diego)
- Node.js 22 LTS, TypeScript estricto, **NestJS 11**.
- ORM: **Prisma** (un `prisma/schema.prisma` por servicio, apuntando a su propia base).
- Validación: `class-validator` + `class-transformer` con `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
- HTTP entre servicios: `fetch` nativo con `AbortSignal.timeout(HTTP_TIMEOUT_MS)`.
- JWT: RS256. Solo **auth** firma (llave privada). Los demás validan con la llave pública (`JWT_PUBLIC_KEY_PATH`).
- Web: React 19 + Vite + TypeScript + Tailwind CSS 4 + React Router.
- Gestor de paquetes: **npm**. Sin workspaces: cada servicio es independiente (tendrá su propio Dockerfile más adelante).

## Estructura
```
services/<nombre>/
  src/
    main.ts               # arranque, ValidationPipe, filtro de errores, logger
    app.module.ts
    common/               # copia local: config, logger, error filter, guards (jwt, roles, internal-key), http-client, health
    <dominio>/            # módulo(s) del servicio
  prisma/schema.prisma    # si el servicio tiene BD
  .env.example            # TODAS las variables, con valores de ejemplo para local
  README.md               # requisitos, variables, pasos para ejecutar, ejemplos curl
  package.json
web/
infra/                    # postgres, nginx (más adelante)
scripts/                  # utilidades (llaves JWT, etc.)
docs/
```
La carpeta `src/common/` se **copia** entre servicios (no hay paquete compartido). El servicio de referencia es **auth**: copia su `common/` y adáptalo.

## Reglas obligatorias (requerimientos técnicos del proyecto)
1. Toda configuración sale de variables de entorno (`@nestjs/config`, validadas al arrancar). Nada de puertos, URLs, contraseñas ni secretos en el código.
2. Cada servicio usa solo su base de datos. Prohibido leer la base de otro servicio: se pide por HTTP.
3. Comunicación solo HTTP + JSON.
4. Toda llamada saliente tiene timeout.
5. `GET /health` según el contrato (200 / 503 revisando la BD).
6. Logs a consola con fecha ISO, nivel, `[servicio]` y mensaje. Nunca loguear contraseñas, tokens completos ni números de tarjeta.
7. README por servicio con requisitos, tabla de variables y pasos.
8. Errores con el formato `{ statusCode, code, message, details }` del contrato.
9. Dinero en centavos (enteros).

## Convenciones de código
- Código, rutas y campos en inglés. Comentarios, README y textos de la interfaz en español.
- Archivos en `kebab-case`, clases en `PascalCase`.
- Un DTO por request con validaciones. Nunca devolver entidades de Prisma con campos sensibles (p. ej. `passwordHash`).
- Operaciones idempotentes donde el contrato lo pide (reserva, pago, emisión de entradas).
- Sin dependencias nuevas "por si acaso": justifica cada una en el resumen.

## Antes de terminar una tarea
- `npm run build` y `npm run lint` sin errores en el servicio tocado.
- Probar el `GET /health` y al menos un endpoint con `curl` (pon los comandos en el README).
- Resumen final: qué hiciste, archivos tocados, contratos cambiados (si hubo), pendientes.
- **No hagas commit ni push** salvo que Diego lo pida. Trabaja en la rama indicada en `docs/ASIGNACION.md`.

## Entorno de Diego
Windows (PowerShell). Los comandos en README deben funcionar en PowerShell; si un comando difiere en Linux, muestra ambos.
