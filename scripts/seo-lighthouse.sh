#!/usr/bin/env bash
# scripts/seo-lighthouse.sh — the SEO Phase 6 performance measurement.
#
#   scripts/seo-lighthouse.sh                                   # production, 3 rounds
#   BASE=http://localhost:3200 OUT=reports/lh-local scripts/seo-lighthouse.sh
#   npx tsx scripts/seo-lighthouse-summary.ts reports/lh         # the table
#
# Lighthouse (mobile, simulated throttling) on one URL per template the
# programme names — home, /books, a record, a subject, a path, a thesis — in
# ROUNDS rounds, STRICTLY one page at a time with a pause between runs:
# production answers 502 under ~6 concurrent requests, and one Lighthouse run
# is one ordinary page load. Lighthouse is a pinned one-off `npx` — nothing is
# added to package.json. Reports land in $OUT as <template>-<round>.json.
#
# Read TBT with care on a busy machine: Lighthouse simulates the network but
# replays the CPU time it OBSERVED, so a loaded laptop inflates blocking time.
# Bytes, the LCP element and CLS do not depend on it. docs/seo/perf-baseline.md.

set -u
BASE=${BASE:-https://library.ptec.edu.kh}
OUT=${OUT:-reports/lh}
ROUNDS=${ROUNDS:-3}
PAUSE=${PAUSE:-8}
LIGHTHOUSE=${LIGHTHOUSE:-lighthouse@13.5.0}

# Template → path. Override any with e.g. BOOK_PATH=/books/<slug>.
NAMES=(home books book subject path thesis)
PATHS=(
  "${HOME_PATH:-/}"
  "${BOOKS_PATH:-/books}"
  "${BOOK_PATH:-/books/introduction-to-qualitative-research-methods-4th-edition}"
  "${SUBJECT_PATH:-/subjects/%E1%9E%82%E1%9E%8E%E1%9E%B7%E1%9E%8F%E1%9E%9C%E1%9E%B7%E1%9E%91%E1%9F%92%E1%9E%99%E1%9E%B6}"
  "${PATH_PATH:-/paths/early-grade-reading}"
  "${THESIS_PATH:-/theses/%E1%9E%82%E1%9E%BB%E1%9E%8E%E1%9E%97%E1%9E%B6%E1%9E%96%E1%9E%93%E1%9F%83%E1%9E%80%E1%9E%B6%E1%9E%9A%E1%9E%94%E1%9E%84%E1%9F%92%E1%9E%9A%E1%9F%80%E1%9E%93-%E1%9E%93%E1%9E%B7%E1%9E%84-%E1%9E%9A%E1%9F%80%E1%9E%93-%E1%9E%9A%E1%9E%94%E1%9E%B6%E1%9E%99%E1%9E%80%E1%9E%B6%E1%9E%9A%E1%9E%8E%E1%9F%8D%E1%9E%9F%E1%9F%92%E1%9E%9A%E1%9E%B6%E1%9E%9C%E1%9E%87%E1%9F%92%E1%9E%9A%E1%9E%B6%E1%9E%9C%E1%9E%94%E1%9F%92%E1%9E%9A%E1%9E%8F%E1%9E%B7%E1%9E%94%E1%9E%8F%E1%9F%92%E1%9E%8F%E1%9E%B7%E1%9E%87%E1%9F%92%E1%9E%9A%E1%9E%BE%E1%9E%9F%E1%9E%9A%E1%9E%BE%E1%9E%9F-%E1%9E%82%E1%9E%9A%E1%9E%BB%E1%9E%93%E1%9E%B7%E1%9E%9F%E1%9F%92%E1%9E%9F%E1%9E%B7%E1%9E%8F%E1%9F%A1%E1%9F%A2-%E1%9F%A4-%E1%9E%87%E1%9F%86%E1%9E%93%E1%9E%B6%E1%9E%93%E1%9F%8B%E1%9E%91%E1%9E%B8%E1%9F%A2-%E1%9E%86%E1%9F%92%E1%9E%93%E1%9E%B6%E1%9F%86%E1%9E%9F%E1%9E%B7%E1%9E%80%E1%9F%92%E1%9E%9F%E1%9E%B6-%E1%9F%A2%E1%9F%A0%E1%9F%A2%E1%9F%A2-%E1%9F%A2%E1%9F%A0%E1%9F%A2%E1%9F%A3}"
)

mkdir -p "$OUT"
echo "Lighthouse ($LIGHTHOUSE, mobile) on $BASE — ${#NAMES[@]} templates × $ROUNDS rounds, sequential → $OUT"
failures=0
for round in $(seq 1 "$ROUNDS"); do
  for i in "${!NAMES[@]}"; do
    name=${NAMES[$i]}
    url="$BASE${PATHS[$i]}"
    if npx -y "$LIGHTHOUSE" "$url" --quiet --output=json --output-path="$OUT/$name-$round.json" \
      --only-categories=performance --max-wait-for-load=60000 \
      --chrome-flags="--headless=new --no-sandbox" >/dev/null 2>"$OUT/$name-$round.err"; then
      echo "  ok   $name round $round"
      rm -f "$OUT/$name-$round.err"
    else
      echo "  FAIL $name round $round (see $OUT/$name-$round.err)"
      failures=$((failures + 1))
      # Two failures is the production 5xx rule: stop rather than keep asking.
      if [ "$failures" -ge 2 ]; then echo "Two failures — stopping."; exit 1; fi
    fi
    sleep "$PAUSE"
  done
done
echo "Done. Summarise: npx tsx scripts/seo-lighthouse-summary.ts $OUT"
