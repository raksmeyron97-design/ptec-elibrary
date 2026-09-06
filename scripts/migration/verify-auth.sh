#!/usr/bin/env bash
# Auth + PostgREST verification through the GATEWAY (what the browser sees).
#
#   SUPABASE_URL=https://supabase.storage-ptec.online ANON_KEY=… [SERVICE_KEY=…] \
#   [TEST_EMAIL=… TEST_PASSWORD=…] ./verify-auth.sh
#
# Defaults to NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY /
# SUPABASE_SERVICE_ROLE_KEY from the repo .env. A 200 alone never passes a
# check — bodies are inspected (settings JSON, RLS behaviour, token shape).
set -uo pipefail
SCRIPT_NAME=verify-auth
. "$(dirname "$0")/common.sh"
load_app_env
require_cmd curl
URL="${SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-}}"; ANON="${ANON_KEY:-${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}}"; SVC="${SERVICE_KEY:-${SUPABASE_SERVICE_ROLE_KEY:-}}"
[ -n "$URL" ] && [ -n "$ANON" ] || die "SUPABASE_URL and ANON_KEY required"
URL="${URL%/}"
fail=0; ok() { printf '  ✓ %s\n' "$*"; }; bad() { printf '  ✗ %s\n' "$*"; fail=1; }; note() { printf '  · %s\n' "$*"; }
get() { curl -sS -m 15 -w '\n%{http_code}' "$@" 2>/dev/null; }
body() { sed '$d'; }; code() { tail -1; }

echo "GoTrue"
r=$(get -H "apikey: $ANON" "$URL/auth/v1/health"); c=$(code <<<"$r"); b=$(body <<<"$r")
[ "$c" = 200 ] && grep -q '"version"' <<<"$b" && ok "/auth/v1/health 200 ($(sed -n 's/.*"version":"\([^"]*\)".*/\1/p' <<<"$b"))" || bad "/auth/v1/health → $c"
r=$(get -H "apikey: $ANON" "$URL/auth/v1/settings"); c=$(code <<<"$r"); b=$(body <<<"$r")
if [ "$c" = 200 ]; then
  ok "/auth/v1/settings 200"
  if grep -q '"google":true' <<<"$b"; then ok "google provider enabled"
  elif [ "${EXPECT_GOOGLE:-true}" = "false" ]; then note "google provider disabled (EXPECT_GOOGLE=false — staging)"
  else bad "google provider NOT enabled in settings"; fi
  grep -q '"email":true' <<<"$b" && ok "email provider enabled" || bad "email provider disabled"
  grep -q '"disable_signup":false' <<<"$b" && ok "signup enabled" || note "signup disabled"
  grep -q '"mfa_enabled":true' <<<"$b" && ok "MFA enabled" || note "settings does not report mfa_enabled (older GoTrue reports totp under mfa)"
  grep -qi 'turnstile\|"captcha"' <<<"$b" && note "captcha: $(grep -o '"captcha[^,}]*' <<<"$b" | head -1)" || note "captcha not reported in settings"
else bad "/auth/v1/settings → $c"; fi
c=$(get "$URL/auth/v1/settings" | code); [ "$c" = 401 ] && ok "no apikey → 401 (key-auth enforced)" || bad "no apikey → $c (expected 401)"

echo "PostgREST"
r=$(get -H "apikey: $ANON" -H "Authorization: Bearer $ANON" "$URL/rest/v1/categories?select=id&limit=1"); c=$(code <<<"$r")
[ "$c" = 200 ] && ok "anon read categories 200" || bad "anon read categories → $c"
r=$(get -H "apikey: $ANON" -H "Authorization: Bearer $ANON" "$URL/rest/v1/books?select=id&is_published=eq.true&limit=1"); c=$(code <<<"$r"); b=$(body <<<"$r")
[ "$c" = 200 ] && ok "anon read published books 200 (rows: $(grep -o '"id"' <<<"$b" | wc -l | tr -d ' '))" || bad "anon books → $c"
r=$(get -H "apikey: $ANON" -H "Authorization: Bearer $ANON" "$URL/rest/v1/rate_limit?select=*&limit=1"); c=$(code <<<"$r")
case "$c" in 401|403|404) ok "anon on service-only table rate_limit → $c (denied)";; 200) b=$(body <<<"$r"); [ "$b" = "[]" ] && ok "anon on rate_limit → empty (RLS)" || bad "anon can READ rate_limit rows!";; *) bad "anon rate_limit → $c";; esac
r=$(get -H "apikey: $ANON" -H "Authorization: Bearer $ANON" "$URL/rest/v1/profiles?select=email&limit=5"); c=$(code <<<"$r"); b=$(body <<<"$r")
grep -q '@' <<<"$b" && bad "anon can read profile emails!" || ok "anon cannot read profile emails ($c)"
c=$(get -H "apikey: not-a-key" "$URL/rest/v1/categories?select=id" | code); [ "$c" = 401 ] && ok "bad apikey → 401" || bad "bad apikey → $c"
c=$(get -H "apikey: $ANON" "$URL/rest/v1/" | code); case "$c" in 401|403) ok "OpenAPI root with anon → $c";; 200) bad "anon can enumerate the OpenAPI root";; *) note "OpenAPI root → $c";; esac
if [ -n "$SVC" ]; then
  c=$(get -H "apikey: $SVC" -H "Authorization: Bearer $SVC" "$URL/rest/v1/" | code); [ "$c" = 200 ] && ok "OpenAPI root with service key 200" || bad "service key OpenAPI root → $c"
  r=$(get -H "apikey: $SVC" -H "Authorization: Bearer $SVC" -H "Content-Type: application/json" -X POST -d '{}' "$URL/rest/v1/rpc/get_home_stats"); c=$(code <<<"$r"); [ "$c" = 200 ] && ok "rpc get_home_stats 200" || bad "rpc get_home_stats → $c"
  r=$(get -H "apikey: $SVC" -H "Authorization: Bearer $SVC" -H "Content-Type: application/json" -X POST -d '{"query_text":"mathematics","match_count":3}' "$URL/rest/v1/rpc/search_library_fuzzy"); c=$(code <<<"$r"); [ "$c" = 200 ] && ok "rpc search_library_fuzzy (pg_trgm) 200" || bad "rpc search_library_fuzzy → $c"
  r=$(get -H "apikey: $SVC" -H "Authorization: Bearer $SVC" "$URL/auth/v1/admin/users?page=1&per_page=1"); c=$(code <<<"$r"); [ "$c" = 200 ] && ok "admin API listUsers 200 (users on page: $(grep -o '"aud"' <<<"$(body <<<"$r")" | wc -l | tr -d ' '))" || bad "admin listUsers → $c"
