#!/usr/bin/env bash
# Pull the models the PTEC e-Library expects, into the running Ollama container.
#
#   ./init-models.sh                          # qwen2.5:3b + bge-m3
#   CHAT_MODEL=qwen2.5:7b ./init-models.sh    # a bigger chat model (needs RAM/GPU)
#   ./init-models.sh --chat-only              # skip the embedding model
#
# Idempotent: a model already present is reported and not re-pulled. Safe to
# re-run after a restart, an upgrade, or a change of model.
#
# Requires: docker. Run it on the box, from infra/ai/scripts/.
set -uo pipefail

SCRIPT_NAME=init-models
CONTAINER="${OLLAMA_CONTAINER:-ptec-ollama}"
CHAT_MODEL="${CHAT_MODEL:-${OLLAMA_CHAT_MODEL:-qwen2.5:3b}}"
EMBED_MODEL="${EMBED_MODEL:-${OLLAMA_EMBED_MODEL:-bge-m3}}"
WAIT_SECONDS="${WAIT_SECONDS:-120}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

CHAT_ONLY=0
EMBED_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --chat-only)  CHAT_ONLY=1 ;;
    --embed-only) EMBED_ONLY=1 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) printf 'unknown argument: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

now()  { date -u +%Y-%m-%dT%H:%M:%SZ; }
log()  { printf '%s [%s] %s\n' "$(now)" "$SCRIPT_NAME" "$*"; }
die()  { printf '%s [%s] ERROR: %s\n' "$(now)" "$SCRIPT_NAME" "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "docker is not on PATH"

# ── 1. The container must exist and be running ───────────────────────────────
state="$(docker inspect --format '{{.State.Status}}' "$CONTAINER" 2>/dev/null)"
case "$state" in
  running) ;;
  "") die "container '$CONTAINER' does not exist — start it first:
       cd $(dirname "$SCRIPT_DIR") && docker compose up -d" ;;
  *) die "container '$CONTAINER' is '$state', not running — check: docker logs --tail 50 $CONTAINER" ;;
esac

# ── 2. …and the daemon inside it must be answering ───────────────────────────
# `docker compose up -d` returns as soon as the container starts; the HTTP API
# comes up a moment later. Pulling before then fails with a connection error
# that reads like a network problem, so wait for the API instead.
log "waiting for the Ollama API in '$CONTAINER' (up to ${WAIT_SECONDS}s)…"
waited=0
until docker exec "$CONTAINER" ollama list >/dev/null 2>&1; do
  waited=$((waited + 2))
  [ "$waited" -ge "$WAIT_SECONDS" ] && die "the daemon did not answer within ${WAIT_SECONDS}s — docker logs --tail 50 $CONTAINER"
  sleep 2
done
log "✔ daemon is up"

# ── 3. Pull what is missing ──────────────────────────────────────────────────
installed() {
  # `ollama list` prints a header plus one row per model; column 1 is the tag.
  docker exec "$CONTAINER" ollama list 2>/dev/null | awk 'NR > 1 { print $1 }'
}

has_model() {
  local want="$1" tagged="$1"
  case "$want" in *:*) ;; *) tagged="$want:latest" ;; esac
  installed | grep -qx -e "$tagged" -e "$want"
}

pull() {
  local model="$1" role="$2"
  if has_model "$model"; then
    log "✔ $role model already present: $model"
    return 0
  fi
  log "⇣ pulling $role model: $model (several GB — this takes a while on a slow link)"
  if docker exec "$CONTAINER" ollama pull "$model"; then
    log "✔ pulled $model"
    return 0
  fi
  # A wrong tag and a dead link fail the same way here; say what to check.
  log "✖ failed to pull $model"
  log "  Verify the tag exists at https://ollama.com/library and that the box has internet."
  return 1
}

failed=0
[ "$EMBED_ONLY" = 1 ] || pull "$CHAT_MODEL"  "chat"      || failed=1
[ "$CHAT_ONLY"  = 1 ] || pull "$EMBED_MODEL" "embedding" || failed=1

# ── 4. Prove the models actually RUN, not merely that they downloaded ────────
# A pull can finish while the model is too large to load on this box; that
# failure belongs here, not in a reader's first question.
if [ "$EMBED_ONLY" != 1 ] && has_model "$CHAT_MODEL"; then
  log "verifying $CHAT_MODEL can load and answer…"
  if docker exec "$CONTAINER" ollama run "$CHAT_MODEL" "Reply with the single word: ready" >/dev/null 2>&1; then
    log "✔ $CHAT_MODEL loads and answers"
  else
    log "✖ $CHAT_MODEL downloaded but did not answer — usually not enough RAM for this size."
    log "  Try a smaller model (qwen2.5:3b), or raise OLLAMA_MEMORY_LIMIT in infra/ai/docker-compose.yml."
    failed=1
  fi
fi

# ── 5. Report ────────────────────────────────────────────────────────────────
log ""
log "── Installed models ──"
docker exec "$CONTAINER" ollama list 2>/dev/null || true
log ""

if [ "$failed" -ne 0 ]; then
  log "✖ finished with errors — see above."
  exit 1
fi

log "✅ models ready."
log "   Next: point the app at this box and verify end to end —"
log "     .env:  AI_PROVIDER=ollama"
log "            OLLAMA_BASE_URL=http://ptec-ollama:11434/v1   (app in Docker)"
log "            OLLAMA_CHAT_MODEL=$CHAT_MODEL"
log "     then:  npx tsx scripts/test-local-ai.ts"
exit 0
