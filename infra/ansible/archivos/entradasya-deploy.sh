#!/usr/bin/env bash
# entradasya-deploy — despliega UN servicio de EntradasYa en este servidor.
# Administrado por Ansible (infra/ansible). No editar a mano.
#
# Uso:   sudo entradasya-deploy <servicio> [commit]
#        servicio: auth | events | orders | payments | tickets | notifications | checkin | web
#        commit:   SHA de git (por defecto, lo último de main)
#
# Lo usan el pipeline de GitHub Actions (usuario deploy) y Ansible (primer despliegue).
#
# Cada despliegue es una carpeta nueva (release) y el cambio es atómico:
#   /opt/entradasya/releases/<servicio>/<fecha>-<commit>/   código + node_modules + dist
#   /opt/entradasya/actual/<servicio>  ->  enlace a la release activa (systemd y Nginx usan este)
# Si el servicio no responde /health después del cambio, vuelve a la release anterior.
#
# Variables opcionales: FORZAR=1 (redesplegar aunque sea el mismo commit), CONSERVAR=3 (releases a guardar)

set -Eeuo pipefail

BASE=/opt/entradasya
REPO="$BASE/repo"
APP_USER=entradasya
RAMA=main
CONSERVAR="${CONSERVAR:-3}"
ESPERA_HEALTH_S=60

declare -A PUERTOS=(
  [auth]=3001 [events]=3002 [orders]=3003 [payments]=3004
  [tickets]=3005 [notifications]=3006 [checkin]=3007 [web]=80
)

log() { printf '%s [deploy:%s] %s\n' "$(date +%H:%M:%S)" "${SERVICIO:-?}" "$*"; }
falla() { log "ERROR: $*"; exit 1; }
# HOME propio: si no, npm intentaría usar /root/.npm (sin permiso).
como_app() { runuser -u "$APP_USER" -- env HOME="$BASE" "$@"; }

# ---------------------------------------------------------------- argumentos

SERVICIO="${1:-}"
REF="${2:-}"
[[ $EUID -eq 0 ]] || falla "ejecutar con sudo"
[[ -n "$SERVICIO" && -n "${PUERTOS[$SERVICIO]:-}" ]] || falla "servicio inválido: '${SERVICIO}'. Opciones: ${!PUERTOS[*]}"
# Solo un SHA hexadecimal (o nada): el argumento llega desde fuera (pipeline), no se confía en él.
[[ -z "$REF" || "$REF" =~ ^[0-9a-f]{7,40}$ ]] || falla "commit inválido: '$REF' (se espera un SHA)"

PUERTO="${PUERTOS[$SERVICIO]}"
if [[ "$SERVICIO" == web ]]; then ORIGEN=web; NIVELES=1; else ORIGEN="services/$SERVICIO"; NIVELES=2; fi
RELEASES="$BASE/releases/$SERVICIO"
ACTUAL="$BASE/actual/$SERVICIO"
ENV_FILE="/etc/entradasya/$SERVICIO.env"

# Un despliegue a la vez en todo el servidor (compilar varias apps juntas agota la memoria).
exec 9>/var/lock/entradasya-deploy.lock
log "esperando turno…"
flock -w 1200 9 || falla "otro despliegue tardó demasiado"

# ---------------------------------------------------------------- 1. código

if [[ -n "$REF" ]]; then
  como_app git -C "$REPO" fetch --quiet --depth 1 origin "$REF"
else
  como_app git -C "$REPO" fetch --quiet --depth 1 origin "$RAMA"
  REF=$(como_app git -C "$REPO" rev-parse FETCH_HEAD)
fi
SHA=$(como_app git -C "$REPO" rev-parse --verify "${REF}^{commit}") || falla "no existe el commit $REF"
CORTO="${SHA:0:12}"

ANTERIOR=""
if [[ -L "$ACTUAL" ]]; then ANTERIOR=$(readlink -f "$ACTUAL"); fi
if [[ -n "$ANTERIOR" && "$ANTERIOR" == *"-$CORTO" && "${FORZAR:-0}" != 1 ]]; then
  log "ya desplegado: $CORTO (usa FORZAR=1 para repetir)"
  exit 0
fi

DESTINO="$RELEASES/$(date +%Y%m%d-%H%M%S)-$CORTO"
log "release $CORTO -> $DESTINO"
install -d -o "$APP_USER" -g "$APP_USER" -m 0755 "$DESTINO"
como_app bash -c "git -C '$REPO' archive '$SHA' '$ORIGEN' | tar -x -C '$DESTINO' --strip-components=$NIVELES"
[[ -f "$DESTINO/package.json" ]] || falla "el commit $CORTO no tiene $ORIGEN/package.json"

limpiar_fallida() { log "se descarta la release fallida"; rm -rf "$DESTINO"; }
trap 'limpiar_fallida' ERR

# ---------------------------------------------------------------- 2. dependencias y compilación

cd "$DESTINO"
log "npm ci"
como_app env NODE_OPTIONS=--max-old-space-size=2048 npm ci --no-audit --no-fund --loglevel=error
log "npm run build"
como_app env NODE_OPTIONS=--max-old-space-size=2048 npm run build

# ---------------------------------------------------------------- 3. migraciones (solo servicios con Prisma)

if [[ -d prisma/migrations ]]; then
  log "prisma migrate deploy"
  # Las variables (DATABASE_URL) vienen del mismo archivo que usa systemd.
  como_app bash -c "set -a; source '$ENV_FILE'; set +a; npx prisma migrate deploy"
fi

trap - ERR

# ---------------------------------------------------------------- 4. cambio atómico

activar() {
  ln -sfn "$1" "$ACTUAL.nuevo"
  mv -Tf "$ACTUAL.nuevo" "$ACTUAL"
  # 9>&- : lo que se arranque no hereda el candado del despliegue.
  if [[ "$SERVICIO" == web ]]; then
    nginx -t -q 9>&- && systemctl reload nginx 9>&-
  else
    systemctl restart "entradasya-$SERVICIO" 9>&-
  fi
}

sano() {
  local url="http://127.0.0.1:$PUERTO/health"
  local i
  for ((i = 0; i < ESPERA_HEALTH_S; i += 2)); do
    if curl -fs --max-time 3 -o /dev/null "$url"; then return 0; fi
    sleep 2
  done
  return 1
}

log "activando $CORTO"
activar "$DESTINO"

# ---------------------------------------------------------------- 5. verificación y vuelta atrás

if sano; then
  log "OK: /health responde"
else
  log "ERROR: /health no responde después de ${ESPERA_HEALTH_S}s"
  [[ "$SERVICIO" != web ]] && journalctl -u "entradasya-$SERVICIO" -n 30 --no-pager || true
  if [[ -n "$ANTERIOR" && -d "$ANTERIOR" ]]; then
    log "VUELTA ATRÁS a $(basename "$ANTERIOR")"
    activar "$ANTERIOR"
    if sano; then log "la versión anterior quedó activa"; else log "la versión anterior TAMPOCO responde"; fi
  fi
  rm -rf "$DESTINO"
  falla "despliegue de $CORTO fallido"
fi

# ---------------------------------------------------------------- 6. limpieza

mapfile -t viejas < <(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d | sort -r | tail -n +"$((CONSERVAR + 1))")
for vieja in "${viejas[@]}"; do
  [[ "$vieja" == "$(readlink -f "$ACTUAL")" ]] && continue
  rm -rf "$vieja"
done

echo "$SHA" > "$DESTINO/.commit"
log "LISTO: $SERVICIO en $CORTO"
