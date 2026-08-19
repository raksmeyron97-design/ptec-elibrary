#!/usr/bin/env bash
# =====================================================================
# PTEC e-Library — pull-based deploy
#
# Runs ON the ZimaOS box (systemd timer, every few minutes). Checks GHCR
# for a newer image, and if there is one: deploys it, waits for the
# container to report healthy, and ROLLS BACK to the previous image if it
# does not.
#
# Outbound-only: nothing connects in to this box. Safe to run repeatedly;
# when the image has not changed it does nothing and exits 0.
#
#   ./deploy.sh            normal run (no-op if already current)
#   ./deploy.sh --force    redeploy even if the digest is unchanged
#   ./deploy.sh --status   print current state and exit
#
# Mirrors raksmeyron97-design/storage → deploy/deploy.sh. The differences
# are deliberate and marked: Next.js boots far more slowly than the storage
# API, and the tunnel lives behind a compose profile here.
# =====================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/DATA/AppData/ptec-elibrary/app}"
STATE_DIR="${STATE_DIR:-/var/lib/ptec-elibrary-deploy}"
export DOCKER_CONFIG="${DOCKER_CONFIG:-/DATA/AppData/ptec-elibrary/.docker}"
SERVICE="app"
CONTAINER="ptec-elibrary"
# Next.js standalone needs longer than the storage API: the Dockerfile already
# grants start-period=20s, then the first request compiles nothing but still
# opens Supabase connections. 180s is generous on purpose — a slow box that
# eventually comes up must not be rolled back as if it were broken.
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"
LOCK_FILE="$STATE_DIR/deploy.lock"
FAILED_FILE="$STATE_DIR/failed-image"

FORCE=0
case "${1:-}" in
  --force)  FORCE=1 ;;
  --status) STATUS_ONLY=1 ;;
  "")       ;;
  *) echo "unknown argument: $1" >&2; exit 2 ;;
esac

log() { printf '%s [deploy] %s\n' "$(date -Is)" "$*"; }
die() { printf '%s [deploy] ERROR: %s\n' "$(date -Is)" "$*" >&2; exit 1; }

command -v docker >/dev/null || die "docker not found"
[ -d "$APP_DIR" ] || die "APP_DIR does not exist: $APP_DIR"
mkdir -p "$STATE_DIR"
cd "$APP_DIR"

# The tunnel is a compose profile, so it is invisible to `compose` unless the
# profile is selected. Select it only once .env actually carries a token —
# that is what makes stages 1-2 (local, LAN) work with the same scripts,
# rather than crash-looping cloudflared against an empty token.
COMPOSE_PROFILE_ARGS=()
if grep -qE '^TUNNEL_TOKEN=.+' .env 2>/dev/null; then
  COMPOSE_PROFILE_ARGS=(--profile tunnel)
fi

compose() { docker compose ${COMPOSE_PROFILE_ARGS[@]+"${COMPOSE_PROFILE_ARGS[@]}"} "$@"; }

# Resolve the image reference compose will actually use, honouring IMAGE_TAG
# from .env exactly the way compose does. Uses only docker itself — the box
# has no node runtime, the app runs in a container.
image_ref() {
  compose config --images "$SERVICE" 2>/dev/null | head -1
}

# docker inspect can both fail AND print an empty line, so capture rather than
# relying on `|| echo fallback` (which would emit two lines).
running_image_id() {
  local out
  out="$(docker inspect --format '{{.Image}}' "$CONTAINER" 2>/dev/null)" || out=""
  printf '%s' "$(printf '%s' "$out" | tr -d '\n')"
}

health_status() {
  local out
  out="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CONTAINER" 2>/dev/null)" || out=""
  out="$(printf '%s' "$out" | tr -d '\n')"
  if [ -z "$out" ]; then printf 'missing'; else printf '%s' "$out"; fi
}

# Wait for the app container's own HEALTHCHECK (wget --spider on /). Prints
# nothing; the caller logs. Returns the final status on stdout.
wait_for_health() {
  local timeout="$1" deadline status
  deadline=$(( $(date +%s) + timeout ))
  status="starting"
  while [ "$(date +%s)" -lt "$deadline" ]; do
    status="$(health_status)"
    case "$status" in
      healthy|unhealthy|missing) break ;;
    esac
    sleep 3
  done
  printf '%s' "$status"
}

