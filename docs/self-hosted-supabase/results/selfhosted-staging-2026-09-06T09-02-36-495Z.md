# Benchmark: selfhosted-staging (2026-09-06T09:02:36.499Z)

app: http://localhost:3100  ·  supabase: http://127.0.0.1:18000  ·  samples: 15

| probe | p50 ms | p95 ms | min | errors |
|---|---|---|---|---|
| supabase.rest | 11 | 22 | 8 | 0 |
| supabase.auth | 8 | 15 | 4 | 0 |
| app.ttfb.home | 2362 | 6057 | 1689 | 0 |
| app.ttfb.books | 1830 | 5863 | 1013 | 0 |
| app.ttfb.theses | 4034 | 15223 | 1573 | 0 |
| app.ttfb.search_q_mathematics | 1763 | 5659 | 850 | 0 |
| app.ttfb.km | 3699 | 21498 | 2319 | 0 |
| app.api.health | 36 | 63 | 30 | 0 |
| app.api.search | 35 | 58 | 27 | 0 |
| app.api.search_km | 29 | 37 | 25 | 0 |
| app.health.db | 55 | 189 | 14 | 0 |
