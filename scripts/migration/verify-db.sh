#!/usr/bin/env bash
# Snapshot and compare the Cloud and self-hosted databases.
#
#   CLOUD_DB_URL=… ./verify-db.sh --cloud       # writes reports/migration/verify/cloud-<ts>.txt
#   ./verify-db.sh --selfhosted                  # writes …/selfhosted-<ts>.txt (docker exec)
#   ./verify-db.sh --compare [cloud.txt selfhosted.txt]   # diff newest of each → report.md
#
# The snapshot (snapshot.sql) covers extensions, roles, tables + RLS flags, row
# counts, columns/nullability/defaults, constraints (FKs, checks, uniques),
# indexes (incl. HNSW/GIN), function bodies (md5) and grants, triggers, views,
# policies, table grants, sequences, realtime publication, vector columns,
# migration history. Expected differences (documented in the report):
# sequences' last_value (restore advances them), auth schema version if GoTrue
# is newer, and anything restored deliberately differently.
set -euo pipefail
SCRIPT_NAME=verify-db
. "$(dirname "$0")/common.sh"
require_cmd docker diff
V="$OUT_ROOT/verify"; mkdir -p "$V"
TS=$(date -u +%Y%m%d-%H%M%S)
SQL="$(dirname "$0")/snapshot.sql"
mode="${1:---compare}"

snapshot() { # snapshot <label> <psql-fn>
  local label="$1" fn="$2" out
  out="$V/$label-$TS.txt"
  log "snapshot $label → $out"
  "$fn" -At -v ON_ERROR_STOP=1 < "$SQL" > "$out"
  # DB latency, measured server-side round trip from this client (3 samples).
  { echo "=== db latency ms (select 1 x3, select count(*) from books x3)"; for i in 1 2 3; do s=$(date +%s%N); "$fn" -Atc 'select 1' >/dev/null; echo $(( ($(date +%s%N)-s)/1000000 )); done; for i in 1 2 3; do s=$(date +%s%N); "$fn" -Atc 'select count(*) from public.books' >/dev/null; echo $(( ($(date +%s%N)-s)/1000000 )); done; } >> "$out"
  wc -l < "$out" | xargs -I{} log "{} lines"
}

case "$mode" in
  --cloud) snapshot cloud cloud_psql ;;
  --selfhosted) snapshot selfhosted selfhost_psql ;;
  --compare)
    A="${2:-$(ls -1t "$V"/cloud-*.txt 2>/dev/null | head -1)}"; B="${3:-$(ls -1t "$V"/selfhosted-*.txt 2>/dev/null | head -1)}"
    [ -f "$A" ] && [ -f "$B" ] || die "need a cloud and a selfhosted snapshot (run --cloud and --selfhosted first)"
    R="$V/report-$TS.md"
    strip() { grep -vE '^(.*last=[0-9-]+|[0-9]+)$' "$1" | sed '/=== db latency/,$d'; }  # ignore sequence values + latency lines
    if diff -u <(strip "$A") <(strip "$B") > "$V/diff-$TS.txt"; then verdict="PASS — no structural or row-count differences"; else verdict="DIFFERENCES FOUND — review $V/diff-$TS.txt"; fi
    {
      echo "# Database verification report ($TS)"; echo
      echo "- cloud snapshot: \`$(basename "$A")\`"; echo "- self-hosted snapshot: \`$(basename "$B")\`"; echo "- verdict: **$verdict**"; echo
      echo "## Row counts"; echo; echo '| table | cloud | self-hosted | ok |'; echo '|---|---|---|---|'
      awk '/=== row counts/{f=1;next} /===/{f=0} f' "$A" | while read -r t n; do m=$(awk -v t="$t" '/=== row counts/{f=1;next} /===/{f=0} f&&$1==t{print $2}' "$B"); printf '| %s | %s | %s | %s |\n' "$t" "$n" "${m:-missing}" "$([ "$n" = "$m" ] && echo ✓ || echo ✗)"; done
      echo; echo "## Section sizes (lines)"; echo; echo '| section | cloud | self-hosted |'; echo '|---|---|---|'
      for s in extensions "tables (public) with rls flag" "columns (public)" "constraints (public)" "indexes (public)" "functions (public)" triggers "views (public)" "policies (public)" "table grants (public)" "realtime publication" "vector columns" "migration history"; do
        a=$(awk -v s="=== $s" '$0==s{f=1;next} /^===/{f=0} f' "$A" | wc -l | tr -d ' '); b=$(awk -v s="=== $s" '$0==s{f=1;next} /^===/{f=0} f' "$B" | wc -l | tr -d ' '); printf '| %s | %s | %s |\n' "$s" "$a" "$b"; done
      echo; echo "## DB latency (ms, from the verifying host)"; echo; echo '```'; echo "cloud:"; sed -n '/=== db latency/,$p' "$A" | tail -n +2 | paste -sd' '; echo "self-hosted:"; sed -n '/=== db latency/,$p' "$B" | tail -n +2 | paste -sd' '; echo '```'
      echo; echo "## Structural diff (sequence values and latency excluded)"; echo; echo '```diff'; head -200 "$V/diff-$TS.txt"; [ "$(wc -l < "$V/diff-$TS.txt")" -gt 200 ] && echo "… (truncated; full diff in diff-$TS.txt)"; echo '```'
    } > "$R"
    log "$verdict"; log "report: $R" ;;
  *) die "usage: verify-db.sh --cloud | --selfhosted | --compare [cloud.txt selfhosted.txt]" ;;
esac