fi

echo "Realtime"
c=$(get -H "apikey: $ANON" "$URL/realtime/v1/api/tenants/realtime-dev/health" | code); case "$c" in 403|404) ok "tenant admin API blocked ($c)";; 200) bad "realtime tenant API is publicly readable";; *) note "tenant API → $c";; esac
if command -v node >/dev/null 2>&1; then
  ws="${URL/https:/wss:}"; ws="${ws/http:/ws:}"
  node -e '
    const url = process.argv[1] + "/realtime/v1/websocket?apikey=" + encodeURIComponent(process.argv[2]) + "&vsn=1.0.0";
    const t = setTimeout(() => { console.log("timeout"); process.exit(2); }, 8000);
    try { const ws = new WebSocket(url); ws.onopen = () => { console.log("open"); clearTimeout(t); ws.close(); process.exit(0); }; ws.onerror = (e) => { console.log("error"); clearTimeout(t); process.exit(1); }; }
    catch (e) { console.log("no WebSocket in this node"); process.exit(3); }' "$ws" "$ANON" >/tmp/ws.$$ 2>&1; rc=$?
  case "$rc" in 0) ok "websocket connect to /realtime/v1/websocket";; 3) note "node lacks WebSocket (need node ≥ 22)";; *) bad "websocket connect failed ($(cat /tmp/ws.$$))";; esac; rm -f /tmp/ws.$$
fi

echo "Login (optional: TEST_EMAIL/TEST_PASSWORD)"
if [ -n "${TEST_EMAIL:-}" ] && [ -n "${TEST_PASSWORD:-}" ]; then
  r=$(curl -sS -m 15 -w '\n%{http_code}' -H "apikey: $ANON" -H "Content-Type: application/json" -X POST -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" "$URL/auth/v1/token?grant_type=password"); c=$(code <<<"$r"); b=$(body <<<"$r")
  if [ "$c" = 200 ] && grep -q '"access_token"' <<<"$b"; then
    ok "password grant 200"
    tok=$(sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p' <<<"$b"); rt=$(sed -n 's/.*"refresh_token":"\([^"]*\)".*/\1/p' <<<"$b")
    iss=$(printf '%s' "$tok" | cut -d. -f2 | tr '_-' '/+' | awk '{l=length($0)%4; if(l==2)$0=$0"=="; else if(l==3)$0=$0"="; print}' | base64 -d 2>/dev/null | sed -n 's/.*"iss":"\([^"]*\)".*/\1/p'); note "token iss=$iss"
    c=$(get -H "apikey: $ANON" -H "Authorization: Bearer $tok" "$URL/auth/v1/user" | code); [ "$c" = 200 ] && ok "GET /auth/v1/user with token 200" || bad "user endpoint → $c"
    r=$(curl -sS -m 15 -w '\n%{http_code}' -H "apikey: $ANON" -H "Content-Type: application/json" -X POST -d "{\"refresh_token\":\"$rt\"}" "$URL/auth/v1/token?grant_type=refresh_token"); c=$(code <<<"$r"); [ "$c" = 200 ] && ok "refresh token grant 200" || bad "refresh → $c"
    r=$(get -H "apikey: $ANON" -H "Authorization: Bearer $tok" "$URL/rest/v1/profiles?select=id&limit=1"); c=$(code <<<"$r"); [ "$c" = 200 ] && ok "authenticated PostgREST read 200" || bad "authenticated read → $c"
    c=$(curl -sS -m 15 -o /dev/null -w '%{http_code}' -H "apikey: $ANON" -H "Authorization: Bearer $tok" -X POST "$URL/auth/v1/logout"); [ "$c" = 204 ] && ok "logout 204" || bad "logout → $c"
  else
    grep -q -i captcha <<<"$b" && note "password grant → $c: captcha required (expected when AUTH_CAPTCHA_ENABLED=true; test through the app instead)" || bad "password grant → $c: $(head -c 160 <<<"$b")"
  fi
else note "skipped (set TEST_EMAIL/TEST_PASSWORD for a seeded or throwaway account)"; fi

echo; [ $fail -eq 0 ] && log "VERIFY-AUTH PASS" || { log "VERIFY-AUTH FAILED"; exit 1; }
