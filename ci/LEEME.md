# CI de EntradasYa: 8 repositorios, 8 pipelines

Cada servicio (y la web) vive en su propio repositorio de GitHub, con dos ramas:

- **`main`**: lo estable. Solo recibe cambios por Pull Request desde `development`.
- **`development`**: donde se integra el trabajo. **Cada push a `development` ejecuta el pipeline.**

| Componente | Repositorio | Pipeline |
|---|---|---|
| auth | `jdguior06/entradasya-auth` | [`workflows/auth.yml`](workflows/auth.yml) |
| events | `jdguior06/entradasya-events` | [`workflows/events.yml`](workflows/events.yml) |
| orders | `jdguior06/entradasya-orders` | [`workflows/orders.yml`](workflows/orders.yml) |
| payments | `jdguior06/entradasya-payments` | [`workflows/payments.yml`](workflows/payments.yml) |
| tickets | `jdguior06/entradasya-tickets` | [`workflows/tickets.yml`](workflows/tickets.yml) |
| notifications | `jdguior06/entradasya-notifications` | [`workflows/notifications.yml`](workflows/notifications.yml) |
| checkin | `jdguior06/entradasya-checkin` | [`workflows/checkin.yml`](workflows/checkin.yml) |
| web | `jdguior06/entradasya-web` | [`workflows/web.yml`](workflows/web.yml) |

En cada repo, el archivo está en `.github/workflows/ci.yml`. Aquí se guardan las 8 versiones
juntas para revisarlas y para que `scripts/separar-repos.ps1` las copie al crear los repos.

## Qué hace cada pipeline

```
push a development
      │
      ▼
┌─────────────────────────────┐      ┌──────────────────────────────┐
│ verificar                   │ ───► │ empaquetar                   │
│ 1. npm ci                   │      │ 1. npm ci + build            │
│ 2. lint (oxlint)            │      │ 2. arma la carpeta           │
│ 3. build (TypeScript)       │      │ 3. la sube como artifact     │
│ 4. pruebas (vitest)         │      │    (.zip, se guarda 30 días) │
│ 5. migraciones en BD vacía  │      └──────────────────────────────┘
│ 6. prueba de humo: arranca  │
│    y GET /health → 200      │
└─────────────────────────────┘
```

- Los servicios con base de datos levantan un **PostgreSQL 16** dentro del pipeline (`services:`)
  y aplican sus migraciones de Prisma en una base vacía: si una migración está rota, el pipeline falla.
- notifications levanta **Mailpit**, porque su `/health` revisa que el SMTP responda.
- Las llaves JWT de la prueba se generan en cada ejecución y se descartan: no hay secretos en el pipeline.
- Si `verificar` falla, **no se genera artifact**: solo se empaqueta código que pasó todas las pruebas.

## El artifact

Cada ejecución exitosa deja un artifact llamado `entradasya-<servicio>-<versión>-<commit>`
(ej. `entradasya-orders-0.0.1-a1b2c3d`). Se descarga desde GitHub: repo → **Actions** → la ejecución →
sección **Artifacts**, y llega como **`.zip`** (GitHub siempre comprime los artifacts). Se guarda 30 días.

| Servicios (NestJS) | Web |
|---|---|
| `dist/` compilado, `package.json`, `package-lock.json`, `prisma/` (migraciones), `prisma.config.ts`, `.env.example`, `README.md` y `BUILD_INFO.txt` (commit, rama, fecha) | El contenido de `dist/` (HTML, JS, CSS y fuentes) y `BUILD_INFO.txt` |

Para instalar un servicio desde el artifact en Ubuntu:

```bash
sudo apt install -y unzip                      # si no está instalado
unzip entradasya-orders-0.0.1-a1b2c3d.zip -d orders && cd orders
npm ci --omit=dev --ignore-scripts             # solo dependencias de producción
npx prisma migrate deploy                      # con DATABASE_URL en el entorno
node dist/main.js
```

## Crear los repos

Requisitos: [GitHub CLI](https://cli.github.com) (`winget install GitHub.cli`) con sesión (`gh auth login`)
y el monorepo sin cambios pendientes.

```powershell
.\scripts\separar-repos.ps1 -Simular     # muestra lo que haría
.\scripts\separar-repos.ps1              # crea los 8 repos, sube main y development
```

El script saca cada carpeta **con su historial de commits** (`git subtree split`), agrega el pipeline,
un `.gitignore` y la insignia del CI en el README, crea el repo y sube las dos ramas.
El push a `development` dispara el primer pipeline de cada repo. Si un repo ya existe con contenido, lo salta.
