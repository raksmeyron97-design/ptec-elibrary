#!/usr/bin/env bash
# Phase 0.3 live checks (docs/seo/AUDIT-VERIFICATION.md).
#
# The commands from the SEO master prompt §7, made safe for this origin:
# every request is sequential with a pause between them, because production
# answered 502 under ~6 concurrent requests on 2026-09-24. Read-only (GET/HEAD).
#
#   BASE=https://library.ptec.edu.kh bash scripts/seo-live-checks.sh > out.txt
set -u
BASE="${BASE:-https://library.ptec.edu.kh}"
PAUSE="${PAUSE:-0.5}"
HDR="$(mktemp)"
trap 'rm -f "$HDR"' EXIT

# React can split numbers with <!-- --> comments, so strip them before matching totals.
total() { sed 's/<!-- -->//g' | grep -oE '(of|នៃ) [0-9,០-៩]+' | head -1; }
footer() { sed 's/<!-- -->//g' | grep -oE 'Help and Information|Visit PTEC|Get help' | sort -u | tr '\n' ',' ; }

echo "# seo-live-checks  base=$BASE  started=$(date -u +%FT%TZ)"

echo; echo "## F1: 20 sequential requests per UA to /books (total | footer marker | cache headers)"
for ua in "Mozilla/5.0" "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"; do
  echo "== UA: $ua"
  for i in $(seq 1 20); do
    body=$(curl -s -D "$HDR" -A "$ua" -w '\n__STATUS__%{http_code}' "$BASE/books")
    st=$(printf '%s' "$body" | tail -1 | sed 's/__STATUS__//')
    t=$(printf '%s' "$body" | total)
    f=$(printf '%s' "$body" | footer)
    h=$(grep -iE '^(cf-ray|age|cf-cache-status|x-nextjs-cache|cache-control|x-nextjs-prerender|x-nextjs-stale-time):' "$HDR" | tr -d '\r' | tr '\n' ' ')
    echo "$i status=$st total=[$t] footer=[$f] | $h"
    sleep "$PAUSE"
  done
done

echo; echo "## F1: cache headers and totals for the three versions of the book list"
for u in "/books" "/books?page=1" "/km/books" "/km/books?page=1"; do
  echo "== $u"
  curl -sI "$BASE$u" | grep -iE '^(HTTP|cache-control|age|cf-cache-status|x-nextjs-cache|x-vercel-cache|last-modified|etag|date|vary|x-robots-tag):' | tr -d '\r'
  sleep "$PAUSE"
  echo "total: $(curl -s "$BASE$u" | total)"
  sleep "$PAUSE"
done

echo; echo "## F6: sitemap size, sections and lastmod values"
SM="$(curl -s "$BASE/sitemap.xml")"
echo "bytes: $(printf '%s' "$SM" | wc -c | tr -d ' ')"
echo "root element: $(printf '%s' "$SM" | grep -oE '<(urlset|sitemapindex)' | head -1)"
echo "<loc> count: $(printf '%s' "$SM" | grep -o '<loc>' | wc -l | tr -d ' ')"
printf '%s' "$SM" | grep -oE '<loc>[^<]+' | sed -E 's#<loc>https?://[^/]+/?##' \
  | awk -F/ '{ s = ($1 == "km" ? "km/" $2 : $1); sub(/\?.*/, "", s); print (s == "" ? "(home)" : s) }' | sort | uniq -c | sort -rn
echo "-- top lastmod values"
printf '%s' "$SM" | grep -oE '<lastmod>[^<]+' | sort | uniq -c | sort -rn | head -8
echo "-- hreflang values in sitemap"
printf '%s' "$SM" | grep -oE 'hreflang="[^"]+"' | sort | uniq -c
echo "-- raw (non-ASCII) <loc> count: $(printf '%s' "$SM" | grep -oE '<loc>[^<]+' | LC_ALL=C grep -c '[^ -~]')"
echo "-- percent-encoded <loc> count: $(printf '%s' "$SM" | grep -oE '<loc>[^<]+' | grep -c '%E1%')"
sleep "$PAUSE"

echo; echo "## F2, F5, F10: H1 count, html lang, hreflang and JSON-LD per template"
# React writes the attribute as hrefLang, so the hreflang grep is case-insensitive;
# JSON-LD is counted as <script> tags, since the bare string also appears in the
# hydration payload. The master prompt's §7 versions of both undercount/overcount.
for u in / /km /books /km/books /subjects /authors /theses /theses/summary /posts /journals /paths /paths/early-grade-reading \
         /books/introduction-to-qualitative-research-methods-4th-edition /km/books/introduction-to-qualitative-research-methods-4th-edition \
         /books/%E1%9E%9A%E1%9E%9B%E1%9E%80 /subjects/%E1%9E%82%E1%9E%8E%E1%9E%B7%E1%9E%8F%E1%9E%9C%E1%9E%B7%E1%9E%91%E1%9F%92%E1%9E%99%E1%9E%B6 \
         /authors/a-michael-huberman /catalogs/teacher-noticing-bridging-and-broadening-perspectives-contexts-and-frameworks-schack-edna-o \
         /journals/articles/handmade-conductivity-measurement-device-thin-film-semiconductor-polypyrrole; do
  html=$(curl -s "$BASE$u")
  printf '%-70s h1=%s %s hreflang=[%s] ldjson=%s\n' "$u" \
    "$(grep -o '<h1' <<<"$html" | wc -l | tr -d ' ')" \
    "$(grep -oE '<html[^>]*lang="[^"]*"' <<<"$html" | grep -oE 'lang="[^"]*"')" \
    "$(grep -oiE 'hreflang="[^"]*"' <<<"$html" | sort -u | tr '\n' ' ')" \
    "$(grep -o '<script type="application/ld+json"' <<<"$html" | wc -l | tr -d ' ')"
  sleep "$PAUSE"
done

echo; echo "## F4: where citation_pdf_url points, and what robots.txt says about /api"
curl -s "$BASE/journals/articles/handmade-conductivity-measurement-device-thin-film-semiconductor-polypyrrole" \
  | grep -oE '<meta[^>]+citation_pdf_url[^>]*>'
sleep "$PAUSE"
curl -s "$BASE/robots.txt" | grep -n '/api'
sleep "$PAUSE"

echo; echo "## Protect: missing slugs must stay real 404s"
for u in /books/this-page-should-not-exist-xyz-12345 /km/books/this-page-should-not-exist-xyz-12345 /subjects/no-such-subject-xyz /authors/no-such-author-xyz-12345; do
  printf '%-60s %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE$u")"
  sleep "$PAUSE"
done
echo; echo "# finished=$(date -u +%FT%TZ)"
