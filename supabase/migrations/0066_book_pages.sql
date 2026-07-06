-- 0066_book_pages.sql
-- Full-text PDF search: per-page text extracted from book/thesis PDFs by
-- scripts/extract-pdf-text.ts, searched by /api/search/native as "found
-- inside" page hits. Trigram is the primary index — it works on Khmer
-- codepoints (no word segmentation), same reasoning as 0059_fuzzy_search.
-- Scanned PDFs with no text layer simply have no rows here (not indexed).

create table public.book_pages (
  id          uuid    primary key default gen_random_uuid(),
  record_type text    not null check (record_type in ('book', 'research')),
  record_id   uuid    not null,
  page_no     integer not null,
  content     text    not null,
  extracted_at timestamptz not null default now(),
  unique (record_type, record_id, page_no)
);

create index book_pages_content_trgm_idx
  on public.book_pages using gin (content gin_trgm_ops);
create index book_pages_record_idx
  on public.book_pages (record_type, record_id);

-- Only ever read/written via the service-role client from server code
-- (search route + extraction script) — same posture as search_queries.
alter table public.book_pages enable row level security;
