# PostgreSQL tuning (2 GB slice of an 8 GB host)

Values are passed as `-c` flags in `docker-compose.yml` so the image's own
`postgresql.conf` (with `shared_preload_libraries` for the Supabase
extensions) is untouched. Override any of them in `.env`.

| Setting | Value | Why |
|---|---|---|
| `shared_buffers` | 512MB | 25% of the container's 2 GB limit; the classic starting point |
| `effective_cache_size` | 1536MB | planner hint = limit − shared_buffers; the OS page cache does the rest |
| `work_mem` | 8MB | per-sort/hash; `max_connections` × a few sorts must stay well under the limit |
| `maintenance_work_mem` | 128MB | HNSW/GIN index builds during restore and backfills |
| `max_connections` | 100 | PostgREST pool (10) + GoTrue + Realtime + Studio + headroom |
| `random_page_cost` | 1.1 | SSD |
| `wal_compression` | on | smaller WAL on a small disk |
| `checkpoint_completion_target` | 0.9 | spread checkpoint I/O |
| `max_wal_size` | 1GB | fewer forced checkpoints during bulk restore |
| `log_min_duration_statement` | 500 ms | slow-query visibility without log spam |

Do not over-optimise before measuring: `docker stats supabase-db`,
`select * from pg_stat_statements order by total_exec_time desc limit 20`, and
the p95s from `scripts/migration/benchmark.mjs` are the inputs to the next
change, not intuition.

pgvector HNSW indexes are memory-hungry at build time (`maintenance_work_mem`)
and at query time they want to sit in `shared_buffers`. The five indexes in
this schema are small (a few thousand 768-dim vectors); 512 MB is ample.
