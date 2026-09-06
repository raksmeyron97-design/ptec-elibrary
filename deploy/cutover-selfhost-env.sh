#!/usr/bin/env bash
# PTEC e-Library — switch the box's app .env to the self-hosted Supabase stack.
#
# Step 3 of docs/SELF_HOSTED_SUPABASE_CUTOVER.md, done by a script so that the
# three values that change cannot be mistyped and the rollback input is written
# BEFORE anything is touched. It edits nothing else: R2, Turnstile, Gmail, VAPID,
# CRON_SECRET, the JWT keys and every other line survive byte for byte.
#
#   sudo ./deploy/cutover-selfhost-env.sh            # apply
#   sudo ./deploy/cutover-selfhost-env.sh --dry-run  # show the diff, write nothing
#   sudo ./deploy/cutover-selfhost-env.sh --rollback # restore .env from .env.cloud
#
# After `apply`, run `sudo ./deploy/deploy.sh --force`. After `--rollback`, the
# same. Nothing here restarts a container.
#
# What it writes:
#   .env.cloud   — an exact copy of today's .env, plus IMAGE_TAG pinned to the
#                  image the container is running RIGHT NOW (sha tag), so a
#                  rollback brings back the Cloud-pointing build, not whatever
#                  :main has become since. Never overwritten once it exists.
#   .env         — NEXT_PUBLIC_SUPABASE_URL, SUPABASE_INTERNAL_URL and
#                  COMPOSE_FILE set to the self-hosted values; every other line
#                  unchanged and in its original order.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$APP_DIR/.env"
CLOUD_FILE="$APP_DIR/.env.cloud"
CONTAINER="${CONTAINER:-ptec-elibrary}"

SELF_URL="${SELF_URL:-https://supabase.storage-ptec.online}"
INTERNAL_URL="${INTERNAL_URL:-http://kong:8000}"
COMPOSE_FILES="docker-compose.yml:docker-compose.selfhost.yml"

MODE=apply
for a in "$@"; do
  case "$a" in
    --dry-run) MODE=dry ;;
    --rollback) MODE=rollback ;;
    *) echo "unknown argument: $a" >&2; exit 2 ;;
  esac
done

die() { echo "ERROR: $*" >&2; exit 1; }
[ -f "$ENV_FILE" ] || die "$ENV_FILE not found — run from the app checkout on the box"

# ── rollback ────────────────────────────────────────────────────────────────
if [ "$MODE" = rollback ]; then
  [ -f "$CLOUD_FILE" ] || die "$CLOUD_FILE does not exist — nothing to roll back to"
  cp -p "$ENV_FILE" "$ENV_FILE.selfhosted.$(date +%Y%m%d%H%M%S)"
  cp -p "$CLOUD_FILE" "$ENV_FILE"
  echo "restored $ENV_FILE from $CLOUD_FILE (previous .env kept as .env.selfhosted.<ts>)"
  echo "next: sudo ./deploy/deploy.sh --force"
  exit 0
fi

# ── the image the box is running now, for the rollback file ────────────────
running_tag=""
if command -v docker >/dev/null 2>&1; then
  digest="$(docker inspect --format '{{index .RepoDigests 0}}' "$(docker inspect --format '{{.Image}}' "$CONTAINER" 2>/dev/null)" 2>/dev/null || true)"
  # RepoDigests look like ghcr.io/owner/repo@sha256:…; the sha-<gitsha> tag is
  # what deploy.sh pins by, so prefer a tag when the image carries one.
  tags="$(docker inspect --format '{{join .RepoTags " "}}' "$(docker inspect --format '{{.Image}}' "$CONTAINER" 2>/dev/null)" 2>/dev/null || true)"
  for t in $tags; do
    case "$t" in *:sha-*) running_tag="${t##*:}" ;; esac
  done
  [ -n "$running_tag" ] || [ -z "$digest" ] || running_tag="@${digest##*@}"
fi

# ── build the new .env in memory ────────────────────────────────────────────
set_kv() {
  # set_kv FILE KEY VALUE — replace the first uncommented KEY= line, or append.
  local file="$1" key="$2" value="$3"
  if grep -qE "^${key}=" "$file"; then
    awk -v k="$key" -v v="$value" 'BEGIN{done=0} { if (!done && index($0, k"=")==1) { print k"="v; done=1 } else print }' "$file" > "$file.tmp"
  else
    cp "$file" "$file.tmp"
    printf '%s=%s\n' "$key" "$value" >> "$file.tmp"
  fi
  mv "$file.tmp" "$file"
}

work="$(mktemp)"
cp "$ENV_FILE" "$work"
set_kv "$work" NEXT_PUBLIC_SUPABASE_URL "$SELF_URL"
set_kv "$work" SUPABASE_INTERNAL_URL "$INTERNAL_URL"
set_kv "$work" COMPOSE_FILE "$COMPOSE_FILES"

echo "── changes to $ENV_FILE ──"
diff -u "$ENV_FILE" "$work" | sed -E 's/^(\+|-)(.*(KEY|SECRET|PASS|TOKEN)[^=]*=).*/\1\2…/' || true
echo "── rollback file: $CLOUD_FILE (IMAGE_TAG=${running_tag:-<unknown — pin by hand>}) ──"

if [ "$MODE" = dry ]; then
  rm -f "$work"
  echo "dry run — nothing written"
  exit 0
fi

# ── write the rollback file first, never overwrite an existing one ──────────
if [ -f "$CLOUD_FILE" ]; then
  echo "$CLOUD_FILE already exists — left untouched"
else
  cp -p "$ENV_FILE" "$CLOUD_FILE"
  if [ -n "$running_tag" ] && [ "${running_tag#@}" = "$running_tag" ]; then
    set_kv "$CLOUD_FILE" IMAGE_TAG "$running_tag"
  else
    printf '\n# ROLLBACK: pin IMAGE_TAG=sha-<40-char sha of the last Cloud-pointing image> before using this file\n' >> "$CLOUD_FILE"
  fi
  chmod 600 "$CLOUD_FILE"
  echo "wrote $CLOUD_FILE"
fi

# ── then the live file, atomically, keeping mode and owner ──────────────────
cp -p "$ENV_FILE" "$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"
cat "$work" > "$ENV_FILE"
rm -f "$work"
chmod 600 "$ENV_FILE" 2>/dev/null || true

# ── sanity: every KEY=VALUE line still parses; the three values are there ───
bad="$(grep -vE '^\s*(#|$)' "$ENV_FILE" | grep -vE '^[A-Za-z_][A-Za-z0-9_]*=' || true)"
[ -z "$bad" ] || die "malformed lines after edit:\n$bad"
for k in NEXT_PUBLIC_SUPABASE_URL SUPABASE_INTERNAL_URL COMPOSE_FILE; do
  printf '  %-26s %s\n' "$k" "$(grep -E "^$k=" "$ENV_FILE" | head -1 | cut -d= -f2-)"
done
echo "done — next: sudo ./deploy/deploy.sh --force"