if [ "${STATUS_ONLY:-0}" = 1 ]; then
  echo "app dir     : $APP_DIR"
  echo "image ref   : $(image_ref)"
  echo "running img : $(running_image_id || true)"
  echo "health      : $(health_status)"
  if [ ${#COMPOSE_PROFILE_ARGS[@]} -gt 0 ]; then
    echo "tunnel      : enabled (TUNNEL_TOKEN set)"
  else
    echo "tunnel      : disabled (no TUNNEL_TOKEN in .env)"
  fi
  if [ -f "$FAILED_FILE" ]; then echo "known-bad   : $(cat "$FAILED_FILE")"; fi
  exit 0
fi

# Only one deploy at a time; the timer must never overlap a slow pull.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "another deploy is in progress, skipping this tick"
  exit 0
fi

IMAGE_REF="$(image_ref)"
[ -n "$IMAGE_REF" ] || die "could not resolve image reference for service '$SERVICE'"
log "watching $IMAGE_REF"

BEFORE_ID="$(running_image_id)"

log "checking registry for a newer image"
if ! compose pull "$SERVICE" 2>&1 | sed 's/^/    /'; then
  die "docker compose pull failed (registry unreachable, or not logged in to ghcr.io)"
fi

AFTER_ID="$(docker image inspect --format '{{.Id}}' "$IMAGE_REF" 2>/dev/null || echo "")"
[ -n "$AFTER_ID" ] || die "image $IMAGE_REF not present after pull"

if [ "$BEFORE_ID" = "$AFTER_ID" ] && [ "$FORCE" -eq 0 ]; then
  log "already running the current image, nothing to do"
  exit 0
fi

# Do not redeploy an image that already failed its health check here. Without
# this the timer would reinstall the same broken build every few minutes.
if [ -f "$FAILED_FILE" ] && [ "$(cat "$FAILED_FILE")" = "$AFTER_ID" ] && [ "$FORCE" -eq 0 ]; then
  log "image $AFTER_ID previously failed health checks; skipping (use --force to retry)"
  exit 0
fi

log "deploying $AFTER_ID (was ${BEFORE_ID:-none})"
# --no-deps: bring up ONLY the app and judge it on its own health before
# touching cloudflared. Pointing a live tunnel at a container that is about to
# be rolled back would serve 502s to real visitors for the whole health window.
compose up -d --no-deps "$SERVICE" 2>&1 | sed 's/^/    /'

log "waiting up to ${HEALTH_TIMEOUT}s for the container to report healthy"
status="$(wait_for_health "$HEALTH_TIMEOUT")"

if [ "$status" = "healthy" ]; then
  log "deploy OK — $IMAGE_REF is healthy"
  rm -f "$FAILED_FILE"
  # Bring up anything else the profile selects (cloudflared) and reconcile it
  # with the compose file. No-op when it is already running the right config.
  compose up -d 2>&1 | sed 's/^/    /'
  # Keep the box from filling up with superseded layers. Next.js images are
  # large, so this matters more here than on the storage box.
  docker image prune -f --filter "until=168h" >/dev/null 2>&1 || true
  exit 0
fi

log "health check did not pass (status: $status)"
docker logs --tail 40 "$CONTAINER" 2>&1 | sed 's/^/    /' || true
echo "$AFTER_ID" > "$FAILED_FILE"

if [ -z "$BEFORE_ID" ]; then
  die "no previous image to roll back to; service is down and needs manual attention"
fi

log "rolling back to $BEFORE_ID"
docker tag "$BEFORE_ID" "$IMAGE_REF"
compose up -d --no-deps "$SERVICE" 2>&1 | sed 's/^/    /'

status="$(wait_for_health 90)"
if [ "$status" = "healthy" ]; then
  log "rollback OK — previous image is healthy again"
  compose up -d 2>&1 | sed 's/^/    /'
  # Exit non-zero so `systemctl status` and the journal show a failed deploy,
  # even though the site is serving. A silent success would hide the bad build.
  exit 1
fi

die "ROLLBACK FAILED — service is not healthy. Run: docker logs $CONTAINER"
