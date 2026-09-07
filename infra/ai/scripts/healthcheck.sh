#!/usr/bin/env bash
# Is the local AI daemon answering, and does it hold the models the app expects?
#
#   ./healthcheck.sh                 # human output
#   ./healthcheck.sh --json          # machine output (for monitors/cron)
#   ./healthcheck.sh --quiet         # no output, exit code only
#
# Exit 0 when /api/tags answers AND every required model is present; 1
# otherwise. A missing model is a failure on purpose: the daemon being up
# while the model is absent looks healthy from the outside and fails every
# actual request, which is the shape of outage that goes unnoticed longest.
#
# Requires: curl. `jq` is NOT required — the box does not have it.
set -uo pipefail

SCRIPT_NAME=ai-healthcheck
HOST="${OLLAMA_HOST_URL:-http://127.0.0.1:${OLLAMA_PORT:-11434}}"
CHAT_MODEL="${OLLAMA_CHAT_MODEL:-qwen2.5:3b}"
EMBED_MODEL="${OLLAMA_EMBED_MODEL:-bge-m3}"
TIMEOUT="${OLLAMA_HEALTH_TIMEOUT:-10}"

JSON=0
QUIET=0
for arg in "$@"; do
  case "$arg" in
    --json)  JSON=1 ;;
    --quiet) QUIET=1 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) printf 'unknown argument: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

say() { [ "$QUIET" = 1 ] || printf '%s\n' "$*"; }

started=$(date +%s)
body="$(curl -sS -m "$TIMEOUT" "$HOST/api/tags" 2>/dev/null)"
rc=$?
elapsed=$(( $(date +%s) - started ))

if [ $rc -ne 0 ] || [ -z "$body" ]; then
  if [ "$JSON" = 1 ]; then
    printf '{"ok":false,"url":"%s","error":"unreachable","latency_s":%d}\n' "$HOST" "$elapsed"
  else
    say "✖ Ollama is unreachable at $HOST/api/tags"
    say "  Is the container up?  docker compose -f infra/ai/docker-compose.yml ps"
    say "  Recent logs:          docker logs --tail 50 ptec-ollama"
  fi
  exit 1
fi

# Model names out of the JSON without jq: every entry is "name":"<tag>".
models="$(printf '%s' "$body" | tr ',' '\n' | sed -n 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"

# `bge-m3` is stored as `bge-m3:latest`; match either spelling.
has_model() {
  local want="$1"
  case "$want" in *:*) ;; *) want="$want:latest" ;; esac
  printf '%s\n' "$models" | grep -qx -e "$want" -e "$1"
}

fail=0
has_model "$CHAT_MODEL"  && chat_ok=true  || { chat_ok=false;  fail=1; }
has_model "$EMBED_MODEL" && embed_ok=true || { embed_ok=false; fail=1; }

if [ "$JSON" = 1 ]; then
  list="$(printf '%s' "$models" | tr '\n' ' ' | sed 's/ *$//' | sed 's/ /","/g')"
  [ -n "$list" ] && list="\"$list\""
  printf '{"ok":%s,"url":"%s","latency_s":%d,"chat_model":"%s","chat_present":%s,"embed_model":"%s","embed_present":%s,"models":[%s]}\n' \
    "$([ $fail -eq 0 ] && echo true || echo false)" "$HOST" "$elapsed" \
    "$CHAT_MODEL" "$chat_ok" "$EMBED_MODEL" "$embed_ok" "$list"
  exit $fail
fi

say "Ollama at $HOST — responding (${elapsed}s)"
say "  $([ "$chat_ok"  = true ] && echo '✔' || echo '✖') chat model      $CHAT_MODEL"
say "  $([ "$embed_ok" = true ] && echo '✔' || echo '✖') embedding model $EMBED_MODEL"
if [ $fail -ne 0 ]; then
  say ""
  say "  Missing models. Pull them with:  ./scripts/init-models.sh"
  say "  Installed: $(printf '%s' "$models" | tr '\n' ' ')"
fi
exit $fail
