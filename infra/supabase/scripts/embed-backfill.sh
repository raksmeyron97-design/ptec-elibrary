#!/usr/bin/env bash
# Backfill pgvector chunk embeddings — ON the box, inside the Supabase network.
#
#   ./embed-backfill.sh --dry-run          # show what would run, touch nothing
#   ./embed-backfill.sh                    # embed every record still missing chunks
#   ./embed-backfill.sh --limit 5          # a verification slice
#   ./embed-backfill.sh -- --offset 400 --limit 400   # one disjoint slice
#   ./embed-backfill.sh --detach           # run in the background, follow the log
#
# WHY THIS EXISTS RATHER THAN JUST RUNNING THE SCRIPT
#
# `scripts/embed-library.ts` works fine from a laptop and takes about
# THIRTY-EIGHT HOURS. Measured against production 2026-09-17: ~0.6 records/min,
# and the bottleneck is not the model. At `EMBED_BATCH` 16 a Gemini call takes
# ~2.6 s against a 200 ms delay — embedding sixteen short texts is well under a
# second — so the remainder is the `INSERT_BATCH` of 40 rows × 768-dimensional
# vectors crossing the Cloudflare tunnel, once per batch, for ~224,000 chunks.
#
# Run the same script ON the box and that insert becomes a hop on a private
# Docker network. The Gemini call still leaves the building; nothing else does.
#
# WHY A CONTAINER RATHER THAN `npx tsx` ON THE HOST
#
# lib.sh states the box's contract: bash, docker, coreutils — "node is
# optional". The repo is checked out here (migrate.sh pulls it) but the runtime
# image ships only `.next/standalone`, with no `scripts/`, no tsx and no dev
# dependencies, so the app container cannot run this either. A one-off
# `node:22-alpine` joined to the Supabase network needs neither.
#
# THE LOCK IS NOT DECORATION. `embedRecordChunks` DELETES a record's chunks and
# re-inserts them, and every process computes its target list once at startup
# from the same sorted scan — so two unsliced runs take the same head of the
# same queue and race delete-against-insert on identical records. One run at a
# time here; use `--offset`/`--limit` (see scripts/embed-library.ts) if you
# genuinely want disjoint slices in parallel.
#
# Safe to interrupt at any point: a record is written only after every chunk in
# it succeeded, a re-run skips records that already have `book_chunks`, and a
# daily-quota stop exits cleanly keeping what is done.

set -euo pipefail
SCRIPT_NAME=embed-backfill
. "$(dirname "$0")/lib.sh"

DRY=0
DETACH=0
PULL=0
PASSTHRU=()
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --detach) DETACH=1 ;;
    --pull) PULL=1 ;;
    --) shift; PASSTHRU+=("$@"); break ;;
    --limit|--offset) PASSTHRU+=("$1" "${2:?$1 needs a value}"); shift ;;
    --chunks-only|--metadata-only|--all) PASSTHRU+=("$1") ;;
    -h|--help) sed -n '2,40p' "$0"; exit 0 ;;
    *) die "unknown argument: $1 (pass script flags after --)" ;;
  esac
  shift
done

# `--chunks-only` is the reason this script exists; the metadata phase is a
# handful of rows and needs no help. Added unless the caller chose a phase.
case " ${PASSTHRU[*]-} " in
  *" --chunks-only "*|*" --metadata-only "*|*" --all "*) ;;
  *) PASSTHRU=("--chunks-only" ${PASSTHRU[@]+"${PASSTHRU[@]}"}) ;;
esac

load_env

# ── Preconditions ────────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || die "docker is required"
docker inspect supabase-kong >/dev/null 2>&1 || die "supabase-kong is not running — start the stack first"

# The network the Supabase stack declares (infra/supabase/docker-compose.yml:
# `networks.supabase.name: ptec-supabase`). Read from the running container
# rather than assumed, so a renamed project does not silently fall back to a
# tunnel round-trip that still WORKS and is forty times slower.
NETWORK="$(docker inspect supabase-kong \
  --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}' | head -1)"
[ -n "$NETWORK" ] || die "could not determine supabase-kong's network"

APP_ENV="$REPO_DIR/.env"
[ -f "$APP_ENV" ] || die "missing $APP_ENV — the app's env carries GEMINI_API_KEY"

# Fail here rather than 40 minutes in. Names only; values are never echoed.
for k in SUPABASE_SERVICE_ROLE_KEY GEMINI_API_KEY; do
  grep -qE "^${k}=.+" "$APP_ENV" "$ENV_FILE" 2>/dev/null || die "$k is not set in $APP_ENV or $ENV_FILE"
done

if [ "$PULL" = 1 ]; then
  log "git pull --ff-only in $REPO_DIR"
  (cd "$REPO_DIR" && git pull --ff-only) || die "git pull failed — resolve it before backfilling"
fi

# ── The run ──────────────────────────────────────────────────────────────────
# node_modules lives in a named volume, not in the repo checkout: `npm ci` on
# alpine builds platform-specific binaries, and writing those into a checkout
# that a macOS laptop also uses over a share is how you get a module built for
# the wrong libc. It persists, so only the first run pays for the install.
VOLUME=ptec-embed-node-modules
IMAGE="${EMBED_NODE_IMAGE:-node:22-alpine}"
CONTAINER="ptec-embed-backfill"

# Internal address. THIS is the whole point of the script: `lib/supabase/origin.ts`
# prefers SUPABASE_INTERNAL_URL for server-side clients, so every insert goes
# to Kong over the private network instead of out through the tunnel.
INTERNAL_URL="${SUPABASE_INTERNAL_URL:-http://kong:8000}"

log "network      $NETWORK"
log "supabase     $INTERNAL_URL (internal — inserts do not leave the box)"
log "image        $IMAGE"
log "script args  embed-library.ts ${PASSTHRU[*]-}"

if [ "$DRY" = 1 ]; then
  log "DRY RUN — nothing started. Re-run without --dry-run to begin."
  exit 0
fi

docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
take_lock "${STATE_DIR:-/tmp}/embed-backfill.lock" 2>/dev/null || \
  take_lock "/tmp/embed-backfill.lock"

RUN_FLAGS=(--rm --name "$CONTAINER" --network "$NETWORK"
  -v "$REPO_DIR:/app" -v "$VOLUME:/app/node_modules" -w /app
  --env-file "$APP_ENV" --env-file "$ENV_FILE"
  -e "SUPABASE_INTERNAL_URL=$INTERNAL_URL"
  -e NODE_OPTIONS=--max-old-space-size=4096
  -e CI=1)
[ "$DETACH" = 1 ] && RUN_FLAGS+=(-d) || RUN_FLAGS+=(-i)

# `npm ci` only when the volume is empty — a reinstall on every run would add
# minutes to a job whose whole purpose is going faster.
docker run "${RUN_FLAGS[@]}" "$IMAGE" sh -lc '
  set -e
  if [ ! -x node_modules/.bin/tsx ]; then
    echo "installing dependencies (first run only)…"
    npm ci --include=dev --no-audit --no-fund
  fi
  exec npx tsx scripts/embed-library.ts '"${PASSTHRU[*]-}"'
'

if [ "$DETACH" = 1 ]; then
  log "started in the background. Follow it with:"
  log "  docker logs -f $CONTAINER"
  log "Progress is also readable from the database — count distinct record_id in"
  log "book_chunks — which is the honest source: the script's per-record progress"
  log "uses carriage returns, so a filtered log looks frozen while it is healthy."
else
  log "done"
fi
