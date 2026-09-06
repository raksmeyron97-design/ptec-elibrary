#!/usr/bin/env bash
# Roll the APPLICATION back to Supabase Cloud (docs/SELF_HOSTED_SUPABASE_ROLLBACK.md).
# Runs on the box. Non-destructive: the self-hosted stack keeps running and its
# data stays; only the app's environment is switched and the container restarted.
#
# Prerequisite (made at cutover): a copy of the Cloud-era app env at
#   /DATA/AppData/ptec-elibrary/app/.env.cloud   (NEXT_PUBLIC_SUPABASE_URL, ANON key,
#   SERVICE_ROLE key, no SUPABASE_INTERNAL_URL, COMPOSE_FILE unset)
# and the Cloud project still alive (never deleted during the migration).
#
#   sudo ./rollback.sh            # switch env, restart app, wait for health
#   sudo ./rollback.sh --dry-run  # show what would change
#
# NOTE: NEXT_PUBLIC_* values are baked into the IMAGE. Switching the env alone
# is enough only while the running image was built for Cloud (the T-0 image
# is; the first self-hosted image is not). The script therefore also pins
# IMAGE_TAG to the last Cloud-built image recorded at cutover
# (.env.cloud: IMAGE_TAG=sha-…) and lets deploy.sh install it.
set -euo pipefail
SCRIPT_NAME=rollback
APP_DIR="${APP_DIR:-/DATA/AppData/ptec-elibrary/app}"
. "$(cd "$(dirname "$0")" && pwd)/common.sh"
DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1
cd "$APP_DIR"
[ -f .env.cloud ] || die "missing $APP_DIR/.env.cloud — the Cloud-era env saved at cutover (see cutover runbook T-10)"
for k in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY IMAGE_TAG; do grep -qE "^$k=.+" .env.cloud || die "$k missing from .env.cloud"; done
grep -q 'supabase\.co' .env.cloud || warn ".env.cloud does not point at supabase.co — is this really the Cloud env?"

echo "Would switch:"; diff <(grep -E '^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_INTERNAL_URL|COMPOSE_FILE|IMAGE_TAG)=' .env | redact) <(grep -E '^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_INTERNAL_URL|COMPOSE_FILE|IMAGE_TAG)=' .env.cloud | redact) || true
[ $DRY -eq 1 ] && exit 0

cp .env ".env.selfhosted.$(date +%Y%m%d-%H%M%S)"; chmod 600 .env.selfhosted.*
# Merge: everything from the current .env except the Supabase/compose keys, which come from .env.cloud.
{ grep -vE '^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_INTERNAL_URL|COMPOSE_FILE|IMAGE_TAG)=' .env; grep -E '^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|IMAGE_TAG)=' .env.cloud; } > .env.new
mv .env.new .env; chmod 600 .env
log "app .env now points at Cloud; installing the Cloud-built image via deploy.sh --force"
./deploy/deploy.sh --force || die "deploy.sh reported a problem — check docker logs ptec-elibrary"
sleep 5
curl -sS -m 15 "http://127.0.0.1:3000/api/health" || true; echo
log "ROLLBACK COMPLETE. Also revert: GitHub variable NEXT_PUBLIC_SUPABASE_URL (+ANON key, service secret) so the NEXT build is Cloud-shaped, and restore SUPABASE_DB_URL for migrate.yml."
