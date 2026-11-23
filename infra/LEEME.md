# Despliegue de EntradasYa v1

Un servidor Ubuntu 24.04 en AWS con los 7 servicios, la web, PostgreSQL, Mailpit y Nginx. Todo instalado sin contenedores, como pide el documento de la v1.

| Herramienta | Qué hace | Cuándo se usa |
|---|---|---|
| **Terraform** (`terraform/`) | Red, firewall, servidor `m7i-flex.large`, IP fija | Una vez (crear o destruir) |
| **cloud-init** (`terraform/cloud-init.yaml.tftpl`) | Usuarios `ubuntu` y `deploy` con sus llaves, swap de 4 GB, zona horaria, paquetes base | Al nacer el servidor |
| **Ansible** (`ansible/`) | Node 22, PostgreSQL (una base por servicio), Nginx, Mailpit, llaves JWT, `.env`, servicios systemd, HTTPS y primer despliegue | Una vez (y cada vez que cambie la configuración) |
| **GitHub Actions** (`.github/workflows/`) | Un pipeline por servicio: verifica y despliega cada cambio en `main` | Solo, en cada push |

```
                         internet
                            │ https://entradasya.<IP>.nip.io
          ┌─────────────────▼─────────────────────────────────────┐
          │ Ubuntu 24.04 (m7i-flex.large)                          │
          │  Nginx :80/:443 ── web (React compilado)               │
          │     /api/auth ──► :3001   /api/events ──► :3002        │
          │     /api/orders ► :3003   /api/tickets ─► :3005        │
          │     /api/checkin ► :3007  /mailpit/ ───► :8025 (clave) │
          │  payments :3004 y notifications :3006 solo internos    │
          │  PostgreSQL :5432 (localhost) · Mailpit SMTP :1025     │
          └────────────────────────────────────────────────────────┘
   SSH :22 ── ubuntu (Ansible, tu llave) · deploy (GitHub Actions, solo puede desplegar)
```

## Cómo funciona un despliegue

El pipeline de cada servicio (`auth.yml`, `events.yml`, …) llama a `_pipeline.yml`:

1. **verificar** (en GitHub): `npm ci`, lint, pruebas y build. Si algo falla, no se despliega.
2. **desplegar** (solo en `main`): entra por SSH como `deploy` y ejecuta `sudo entradasya-deploy <servicio> <commit>`.

El script `entradasya-deploy` (en `ansible/archivos/`) hace en el servidor:

```
/opt/entradasya/repo                         clon del repo (solo para sacar el código)
/opt/entradasya/releases/<servicio>/<fecha>-<commit>/   cada despliegue es una carpeta nueva
/opt/entradasya/actual/<servicio>  ──►  release activa (la usan systemd y Nginx)
```

1. Saca el código de ese commit a una release nueva.
2. Ejecuta `npm ci` y `npm run build`, y aplica las migraciones con `prisma migrate deploy`.
3. Cambia el enlace `actual/<servicio>` de forma atómica y reinicia el servicio.
4. Revisa el `/health`. **Si no responde en 60 s, vuelve sola a la release anterior.**
5. Guarda las últimas 3 releases.

Si se repite el mismo commit, no hace nada. Hay un solo despliegue a la vez en el servidor, para no agotar la memoria compilando.

> Las migraciones no se deshacen al volver atrás. Escríbelas de forma que la versión anterior siga funcionando, por ejemplo agregando columnas en vez de renombrarlas.

## Requisitos (en tu PC)

| Herramienta | Notas |
|---|---|
| Terraform ≥ 1.6 (u OpenTofu) | Funciona en Windows |
| AWS CLI configurado | `aws configure` (la misma cuenta del proyecto anterior) |
| Ansible | **No corre en Windows**: usa WSL (Ubuntu) o tu Fedora. `pip install ansible-core` |
| Una llave SSH tuya | `~/.ssh/id_ed25519.pub` (en WSL: la de WSL) |

## Paso a paso (primera vez)

### 1. Llave del pipeline

Desde la raíz del repo:

```bash
ssh-keygen -t ed25519 -f infra/claves/github-actions -N "" -C github-actions
```

En PowerShell: `ssh-keygen -t ed25519 -f infra\claves\github-actions -N '""' -C github-actions`

Se crean dos archivos:
- `github-actions.pub`, la **pública**: va al servidor y se puede subir a git.
- `github-actions`, la **privada**: va **solo** a los secretos de GitHub. El `.gitignore` ya la excluye.

