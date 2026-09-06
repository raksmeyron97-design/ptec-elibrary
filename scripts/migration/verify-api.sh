#!/usr/bin/env bash
# Application smoke test against a running e-Library (any environment).
#
#   APP_URL=https://library.ptec.edu.kh [CRON_SECRET=…] [BOOK_SLUG=…] ./verify-api.sh
#
# Checks status codes AND bodies for the cutover smoke list
# (docs/SELF_HOSTED_SUPABASE_CUTOVER.md §T+5). Auth-dependent surfaces
# (login, OAuth, MFA, upload, admin) are exercised by a human in the browser —
# this script checks they render and that the API/health plumbing behind them
# points at the right Supabase.
set -uo pipefail
SCRIPT_NAME=verify-api
. "$(dirname "$0")/common.sh"
load_app_env
require_cmd curl
APP="${APP_URL:-${NEXT_PUBLIC_SITE_URL:-http://localhost:3000}}"; APP="${APP%/}"
EXPECT_SUPABASE="${EXPECT_SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-}}"
fail=0; ok() { printf '  ✓ %s\n' "$*"; }; bad() { printf '  ✗ %s\n' "$*"; fail=1; }; note() { printf '  · %s\n' "$*"; }
page() { # page <path> <must-contain> [label]
  local p="$1" must="$2" r c b t0
  t0=$(date +%s%N); r=$(curl -sS -m 30 -L -w '\n%{http_code}' -H 'User-Agent: ptec-migration-verify' "$APP$p" 2>/dev/null); c=$(tail -1 <<<"$r"); b=$(sed '$d' <<<"$r")
  ms=$(( ($(date +%s%N)-t0)/1000000 ))
  if [ "$c" = 200 ] && { [ -z "$must" ] || grep -q -- "$must" <<<"$b"; }; then ok "$p 200 (${ms} ms)${3:+ — $3}"; else bad "$p → $c${must:+ / missing \"$must\"} (${ms} ms)"; fi
  printf '%s' "$b"
}

echo "Public pages"
home=$(page / "PTEC")
page /books "" >/dev/null; page /theses "" >/dev/null; page /publications "" >/dev/null; page /km "" >/dev/null
page "/search?q=mathematics" "" >/dev/null
page /auth/login "" "login page renders" >/dev/null
page /admin/login "" "admin login renders" >/dev/null
slug="${BOOK_SLUG:-$(grep -o 'href="/books/[^"/]*"' <<<"$home" | head -1 | sed 's/href="\/books\///; s/"//')}"
if [ -n "$slug" ]; then page "/books/$slug" "" "book detail" >/dev/null; c=$(curl -sS -m 30 -o /dev/null -w '%{http_code}' -L "$APP/books/$slug/read"); [ "$c" = 200 ] || [ "$c" = 401 ] && ok "/books/$slug/read → $c (reader shell)" || bad "reader → $c"; else note "no book slug found on the homepage; set BOOK_SLUG"; fi

echo "Bundle points at the right Supabase"
if [ -n "$EXPECT_SUPABASE" ]; then
  grep -q "$EXPECT_SUPABASE" <<<"$home" && ok "homepage HTML references $EXPECT_SUPABASE (preconnect)" || bad "homepage HTML does not reference $EXPECT_SUPABASE — stale image?"
  grep -q 'supabase\.co' <<<"$home" && case "$EXPECT_SUPABASE" in *supabase.co*) ;; *) bad "homepage still references supabase.co";; esac
  csp=$(curl -sS -m 15 -I "$APP/auth/login" | tr -d '\r' | grep -i '^content-security-policy:' | head -1)
  grep -q "${EXPECT_SUPABASE#http*://}" <<<"$csp" && ok "CSP connect-src includes the Supabase host" || bad "CSP does not include ${EXPECT_SUPABASE#http*://}"
  case "$EXPECT_SUPABASE" in https://*) grep -q "wss://${EXPECT_SUPABASE#https://}" <<<"$csp" && ok "CSP includes wss://${EXPECT_SUPABASE#https://}" || bad "CSP lacks the wss:// origin (Realtime blocked)";; esac
fi

echo "APIs"
r=$(curl -sS -m 15 -w '\n%{http_code}' "$APP/api/health"); c=$(tail -1 <<<"$r"); b=$(sed '$d' <<<"$r")
[ "$c" = 200 ] && ok "/api/health 200: $b" || bad "/api/health → $c: $b"
grep -q '"auth":"ok"' <<<"$b" && ok "health reports auth ok" || note "health has no auth check (older build) or auth failing"
if [ -n "${CRON_SECRET:-}" ]; then
  b=$(curl -sS -m 15 -H "Authorization: Bearer $CRON_SECRET" "$APP/api/health"); note "deep: $(grep -o '"latencyMs":{[^}]*}' <<<"$b") backupAgeHours=$(sed -n 's/.*"backupAgeHours":\([^,}]*\).*/\1/p' <<<"$b")"
fi
r=$(curl -sS -m 30 -w '\n%{http_code}' -H 'User-Agent: ptec-migration-verify' "$APP/api/search/native?q=mathematics"); c=$(tail -1 <<<"$r"); b=$(sed '$d' <<<"$r")
[ "$c" = 200 ] && ok "/api/search/native 200 (results: $(grep -o '"id"' <<<"$b" | wc -l | tr -d ' '))" || bad "native search → $c"
r=$(curl -sS -m 30 -w '\n%{http_code}' -H 'User-Agent: ptec-migration-verify' "$APP/api/search/native?q=គណិតវិទ្យា"); c=$(tail -1 <<<"$r"); [ "$c" = 200 ] && ok "Khmer native search 200" || bad "Khmer search → $c"
c=$(curl -sS -m 15 -o /dev/null -w '%{http_code}' "$APP/api/search/popular"); [ "$c" = 200 ] && ok "/api/search/popular 200" || bad "popular → $c"
c=$(curl -sS -m 15 -o /dev/null -w '%{http_code}' "$APP/api/recommendations"); [ "$c" = 200 ] || [ "$c" = 400 ] && ok "/api/recommendations → $c" || note "/api/recommendations → $c"
c=$(curl -sS -m 15 -o /dev/null -w '%{http_code}' "$APP/sitemap.xml"); [ "$c" = 200 ] && ok "sitemap 200" || note "sitemap → $c (noindex env?)"
c=$(curl -sS -m 15 -o /dev/null -w '%{http_code}' "$APP/sw.js"); [ "$c" = 200 ] && ok "service worker served" || bad "sw.js → $c"
c=$(curl -sS -m 15 -o /dev/null -w '%{http_code}' "$APP/manifest.webmanifest"); [ "$c" = 200 ] || c2=$(curl -sS -m 15 -o /dev/null -w '%{http_code}' "$APP/manifest.json"); [ "$c" = 200 ] || [ "${c2:-}" = 200 ] && ok "web manifest served" || note "manifest → $c/${c2:-}"

echo; [ $fail -eq 0 ] && log "VERIFY-API PASS" || { log "VERIFY-API FAILED"; exit 1; }
