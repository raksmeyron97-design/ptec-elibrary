# Benchmark comparison — Supabase Cloud production vs. self-hosted STAGING (2026-09-06)

Not like for like, and recorded to prove the tooling, not the benefit: the Cloud column is the live production site measured from a laptop over the Internet; the staging column is `next dev` on that same laptop (pages compile on first request, hence the inflated TTFB) against a Supabase stack on localhost. The only comparison that will count is the one the cutover runbook prescribes: `benchmark.mjs` run FROM THE BOX before and after, with the production image. The `supabase.*` and `app.api.*` rows show what a co-located gateway does to per-request latency; the `app.ttfb.*` rows show a dev server, nothing else.
| probe | cloud-baseline p50/p95 | selfhosted-staging p50/p95 | Δ p50 |
|---|---|---|---|
| supabase.rest | 124 / 340 ms | 11 / 22 ms | −91% |
| supabase.auth | 106 / 233 ms | 8 / 15 ms | −92% |
| app.ttfb.home | 264 / 1310 ms | 2362 / 6057 ms | +795% |
| app.ttfb.books | 293 / 723 ms | 1830 / 5863 ms | +525% |
| app.ttfb.theses | 302 / 415 ms | 4034 / 15223 ms | +1236% |
| app.ttfb.search_q_mathematics | 249 / 675 ms | 1763 / 5659 ms | +608% |
| app.ttfb.km | 252 / 3941 ms | 3699 / 21498 ms | +1368% |
| app.api.health | 415 / 743 ms | 36 / 63 ms | −91% |
| app.api.search | 186 / 278 ms | 35 / 58 ms | −81% |
| app.api.search_km | 182 / 203 ms | 29 / 37 ms | −84% |