### 2. Servidor (Terraform + cloud-init)

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # revisa la ruta de tu llave
terraform init
terraform apply
```

Al terminar muestra la IP, el dominio (`entradasya.<IP>.nip.io`) y genera `infra/ansible/inventario.ini`.

### 3. Secretos de la configuración (Ansible Vault)

```bash
cd ../ansible
cp group_vars/all/vault.yml.ejemplo group_vars/all/vault.yml
# edita los valores (contraseñas: openssl rand -hex 16)
ansible-vault encrypt group_vars/all/vault.yml
```

`vault.yml` **no se sube a git** (está en `.gitignore`, porque el repo es público). Guarda una copia en un lugar seguro: sin él no se puede volver a configurar el servidor con las mismas contraseñas.

### 4. Configurar el servidor y primer despliegue (Ansible)

```bash
ansible-playbook servidor.yml    # pide la contraseña del vault
```

Tarda unos 10 a 15 minutos la primera vez: instala todo, compila los 8 proyectos y pide el certificado HTTPS. Al final muestra la URL.

### 5. Secretos de GitHub (para los pipelines)

En GitHub, entra a **Settings → Secrets and variables → Actions → New repository secret**:

| Secreto | Valor |
|---|---|
| `SERVIDOR_HOST` | La IP (`terraform output -raw ip_publica`) |
| `SERVIDOR_SSH_KEY` | Todo el contenido de `infra/claves/github-actions` (la privada) |
| `SERVIDOR_KNOWN_HOSTS` | La salida de `ssh-keyscan -t ed25519 <IP>` |

Además, en la pestaña **Variables** crea `DESPLIEGUE_ACTIVO` con el valor `true`. Mientras no exista, los pipelines solo verifican (compilan y pasan el lint) y no intentan desplegar. Sirve para cuando el servidor está destruido.

Con GitHub CLI:

```bash
IP=$(terraform -chdir=infra/terraform output -raw ip_publica)
gh secret set SERVIDOR_HOST --body "$IP"
gh secret set SERVIDOR_SSH_KEY < infra/claves/github-actions
ssh-keyscan -t ed25519 "$IP" | gh secret set SERVIDOR_KNOWN_HOSTS
gh variable set DESPLIEGUE_ACTIVO --body true
```

### 6. Probar el pipeline

Cambia algo en un servicio (por ejemplo un mensaje en `services/events`), haz commit y push a `main`. En la pestaña **Actions** de GitHub corre solo el pipeline de `events`: primero verifica y después despliega. También se puede lanzar a mano con **Run workflow**.

## Operación

```bash
ssh ubuntu@<IP>
systemctl status 'entradasya-*'              # estado de todo
journalctl -u entradasya-orders -f           # logs de un servicio
sudo entradasya-deploy events                # redesplegar lo último de main
sudo entradasya-deploy events 4c095e6        # desplegar un commit concreto (o volver a uno anterior)
sudo FORZAR=1 entradasya-deploy web          # repetir aunque sea el mismo commit
ls /opt/entradasya/releases/orders           # releases guardadas
```

| Qué | Dónde |
|---|---|
| Web | `https://entradasya.<IP>.nip.io` |
| Correos (Mailpit) | `https://entradasya.<IP>.nip.io/mailpit/` (usuario `admin`, clave del vault) |
| Variables de cada servicio | `/etc/entradasya/<servicio>.env` (las escribe Ansible) |
| Llaves JWT | `/etc/entradasya/keys/` (se generan en el servidor y nunca salen de él) |
| PDFs de las entradas | `/var/lib/entradasya/tickets/` |

Para cambiar una variable o una contraseña, edita `vars.yml` o `vault.yml` y vuelve a ejecutar `ansible-playbook servidor.yml`. Solo se reinician los servicios afectados.

## Apagar y destruir

```bash
terraform -chdir=infra/terraform destroy
```

Destruye el servidor **y todos sus datos** (bases, PDFs y correos). Después cambia `DESPLIEGUE_ACTIVO` a `false` para que los pipelines no intenten desplegar. Si solo quieres pausar, detén la instancia desde la consola de AWS: la IP fija se conserva, pero AWS cobra por ella mientras la instancia está detenida.

## Qué se reutilizó del proyecto anterior (control-asistencia-academica)

- **De Terraform:** la estructura de red, firewall, servidor e IP fija de `plataforma/`, simplificada a un solo servidor **Ubuntu**, con estado local y sin peering.
- **De Ansible:** el patrón de `nodejs.yml`, `codigo.yml`, `backend.yml` (`.env` + build + migraciones + systemd), `gateway.yml` y Vault para los secretos. Se cambió `dnf` por `apt`, y TypeORM por `prisma migrate deploy`.
- **De cloud-init:** las llaves SSH en `user_data`. Ahora también crea el usuario `deploy` y el swap.
- **Lo nuevo:** el pipeline por servicio en GitHub Actions y el despliegue con releases y vuelta atrás (el proyecto anterior desplegaba desde el worker del portal).
- **Lo que no aplica a la v1:** Packer, los 4 motores, multitenant y monitoreo con Prometheus y Grafana. El monitoreo se puede sumar en una etapa siguiente.
