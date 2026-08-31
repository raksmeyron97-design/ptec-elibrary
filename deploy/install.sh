#!/usr/bin/env bash
# =====================================================================
# One-time setup of automatic deploys on the ZimaOS box.
#
# Run as root on ZimaOS, from inside the checked-out repo:
#   sudo ./deploy/install.sh
#
# Installs a systemd timer that checks GHCR every 5 minutes and deploys a
# new image when CI publishes one. Nothing listens on a port; the box only
# makes outbound connections.
# =====================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/DATA/AppData/ptec-elibrary/app}"
DATA_ROOT="/DATA/AppData/ptec-elibrary"
UNIT_DIR="/etc/systemd/system"

log()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m    warning: %s\033[0m\n' "$*"; }
die()  { printf '\033[31m    error: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run this with sudo"
command -v docker >/dev/null || die "docker is not installed"
docker compose version >/dev/null 2>&1 || die "docker compose v2 is not available"
command -v systemctl >/dev/null || die "systemd not found; use the cron fallback in docs/ZIMAOS-DEPLOYMENT.md"

log "Checking repository location"
SRC="$(cd "$(dirname "$0")/.." && pwd)"
if [ "$SRC" != "$APP_DIR" ]; then
  warn "repo is at $SRC but the units expect $APP_DIR"
  warn "either move it there, or edit APP_DIR in deploy/ptec-elibrary-deploy.service"
fi
echo "    repo: $SRC"

log "Creating state directories"
mkdir -p "$DATA_ROOT/.docker" /var/lib/ptec-elibrary-deploy
export DOCKER_CONFIG="${DOCKER_CONFIG:-$DATA_ROOT/.docker}"
echo "    $DATA_ROOT/.docker          (docker credentials for GHCR)"
echo "    /var/lib/ptec-elibrary-deploy (deploy lock + last-known-bad digest)"
# Unlike the storage service, this app is stateless: Postgres and Auth are on
# hosted Supabase and PDFs live in Zima Storage. There is no data volume to
# create here, and nothing on this box to back up except .env.

log "Checking .env"
if [ ! -f "$SRC/.env" ]; then
  die ".env is missing. Copy .env.example to .env and fill in real values first."
fi
# Server-side secrets the app cannot start usefully without.
for key in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY; do
  grep -qE "^${key}=.+" "$SRC/.env" || die "$key is missing or empty in .env"
done
chmod 600 "$SRC/.env"
echo "    .env present, required keys set, permissions tightened to 600"

if grep -qE '^TUNNEL_TOKEN=.+' "$SRC/.env"; then
  echo "    TUNNEL_TOKEN set — the tunnel profile will be started"
else
  warn "TUNNEL_TOKEN not set: starting WITHOUT the tunnel (LAN only, port 3000)."
  warn "That is the correct state for validation stages 1-2. Add the token from"
  warn "Cloudflare later and re-run: sudo ./deploy/deploy.sh --force"
fi

log "Checking GHCR access"
IMAGE="$(cd "$SRC" && docker compose config --images app 2>/dev/null | head -1)"
echo "    image: $IMAGE"
if docker pull "$IMAGE" >/dev/null 2>&1; then
  echo "    OK — image pulled"
else
  warn "could not pull the image. The package is private, so log in once AS ROOT:"
  warn "  echo YOUR_GITHUB_PAT | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin"
  warn "  (PAT needs only the read:packages scope)"
  warn "Root matters: the timer runs as root and reads $DOCKER_CONFIG,"
  warn "not your user's ~/.docker. Logging in as a normal user will not work."
fi

log "Installing systemd units"
install -m 644 "$SRC/deploy/ptec-elibrary-deploy.service" "$UNIT_DIR/"
install -m 644 "$SRC/deploy/ptec-elibrary-deploy.timer"   "$UNIT_DIR/"
install -m 644 "$SRC/deploy/ptec-storage-backup.service"  "$UNIT_DIR/"
install -m 644 "$SRC/deploy/ptec-storage-backup.timer"    "$UNIT_DIR/"
install -m 644 "$SRC/deploy/ptec-db-backup.service"       "$UNIT_DIR/"
install -m 644 "$SRC/deploy/ptec-db-backup.timer"         "$UNIT_DIR/"
chmod +x "$SRC/deploy/deploy.sh"
systemctl daemon-reload
systemctl enable --now ptec-elibrary-deploy.timer
echo "    deploy timer enabled"

# The nightly file backup only makes sense once its paths are configured —
# enabling it unconfigured would fail every night at 02:00.
if grep -qE '^STORAGE_BACKUP_SOURCE=.+' "$SRC/.env" && grep -qE '^STORAGE_BACKUP_TARGET=.+' "$SRC/.env"; then
  command -v node >/dev/null || warn "node not found on the box — the storage-backup timer needs it"
  systemctl enable --now ptec-storage-backup.timer
  echo "    storage-backup timer enabled (nightly 02:00, docs/BACKUP-DR.md §files)"
else
  warn "STORAGE_BACKUP_SOURCE / STORAGE_BACKUP_TARGET not set in .env —"
  warn "storage-backup timer installed but NOT enabled. Every PDF has a single"
  warn "copy until it runs: set both paths, then"
  warn "  sudo systemctl enable --now ptec-storage-backup.timer"
fi

# The DB backup needs no configuration the checks above have not already
# enforced (Supabase URL + service key), so it is enabled unconditionally.
# Leaving it off is what produced "Backups: Not configured" on the admin
# dashboard: nothing else in this deployment writes a backup_db heartbeat.
if command -v node >/dev/null; then
  systemctl enable --now ptec-db-backup.timer
  echo "    db-backup timer enabled (nightly 03:10, docs/BACKUP-DR.md §3)"
  grep -qE '^BACKUP_PASSPHRASE=.+' "$SRC/.env" \
    || warn "BACKUP_PASSPHRASE not set — DB archives will be written UNENCRYPTED"
else
  warn "node not found on the box — db-backup timer installed but NOT enabled."
  warn "Without it there is no verified restore point for the database:"
  warn "  install node, then sudo systemctl enable --now ptec-db-backup.timer"
fi

log "Starting the stack"
cd "$SRC"
if grep -qE '^TUNNEL_TOKEN=.+' .env; then
  docker compose --profile tunnel up -d
else
  docker compose up -d
fi

log "Waiting for the app to report healthy"
deadline=$(( $(date +%s) + 180 ))
status="starting"
while [ "$(date +%s)" -lt "$deadline" ]; do
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' ptec-elibrary 2>/dev/null || echo missing)"
  case "$status" in healthy|unhealthy) break ;; esac
  sleep 3
done
if [ "$status" = "healthy" ]; then
  echo "    healthy"
else
  warn "app is '$status' after 180s. Check: docker logs ptec-elibrary"
fi

log "Done"
cat <<EOM

  Automatic deploys are live. Every 5 minutes the box checks GHCR and
  deploys a new image if CI published one, rolling back if it is unhealthy.

  Useful commands:
    systemctl list-timers ptec-elibrary-deploy.timer   when the next check runs
    journalctl -u ptec-elibrary-deploy -f              watch deploy logs
    ./deploy/deploy.sh --status                        what is running now
    sudo ./deploy/deploy.sh --force                    deploy immediately

  Next: the Cloudflare Tunnel public hostname must target http://app:3000
  (the compose service name, not localhost). See docs/ZIMAOS-DEPLOYMENT.md
  and docs/DNS-HANDOFF.md.

EOM
