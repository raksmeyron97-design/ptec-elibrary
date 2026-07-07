-- ============================================================================
-- 00000000000000_initial_schema.sql
--
-- SQUASHED MIGRATION — consolidated final state of migrations 0001–0052.
-- The original files are preserved in supabase/migrations/_archive/ for
-- reference. Migrations 0053+ continue to apply on top of this file.
--
-- Notes on how this file was assembled:
--   • Objects that were CREATE OR REPLACE'd across multiple migrations appear
--     once, in their final form (e.g. is_admin() from 0040, match_library
--     from 0029, prevent_role_update() from 0040).
--   • Policies that were dropped and recreated appear only in their final
--     form (e.g. the 0019 security-hardening pass, the 0040 role expansion).
--   • Data backfills that only made sense against live data (0009 department
--     backfill, 0010/0020 column backfills) are omitted; genuine seed data
--     (0015 cohorts, 0038 team sections, 0041/0052 role permissions) is kept.
--   • SCHEMA DRIFT: the `user_role` enum and several `catalog_books` columns
--     (slug, cover_url, cover_color, year, language, category, department,
--     shelf_location, accession_number, copies_total, copies_available,
--     is_active, updated_at) were originally created via the Supabase
--     dashboard, never by a migration — but later migrations and functions
--     (0024 get_home_stats, 0029 match_library, 0039 enum values, 0041
--     role_permissions) depend on them. They are defined here explicitly so
--     this file applies cleanly on a fresh database.
--   • The redundant unnamed ivfflat index from 0051 (duplicate of the HNSW
--     books_embedding_idx from 0029 on the same column) is intentionally
--     not recreated.
-- ============================================================================


-- ============================================================
-- EXTENSIONS
-- ============================================================

-- Trigram matching for search. Highly effective for Khmer text where spaces
-- are not used between words, making standard to_tsvector FTS less effective
-- without specialized parsers. (0007)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- pgvector for semantic search embeddings (gemini-embedding-001, 768 dims). (0029/0051)
CREATE EXTENSION IF NOT EXISTS vector;


-- ============================================================
-- TYPES
-- ============================================================

-- Five-role system (matches lib/types/roles.ts). The enum originally existed
-- only in the hosted DB (dashboard-created); 0039 extended it with
-- staff/librarian/super_admin. Guarded so re-running is safe.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE public.user_role AS ENUM
      ('reader', 'staff', 'librarian', 'admin', 'super_admin');
  END IF;
END;
$$;


-- ============================================================
-- TABLES
-- ============================================================

-- ── profiles (0001; role default 'reader' per 0019; is_super_admin per 0022) ──
CREATE TABLE public.profiles (
  id             uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email          text,
  full_name      text,
  avatar_url     text,
  role           text DEFAULT 'reader',
  -- Super admins can promote/demote users without password confirmation. (0022)
  is_super_admin boolean NOT NULL DEFAULT false
);

-- ── authors (0001) ────────────────────────────────────────────────────────────
CREATE TABLE public.authors (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text UNIQUE NOT NULL,
  bio        text,
  created_at timestamptz DEFAULT timezone('utc'::text, now())
);

-- ── categories (0001) ─────────────────────────────────────────────────────────
CREATE TABLE public.categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text UNIQUE NOT NULL,
  slug       text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT timezone('utc'::text, now())
);

-- ── departments (0009) ────────────────────────────────────────────────────────
CREATE TABLE public.departments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text UNIQUE NOT NULL,
  slug       text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT timezone('utc'::text, now())
);

-- ── books (0001; department_id per 0009; embedding per 0029) ──────────────────
-- books.department (text) is kept for backward compatibility during the
-- departments-table transition (0009) and is still read as a fallback.
CREATE TABLE public.books (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title          text NOT NULL,
  slug           text UNIQUE NOT NULL,
  description    text,
  author_id      uuid REFERENCES public.authors(id),
  category_id    uuid REFERENCES public.categories(id),
  department     text,
  department_id  uuid REFERENCES public.departments(id),
  isbn           text,
  language       text,
  published_at   date,
  is_published   boolean DEFAULT false,
  rating         numeric DEFAULT 5,
  pages          integer DEFAULT 1,
  cover_color    text,
  cover_url      text,
  download_count integer DEFAULT 0,
  view_count     integer DEFAULT 0,
  tags           text[],
  created_at     timestamptz DEFAULT timezone('utc'::text, now()),
  embedding      vector(768)
);

-- ── book_files (0001) ─────────────────────────────────────────────────────────
CREATE TABLE public.book_files (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id        uuid REFERENCES public.books(id) ON DELETE CASCADE,
  format         text NOT NULL,
  file_url       text,
  file_size_kb   integer,
  download_count integer DEFAULT 0,
  created_at     timestamptz DEFAULT timezone('utc'::text, now())
);

-- ── download_logs (0001) ──────────────────────────────────────────────────────
CREATE TABLE public.download_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  book_id       uuid REFERENCES public.books(id) ON DELETE CASCADE,
  downloaded_at timestamptz DEFAULT timezone('utc'::text, now())
);

-- ── posts (0001; engagement counters per 0033; extended per 0034; tags per 0035) ──
CREATE TABLE public.posts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  slug          text UNIQUE NOT NULL,
  content       text,
  cover_image   text,
  is_published  boolean DEFAULT false,
  created_at    timestamptz DEFAULT timezone('utc'::text, now()),
  -- Denormalized counters kept in sync by triggers; never written by
  -- application code directly. (0033)
  like_count    integer NOT NULL DEFAULT 0,
  save_count    integer NOT NULL DEFAULT 0,
  comment_count integer NOT NULL DEFAULT 0,
  -- Extended columns the application expects. (0034)
  author_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  category      text NOT NULL DEFAULT 'Other',
  excerpt       text,
  cover_url     text,
  cover_urls    text[] NOT NULL DEFAULT '{}',
  views         integer NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  tags          text[] NOT NULL DEFAULT '{}'  -- (0035)
);

-- ── saved_books (0001) ────────────────────────────────────────────────────────
CREATE TABLE public.saved_books (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  book_id    uuid REFERENCES public.books(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, book_id)
);

-- ── reviews (0001) ────────────────────────────────────────────────────────────
CREATE TABLE public.reviews (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  book_id    uuid REFERENCES public.books(id) ON DELETE CASCADE,
  rating     integer CHECK (rating >= 1 AND rating <= 5),
  content    text,
  created_at timestamptz DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, book_id)
);

-- ── reading_progress (0001; max_progress_pct per 0010) ────────────────────────
CREATE TABLE public.reading_progress (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  book_id          uuid REFERENCES public.books(id) ON DELETE CASCADE,
  progress_pct     integer DEFAULT 0,
  max_progress_pct numeric(5,2) DEFAULT 0,
  last_read_at     timestamptz DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, book_id)
);

-- ── catalog_books (0001 + dashboard drift + keywords 0018 + embedding 0029) ───
-- Physical library catalogue. Most columns beyond the 0001 base were added via
-- the Supabase dashboard (see SCHEMA DRIFT header note) and are required by
-- lib/catalog.ts, get_home_stats(), and match_library().
CREATE TABLE public.catalog_books (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text NOT NULL,
  slug             text UNIQUE NOT NULL,
  author           text,
  isbn             text,
  description      text,
  cover_url        text,
  cover_color      text,
  year             integer,
  language         text,
  category         text,
  department       text,
  shelf_location   text,
  accession_number text,
  copies_total     integer NOT NULL DEFAULT 0,
  copies_available integer NOT NULL DEFAULT 0,
  is_active        boolean NOT NULL DEFAULT true,
  keywords         text[] NOT NULL DEFAULT '{}',  -- (0018)
  embedding        vector(768),                    -- (0029)
  created_at       timestamptz DEFAULT timezone('utc'::text, now()),
  updated_at       timestamptz DEFAULT timezone('utc'::text, now())
);

-- ── catalog_copies (0001) ─────────────────────────────────────────────────────
CREATE TABLE public.catalog_copies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_book_id uuid REFERENCES public.catalog_books(id) ON DELETE CASCADE,
  status          text DEFAULT 'available',
  created_at      timestamptz DEFAULT timezone('utc'::text, now())
);

-- ── contact_rate_limit (0005) ─────────────────────────────────────────────────
-- Service-role only; RLS enabled with no policies (0019).
CREATE TABLE public.contact_rate_limit (
  ip         text PRIMARY KEY,
  history    bigint[] DEFAULT '{}',
  created_at timestamptz DEFAULT timezone('utc'::text, now())
);

-- ── admin_audit_log (0003) ────────────────────────────────────────────────────
CREATE TABLE public.admin_audit_log (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  admin_id     uuid NOT NULL,
  action       text NOT NULL,
  target_table text NOT NULL,
  target_id    uuid,
  metadata     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id),
  CONSTRAINT admin_audit_log_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.profiles(id)
);

-- ── view_logs (0019) ──────────────────────────────────────────────────────────
CREATE TABLE public.view_logs (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  content_type text NOT NULL,   -- 'book' | 'post' | 'research_report'
  content_id   uuid NOT NULL,
  user_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  viewed_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT view_logs_pkey PRIMARY KEY (id)
);

-- ── catalog_copies_log (0019) ─────────────────────────────────────────────────
-- Append-only: no UPDATE or DELETE policy for anyone (even admins cannot
-- rewrite history).
CREATE TABLE public.catalog_copies_log (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  catalog_book_id uuid NOT NULL REFERENCES public.catalog_books(id) ON DELETE CASCADE,
  admin_id        uuid NOT NULL REFERENCES public.profiles(id),
  action          text NOT NULL,   -- 'add' | 'remove'
  delta           integer NOT NULL,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_copies_log_pkey PRIMARY KEY (id)
);

-- ── research_reports (0011; program/faculty 0014; subject 0016; keywords 0017;
--    extended fields 0026; embedding 0029) ─────────────────────────────────────
-- NOTE: "theses" in the UI — the table keeps its legacy name.
CREATE TABLE public.research_reports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title          text NOT NULL,
  abstract       text NOT NULL,
  department_id  uuid REFERENCES public.departments(id),
  cohort         text,
  academic_year  text,
  author_names   text,
  advisor_name   text,
  cover_url      text,
  file_url       text,
  file_size_kb   integer,
  is_published   boolean DEFAULT false,
  view_count     integer DEFAULT 0,
  download_count integer DEFAULT 0,
  created_at     timestamptz DEFAULT timezone('utc'::text, now()),
  program        text CHECK (program IS NULL OR program IN ('b_ed_12_4', 'bachelor_plus_1')),  -- (0014)
  faculty        text,                            -- (0014)
  subject        text,                            -- (0016)
  keywords       text[] NOT NULL DEFAULT '{}',    -- (0017)
  doi            text,                            -- (0026)
  published_at   timestamptz,                     -- (0026)
  "references"   text,                            -- (0026)
  embedding      vector(768)                      -- (0029)
);

COMMENT ON COLUMN public.research_reports.program IS 'Program code: b_ed_12_4 (Bachelor of Education 12+4) or bachelor_plus_1 (Bachelor+1). NULL for legacy rows.';
COMMENT ON COLUMN public.research_reports.faculty IS 'Faculty/major code (e.g. primary, lower_secondary). Only applicable when program = b_ed_12_4. NULL otherwise.';
COMMENT ON COLUMN public.research_reports.subject IS 'Subject code (e.g. math, physics). Populated only when faculty = lower_secondary. NULL for other faculties and programs.';

-- ── research_cohorts / research_academic_years (0015) ─────────────────────────
-- DB-backed dropdown options. research_reports.cohort and .academic_year
-- remain text (no FK) — these tables supply the dropdown options only,
-- mirroring how departments / categories work for books.
CREATE TABLE public.research_cohorts (
  id           uuid        NOT NULL DEFAULT gen_random_uuid(),
  program_code text        NOT NULL CHECK (program_code IN ('b_ed_12_4', 'bachelor_plus_1')),
  number       integer     NOT NULL,
  label        text,          -- optional display override; falls back to number if null
  sort_order   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT research_cohorts_pkey   PRIMARY KEY (id),
  CONSTRAINT research_cohorts_unique UNIQUE (program_code, number)
);

CREATE TABLE public.research_academic_years (
  id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  cohort_id  uuid        NOT NULL REFERENCES public.research_cohorts(id) ON DELETE CASCADE,
  label      text        NOT NULL,  -- e.g. "2022-2023"
  sort_order integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT research_academic_years_pkey   PRIMARY KEY (id),
  CONSTRAINT research_academic_years_unique UNIQUE (cohort_id, label)
);

-- ── notifications / notification_reads (0021) ─────────────────────────────────
CREATE TABLE public.notifications (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  type        text        NOT NULL,  -- 'new_user' | 'new_book' | 'new_report' | 'announcement'
  title_en    text        NOT NULL,
  title_km    text,
  body_en     text,
  body_km     text,
  link        text,                  -- optional relative URL e.g. "/admin/users"
  target_role text,                  -- 'admin' = admin-only | NULL = all authenticated users
  created_at  timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT notifications_pkey PRIMARY KEY (id)
);

CREATE TABLE public.notification_reads (
  notification_id uuid        NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES public.profiles(id)      ON DELETE CASCADE,
  read_at         timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT notification_reads_pkey PRIMARY KEY (notification_id, user_id)
);

-- ── ai_usage (0023; FK dropped per 0025) ──────────────────────────────────────
-- Per-user daily AI usage quota. "Day" is defined in Asia/Phnom_Penh (UTC+7).
-- user_id has NO FK constraint because the global circuit-breaker uses a
-- sentinel UUID (00000000-0000-0000-0000-000000000000) that is not a real
-- auth.users row. Access is restricted to the service role via RLS + RPC.
CREATE TABLE public.ai_usage (
  user_id    uuid not null,
  used_on    date not null,
  count      int  not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, used_on)
);

-- ── rate_limit (0031) ─────────────────────────────────────────────────────────
-- Generic sliding-window rate limit table backed by Postgres. Replaces the
-- in-memory store in lib/rate-limit.ts so state persists across serverless
-- cold starts and multiple instances. Service-role only.
CREATE TABLE public.rate_limit (
  key        text        primary key,
  history    bigint[]    not null default '{}',
  updated_at timestamptz not null default now()
);

-- ── post_likes / post_saves / post_comments (0033; is_edited per 0037) ────────
-- One row per (post, user) pair. Composite PK prevents duplicate likes/saves.
CREATE TABLE public.post_likes (
  post_id    uuid        NOT NULL REFERENCES public.posts(id)    ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_likes_pkey PRIMARY KEY (post_id, user_id)
);

CREATE TABLE public.post_saves (
  post_id    uuid        NOT NULL REFERENCES public.posts(id)    ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_saves_pkey PRIMARY KEY (post_id, user_id)
);

-- Supports one level of threading via parent_id. is_deleted is a soft-delete
-- flag used by admins to remove inappropriate content without losing audit
-- history; deleted rows are filtered from SELECT.
CREATE TABLE public.post_comments (
  id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  post_id    uuid        NOT NULL REFERENCES public.posts(id)         ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES public.profiles(id)      ON DELETE CASCADE,
  parent_id  uuid                 REFERENCES public.post_comments(id) ON DELETE CASCADE,
  body       text        NOT NULL,
  is_deleted boolean     NOT NULL DEFAULT false,
  is_edited  boolean     DEFAULT false,   -- (0037) tracks author edits
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_comments_pkey      PRIMARY KEY (id),
  CONSTRAINT post_comments_body_len  CHECK (char_length(body) BETWEEN 1 AND 2000),
  CONSTRAINT post_comments_no_self   CHECK (id <> parent_id)
);

-- ── comment_likes (0036) ──────────────────────────────────────────────────────
-- One row per (user, comment) pair. Deleting the row = unlike.
CREATE TABLE public.comment_likes (
  comment_id  uuid        NOT NULL REFERENCES public.post_comments(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id)           ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

-- ── team_sections / team_members (0038) ───────────────────────────────────────
-- team_sections — organisational groups; team_members — individual staff;
-- email comes from profiles via user_id so no standalone email column.
CREATE TABLE public.team_sections (
  id             uuid primary key default gen_random_uuid(),
  name_km        text not null,
  name_en        text not null,
  description_km text,
  description_en text,
  display_order  integer not null default 0,
  created_at     timestamptz not null default now()
);

CREATE TABLE public.team_members (
  id               uuid primary key default gen_random_uuid(),
  -- Link to auth account (email is read from profiles.email at query time)
  user_id          uuid references public.profiles(id) on delete set null,
  section_id       uuid references public.team_sections(id) on delete set null,
  name_km          text not null,
  name_en          text not null,
  position_km      text,
  position_en      text,
  education        text,
  years_experience text,
  phone            text,
  bio_km           text,
  bio_en           text,
  photo_url        text,   -- profile photo in R2 public bucket
  display_order    integer not null default 0,
  is_published     boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── role_permissions (0041) ───────────────────────────────────────────────────
-- Persistent permission matrix for each role × resource combination.
-- Super admins edit via /admin/roles. Values are display/audit; server-side
-- guards (requireAdmin etc.) use the role hierarchy as the enforcement layer.
CREATE TABLE public.role_permissions (
  role        user_role   NOT NULL,
  resource    text        NOT NULL,
  level       text        NOT NULL DEFAULT 'none'
                          CHECK (level IN ('none', 'read', 'write')),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (role, resource)
);

-- ── book_requests (0042) ──────────────────────────────────────────────────────
-- Users can request books not yet in the library.
CREATE TABLE public.book_requests (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  title       text        NOT NULL,
  author      text,
  isbn        text,
  reason      text,
  status      text        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved', 'rejected', 'added')),
  admin_note  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── reading_lists / reading_list_books (0043) ─────────────────────────────────
-- Named reading lists: users can organise saved books into named collections.
CREATE TABLE public.reading_lists (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  description text,
  is_public   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.reading_list_books (
  id       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id  uuid        NOT NULL REFERENCES public.reading_lists(id) ON DELETE CASCADE,
  book_id  uuid        NOT NULL REFERENCES public.books(id)         ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (list_id, book_id)
);

-- ── push_subscriptions (0044) ─────────────────────────────────────────────────
CREATE TABLE public.push_subscriptions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   text        NOT NULL UNIQUE,
  p256dh     text        NOT NULL,
  auth_key   text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── book_notes (0046) ─────────────────────────────────────────────────────────
-- Personal notes: one text note per user per book.
CREATE TABLE public.book_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  book_id    uuid not null references public.books(id) on delete cascade,
  content    text not null default '',
  updated_at timestamptz default now(),
  unique(user_id, book_id)
);

-- ── book_annotations (0047) ───────────────────────────────────────────────────
-- Per-page text annotations: selected text + optional note + highlight color.
CREATE TABLE public.book_annotations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  book_id         uuid not null references public.books(id) on delete cascade,
  page_number     integer not null,
  selected_text   text not null,
  note_content    text default '',
  highlight_color text default 'yellow'
    check (highlight_color in ('yellow', 'green', 'blue', 'pink')),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── content_subscriptions (0048) ──────────────────────────────────────────────
-- Users subscribe to departments or categories to receive alerts when new
-- books are added matching their interests.
-- (0054 later extends the filter_type CHECK with 'publications'.)
CREATE TABLE public.content_subscriptions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  filter_type   text        NOT NULL CHECK (filter_type IN ('department', 'category')),
  filter_value  text        NOT NULL,
  display_label text,
  created_at    timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, filter_type, filter_value)
);

-- ── publications suite (0052) ─────────────────────────────────────────────────
-- Academic journal articles. The person table is `publication_authors` (NOT
-- `authors`, which already exists for books with a different shape); the
-- ordered M:N join is `publication_authorships`.
CREATE TABLE public.publication_authors (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name    text        NOT NULL,
  full_name_km text,
  orcid        text,
  email        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.publication_affiliations (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  name_km    text,
  city       text,
  country    text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.publications (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text        UNIQUE NOT NULL,
  title            text        NOT NULL,
  title_km         text,
  article_type     text        NOT NULL DEFAULT 'article'
                               CHECK (article_type IN ('article', 'review', 'account', 'editorial')),
  journal_name     text,
  volume           text,
  issue_no         text,
  page_start       text,
  page_end         text,
  article_no       text,
  doi              text,
  publication_date date,
  abstract         text,
  abstract_km      text,
  keywords         text[]      NOT NULL DEFAULT '{}',
  license          text,
  copyright        text,
  language         text        NOT NULL DEFAULT 'en',
  cover_url        text,       -- graphical/TOC abstract image (Zima CDN URL)
  pdf_url          text,
  "references"     jsonb       NOT NULL DEFAULT '[]'::jsonb,  -- [{ index, text, doi?, url? }]
  is_published     boolean     NOT NULL DEFAULT false,
  published_at     timestamptz,
  view_count       integer     NOT NULL DEFAULT 0,
  download_count   integer     NOT NULL DEFAULT 0,
  embedding        vector(768),
  created_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.publication_authorships (
  publication_id   uuid    NOT NULL REFERENCES public.publications(id) ON DELETE CASCADE,
  author_id        uuid    NOT NULL REFERENCES public.publication_authors(id) ON DELETE CASCADE,
  author_order     integer NOT NULL DEFAULT 1,
  is_corresponding boolean NOT NULL DEFAULT false,
  affiliation_ids  uuid[]  NOT NULL DEFAULT '{}',
  PRIMARY KEY (publication_id, author_id)
);

CREATE TABLE public.publication_files (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid    NOT NULL REFERENCES public.publications(id) ON DELETE CASCADE,
  label          text    NOT NULL,
  file_url       text    NOT NULL,
  file_type      text,
  size_bytes     bigint,
  sort_order     integer NOT NULL DEFAULT 0
);


-- ============================================================
-- INDEXES
-- ============================================================

-- Trigram search on books (0007) and authors (0049)
CREATE INDEX books_title_trgm_idx       ON public.books   USING GIN (title gin_trgm_ops);
CREATE INDEX books_description_trgm_idx ON public.books   USING GIN (description gin_trgm_ops);
CREATE INDEX authors_name_trgm_idx      ON public.authors USING GIN (name gin_trgm_ops);

-- Keyword arrays (0017, 0018)
CREATE INDEX idx_research_reports_keywords ON public.research_reports USING GIN (keywords);
CREATE INDEX idx_catalog_books_keywords    ON public.catalog_books    USING GIN (keywords);

-- Notifications (0021)
CREATE INDEX idx_notifications_target_role_created ON public.notifications (target_role, created_at DESC);
CREATE INDEX idx_notification_reads_user           ON public.notification_reads (user_id);

-- Sitemap / listing covering indexes (0027)
CREATE INDEX idx_books_published_created ON public.books (is_published, created_at DESC);
CREATE INDEX idx_book_files_format_book  ON public.book_files (format, book_id);

-- pgvector ANN indexes — HNSW, cosine (0029, 0052). Build is fine on empty
-- columns; they populate as rows get embedded.
CREATE INDEX books_embedding_idx        ON public.books            USING hnsw (embedding vector_cosine_ops);
CREATE INDEX research_embedding_idx     ON public.research_reports USING hnsw (embedding vector_cosine_ops);
CREATE INDEX catalog_embedding_idx      ON public.catalog_books    USING hnsw (embedding vector_cosine_ops);
CREATE INDEX publications_embedding_idx ON public.publications     USING hnsw (embedding vector_cosine_ops);

-- Post interactions (0033)
CREATE INDEX idx_post_likes_post_id    ON public.post_likes (post_id);
CREATE INDEX idx_post_saves_post_id    ON public.post_saves (post_id);
CREATE INDEX idx_post_comments_post_id ON public.post_comments (post_id, created_at);
CREATE INDEX idx_post_comments_parent  ON public.post_comments (parent_id) WHERE parent_id IS NOT NULL;

-- Posts listing (0034, 0035)
CREATE INDEX idx_posts_author_id ON public.posts (author_id);
CREATE INDEX idx_posts_category  ON public.posts (category) WHERE is_published = true;
CREATE INDEX idx_posts_tags      ON public.posts USING gin(tags) WHERE is_published = true;

-- Comment likes (0036)
CREATE INDEX idx_comment_likes_comment_id ON public.comment_likes(comment_id);
CREATE INDEX idx_comment_likes_user_id    ON public.comment_likes(user_id);

-- Role lookups (0040)
CREATE INDEX idx_profiles_role ON public.profiles (role);

-- Annotations (0047)
CREATE INDEX book_annotations_book_page ON public.book_annotations(book_id, page_number);

-- Content subscriptions (0048)
CREATE INDEX idx_content_subs_user ON public.content_subscriptions(user_id);

-- Books listing/search/detail query paths (0049).
-- Postgres does NOT auto-index FK columns; every listing query embeds
-- authors/categories/departments and aggregates reviews per book.
CREATE INDEX idx_books_author_id     ON public.books (author_id);
CREATE INDEX idx_books_category_id   ON public.books (category_id);
CREATE INDEX idx_books_department_id ON public.books (department_id);
CREATE INDEX idx_book_files_book_id  ON public.book_files (book_id);
CREATE INDEX idx_reviews_book_id     ON public.reviews (book_id);

-- Sort-path indexes for the /books listing (0049). Partial (WHERE is_published)
-- keeps them small; `id DESC` is the keyset-pagination tie-breaker.
CREATE INDEX idx_books_pub_published_at ON public.books (published_at DESC NULLS LAST, id DESC) WHERE is_published = true;
CREATE INDEX idx_books_pub_downloads    ON public.books (download_count DESC NULLS LAST, id DESC) WHERE is_published = true;
CREATE INDEX idx_books_pub_rating       ON public.books (rating DESC NULLS LAST, id DESC) WHERE is_published = true;
CREATE INDEX idx_books_pub_title        ON public.books (title, id DESC) WHERE is_published = true;

-- Physical-catalog search & sort (0050 — note: names say "books" but these
-- target catalog_books; kept as-is to match the deployed schema).
CREATE INDEX idx_books_title      ON public.catalog_books USING gin (to_tsvector('simple', title));
CREATE INDEX idx_books_author     ON public.catalog_books (author);
CREATE INDEX idx_books_category   ON public.catalog_books (category);
CREATE INDEX idx_books_created_at ON public.catalog_books (created_at DESC);

-- Publications (0052)
CREATE INDEX idx_publications_published_created  ON public.publications (is_published, created_at DESC);
CREATE INDEX idx_publications_publication_date   ON public.publications (publication_date DESC);
CREATE INDEX idx_publications_keywords           ON public.publications USING gin (keywords);
CREATE INDEX idx_publication_authorships_author  ON public.publication_authorships (author_id);
CREATE INDEX idx_publication_files_publication   ON public.publication_files (publication_id, sort_order);


-- ============================================================
-- VIEWS
-- ============================================================

-- books_with_stats (0027): pre-aggregated review_count and avg_rating so the
-- listing page avoids pulling every review row. security_invoker = true means
-- the view runs with the calling user's privileges and respects RLS on the
-- underlying books and reviews tables.
-- Columns are listed explicitly (not b.*) because the deployed view was
-- created before books.embedding existed — the 768-dim vector must NOT be
-- exposed through the listing view.
CREATE VIEW public.books_with_stats
WITH (security_invoker = true)
AS
SELECT
  b.id, b.title, b.slug, b.description, b.author_id, b.category_id,
  b.department, b.isbn, b.language, b.published_at, b.is_published,
  b.rating, b.pages, b.cover_color, b.cover_url, b.download_count,
  b.view_count, b.tags, b.created_at, b.department_id,
  COALESCE(r.review_count, 0)::int AS review_count,
  r.avg_rating
FROM public.books b
LEFT JOIN (
  SELECT
    book_id,
    COUNT(*)::int AS review_count,
    AVG(rating)   AS avg_rating
  FROM public.reviews
  GROUP BY book_id
) r ON r.book_id = b.id;

-- team_members_with_email (0038, security_invoker fixed in 0045): members with
-- section name + profile email.
CREATE VIEW public.team_members_with_email
  WITH (security_invoker = true)
AS
  SELECT
    tm.*,
    p.email          AS user_email,
    p.full_name      AS user_full_name,
    ts.name_km       AS section_name_km,
    ts.name_en       AS section_name_en,
    ts.display_order AS section_order
  FROM public.team_members tm
  LEFT JOIN public.profiles      p  ON p.id  = tm.user_id
  LEFT JOIN public.team_sections ts ON ts.id = tm.section_id;

-- publications_with_stats (0052): article rows + aggregated author byline.
CREATE VIEW public.publications_with_stats
WITH (security_invoker = true)
AS
SELECT
  p.*,
  (
    SELECT string_agg(pa.full_name, ', ' ORDER BY pas.author_order)
    FROM public.publication_authorships pas
    JOIN public.publication_authors pa ON pa.id = pas.author_id
    WHERE pas.publication_id = p.id
  ) AS author_names
FROM public.publications p;


-- ============================================================
-- FUNCTIONS (RLS Helpers)
-- ============================================================

-- is_admin() — final version (0040): covers admin + super_admin. STABLE SQL
-- so the planner can inline it; SECURITY DEFINER avoids RLS recursion on
-- profiles (the original motivation in 0008).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
  );
$$;

-- Role-level helpers (0040)
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('staff', 'librarian', 'admin', 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_librarian()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('librarian', 'admin', 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin_role()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'super_admin'
  );
$$;


-- ============================================================
-- FUNCTIONS (Business Logic RPCs)
-- ============================================================

-- ── Atomic counters (0001, 0011, 0028, 0052) ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.increment_download_count(row_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE books SET download_count = download_count + 1 WHERE id = row_id;
  UPDATE book_files SET download_count = download_count + 1 WHERE book_id = row_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.increment_view_count(row_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE books SET view_count = view_count + 1 WHERE id = row_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.increment_research_view_count(row_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE research_reports SET view_count = view_count + 1 WHERE id = row_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.increment_research_download_count(row_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE research_reports SET download_count = download_count + 1 WHERE id = row_id;
END;
$$ LANGUAGE plpgsql;

-- Atomic post view counter (0028). Replaces a non-atomic read-modify-write
-- that could lose concurrent increments.
CREATE OR REPLACE FUNCTION public.increment_post_views(p_post_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.posts
  SET views = coalesce(views, 0) + 1
  WHERE id = p_post_id;
$$;

CREATE OR REPLACE FUNCTION public.increment_publication_view_count(row_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.publications SET view_count = view_count + 1 WHERE id = row_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.increment_publication_download_count(row_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.publications SET download_count = download_count + 1 WHERE id = row_id;
END;
$$ LANGUAGE plpgsql;

-- ── AI usage quota (0023) ─────────────────────────────────────────────────────
-- Returns: remaining quota AFTER this use (>= 0), or -1 if already at/over the
-- limit (does NOT increment). Called server-side with the service role, so
-- p_user_id is controlled by the route — not by the caller. Intentionally
-- service-role-only (revoked in GRANTS section).
--
-- GLOBAL CIRCUIT BREAKER: call this a second time with the sentinel UUID
-- '00000000-0000-0000-0000-000000000000' and p_limit = DAILY_GLOBAL_LIMIT.
CREATE OR REPLACE FUNCTION public.increment_ai_usage(p_user_id uuid, p_limit int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() at time zone 'Asia/Phnom_Penh')::date;
  v_count int;
BEGIN
  -- Ensure row exists for today (upsert-safe insert)
  INSERT INTO public.ai_usage (user_id, used_on, count)
  VALUES (p_user_id, v_today, 0)
  ON CONFLICT (user_id, used_on) DO NOTHING;

  -- Lock the row to prevent concurrent races
  SELECT count INTO v_count
  FROM public.ai_usage
  WHERE user_id = p_user_id AND used_on = v_today
  FOR UPDATE;

  IF v_count >= p_limit THEN
    RETURN -1;
  END IF;

  UPDATE public.ai_usage
  SET count = count + 1, updated_at = now()
  WHERE user_id = p_user_id AND used_on = v_today;

  RETURN p_limit - (v_count + 1);
END;
$$;

-- Today's used count for a user (Phnom Penh date). Authenticated users may
-- call this for their own display (0023).
CREATE OR REPLACE FUNCTION public.get_ai_usage(p_user_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() at time zone 'Asia/Phnom_Penh')::date;
  v_count int := 0;
BEGIN
  SELECT count INTO v_count
  FROM public.ai_usage
  WHERE user_id = p_user_id AND used_on = v_today;
  RETURN coalesce(v_count, 0);
END;
$$;

-- ── Home stats (0024; anon grant per 0032) ────────────────────────────────────
-- Single RPC to fetch homepage statistics in one round-trip.
CREATE OR REPLACE FUNCTION public.get_home_stats()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'resources',
      (SELECT count(*) FROM public.books WHERE is_published = true)
      + (SELECT count(*) FROM public.catalog_books WHERE is_active = true),
    'views',
      coalesce((SELECT sum(view_count)     FROM public.books WHERE is_published = true), 0),
    'downloads',
      coalesce((SELECT sum(download_count) FROM public.books WHERE is_published = true), 0),
    'members',
      (SELECT count(*) FROM public.profiles)
  );
$$;

-- ── Semantic search (0029; 0051) ──────────────────────────────────────────────
-- Unified similarity search across books, research reports, and the physical
-- catalog, ranked by cosine similarity. `<=>` is cosine distance;
-- similarity = 1 - distance. (0053 later adds a publications branch.)
CREATE OR REPLACE FUNCTION public.match_library(
  query_embedding vector(768),
  match_count int default 6,
  min_similarity float default 0.25
)
RETURNS table (
  source     text,
  ref        text,   -- slug for books/catalog, id for research
  title      text,
  author     text,
  category   text,
  cover_url  text,
  similarity float
)
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  (
    select
      'book'::text,
      b.slug,
      b.title,
      coalesce(a.name, 'Unknown'),
      coalesce(c.name, b.department, 'E-Book'),
      b.cover_url,
      1 - (b.embedding <=> query_embedding) as similarity
    from public.books b
    left join public.authors a    on a.id = b.author_id
    left join public.categories c on c.id = b.category_id
    where b.is_published
      and b.embedding is not null
      and 1 - (b.embedding <=> query_embedding) > min_similarity
    order by b.embedding <=> query_embedding
    limit match_count
  )
  union all
  (
    select
      'research'::text,
      r.id::text,
      r.title,
      coalesce(r.author_names, 'Unknown'),
      'Research Report'::text,
      r.cover_url,
      1 - (r.embedding <=> query_embedding) as similarity
    from public.research_reports r
    where r.is_published
      and r.embedding is not null
      and 1 - (r.embedding <=> query_embedding) > min_similarity
    order by r.embedding <=> query_embedding
    limit match_count
  )
  union all
  (
    select
      'catalog'::text,
      cb.slug,
      cb.title,
      coalesce(cb.author, 'Unknown'),
      coalesce(cb.category, 'Physical Book'),
      cb.cover_url,
      1 - (cb.embedding <=> query_embedding) as similarity
    from public.catalog_books cb
    where cb.is_active
      and cb.embedding is not null
      and 1 - (cb.embedding <=> query_embedding) > min_similarity
    order by cb.embedding <=> query_embedding
    limit match_count
  )
  order by similarity desc
  limit match_count;
$$;

-- Books-only similarity search (0051).
CREATE OR REPLACE FUNCTION public.match_books (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS table (
  id uuid,
  slug text,
  title text,
  cover_url text,
  description text,
  department text,
  language text,
  author_name text,
  category_name text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  select
    b.id,
    b.slug,
    b.title,
    b.cover_url,
    b.description,
    b.department,
    b.language,
    a.name as author_name,
    c.name as category_name,
    1 - (b.embedding <=> query_embedding) as similarity
  from books b
  left join authors a on b.author_id = a.id
  left join categories c on b.category_id = c.id
  where b.is_published = true
    and 1 - (b.embedding <=> query_embedding) > match_threshold
  order by b.embedding <=> query_embedding
  limit match_count;
$$;

-- ── Distributed rate limit (0031) ─────────────────────────────────────────────
-- Atomically check + record a request using a sliding window.
-- Returns true when the request is allowed, false when limit exceeded.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key       text,
  p_limit     int,
  p_window_ms bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now    bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_cutoff bigint := v_now - p_window_ms;
  v_history bigint[];
BEGIN
  -- Upsert the row, pruning stale timestamps on the fly
  INSERT INTO public.rate_limit(key, history, updated_at)
  VALUES (p_key, array[v_now], now())
  ON CONFLICT (key) DO UPDATE
    SET history    = array_append(
                       -- NB: a select-list alias can't be referenced in WHERE;
                       -- unnest must be in FROM (bug fixed in 0069).
                       (SELECT coalesce(array_agg(ts), '{}')
                        FROM unnest(rate_limit.history) AS t(ts)
                        WHERE ts > v_cutoff),
                       v_now
                     ),
        updated_at = now()
  RETURNING history INTO v_history;

  RETURN array_length(v_history, 1) <= p_limit;
END;
$$;

-- Periodically clean up rows that have been idle for 24 h to prevent table
-- bloat. Invoked by /api/cron/cleanup.
CREATE OR REPLACE FUNCTION public.cleanup_rate_limit()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.rate_limit WHERE updated_at < now() - interval '24 hours';
$$;

-- ── Post engagement toggles (0033) ────────────────────────────────────────────
-- Atomically toggles a like for the calling user.
-- Returns TRUE if the post is now liked, FALSE if now unliked.
CREATE OR REPLACE FUNCTION public.toggle_post_like(p_post_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.post_likes WHERE post_id = p_post_id AND user_id = v_uid
  ) THEN
    DELETE FROM public.post_likes WHERE post_id = p_post_id AND user_id = v_uid;
    RETURN false;
  ELSE
    INSERT INTO public.post_likes (post_id, user_id) VALUES (p_post_id, v_uid);
    RETURN true;
  END IF;
END;
$$;

-- Atomically toggles a save bookmark for the calling user.
CREATE OR REPLACE FUNCTION public.toggle_post_save(p_post_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.post_saves WHERE post_id = p_post_id AND user_id = v_uid
  ) THEN
    DELETE FROM public.post_saves WHERE post_id = p_post_id AND user_id = v_uid;
    RETURN false;
  ELSE
    INSERT INTO public.post_saves (post_id, user_id) VALUES (p_post_id, v_uid);
    RETURN true;
  END IF;
END;
$$;

-- ── Comment likes (0036) ──────────────────────────────────────────────────────
-- Toggle like (insert or delete). Returns the new liked state.
-- SECURITY INVOKER so the comment_likes RLS policies still apply.
CREATE OR REPLACE FUNCTION public.toggle_comment_like(p_comment_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_existed boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if like already exists
  SELECT EXISTS (
    SELECT 1 FROM comment_likes
    WHERE comment_id = p_comment_id AND user_id = v_user_id
  ) INTO v_existed;

  IF v_existed THEN
    DELETE FROM comment_likes
    WHERE comment_id = p_comment_id AND user_id = v_user_id;
    RETURN false;  -- now unliked
  ELSE
    INSERT INTO comment_likes(comment_id, user_id)
    VALUES (p_comment_id, v_user_id);
    RETURN true;   -- now liked
  END IF;
END;
$$;

-- Like count + current user's liked state in a single scan. Safe for anon
-- (liked_by_me always false when unauthenticated).
CREATE OR REPLACE FUNCTION public.get_comment_likes(p_comment_id uuid)
RETURNS TABLE(like_count bigint, liked_by_me boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)                                                            AS like_count,
    BOOL_OR(user_id = auth.uid()) FILTER (WHERE auth.uid() IS NOT NULL) AS liked_by_me
  FROM comment_likes
  WHERE comment_id = p_comment_id;
$$;


-- ============================================================
-- TRIGGERS
-- ============================================================

-- ── profiles: role-change protection (final version, 0040) ────────────────────
-- Service role (auth.uid() IS NULL) bypasses all checks — this is how
-- toggleUserRole works. is_super_admin can only change via service role.
-- Only super_admin may assign admin/super_admin roles.
CREATE OR REPLACE FUNCTION public.prevent_role_update() RETURNS trigger AS $$
DECLARE
  caller_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
    RAISE EXCEPTION 'is_super_admin can only be changed via service role';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    SELECT role::text INTO caller_role FROM profiles WHERE id = auth.uid();

    IF caller_role NOT IN ('admin', 'super_admin') THEN
      RAISE EXCEPTION 'Unauthorized to change roles';
    END IF;

    IF NEW.role::text IN ('admin', 'super_admin') AND caller_role != 'super_admin' THEN
      RAISE EXCEPTION 'Only super_admin can assign admin or super_admin roles';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_prevent_role_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_update();

-- ── auth.users → profiles sync (0019) ─────────────────────────────────────────
-- Sets only id + email + full_name; role MUST default to 'reader' from the
-- column default and MUST NOT be read from raw_user_meta_data.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── posts: denormalized engagement counters (0033) ────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_post_likes_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_post_likes_count
  AFTER INSERT OR DELETE ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.trg_post_likes_count();

CREATE OR REPLACE FUNCTION public.trg_post_saves_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET save_count = save_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET save_count = GREATEST(0, save_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_post_saves_count
  AFTER INSERT OR DELETE ON public.post_saves
  FOR EACH ROW EXECUTE FUNCTION public.trg_post_saves_count();

-- Counts every non-deleted comment (top-level and replies). Soft-deleting a
-- comment via UPDATE decrements the count; un-deleting increments it.
CREATE OR REPLACE FUNCTION public.trg_post_comments_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;

  ELSIF TG_OP = 'DELETE' THEN
    -- Only decrement for rows that were not already soft-deleted
    IF NOT OLD.is_deleted THEN
      UPDATE public.posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = OLD.post_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NOT OLD.is_deleted AND NEW.is_deleted THEN
      -- Comment was soft-deleted → decrement
      UPDATE public.posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = NEW.post_id;
    ELSIF OLD.is_deleted AND NOT NEW.is_deleted THEN
      -- Comment was restored → increment
      UPDATE public.posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_post_comments_count
  AFTER INSERT OR UPDATE OF is_deleted OR DELETE ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.trg_post_comments_count();

-- ── updated_at maintenance ────────────────────────────────────────────────────

-- post_comments (0033)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- posts (0034)
CREATE OR REPLACE FUNCTION public.posts_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_posts_updated_at
  BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.posts_set_updated_at();

-- team_members (0038)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER team_members_updated_at
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- book_requests (0042)
CREATE OR REPLACE FUNCTION public.update_book_requests_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_book_requests_updated_at
  BEFORE UPDATE ON public.book_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_book_requests_updated_at();

-- reading_lists (0043)
CREATE OR REPLACE FUNCTION public.update_reading_lists_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_reading_lists_updated_at
  BEFORE UPDATE ON public.reading_lists
  FOR EACH ROW EXECUTE FUNCTION public.update_reading_lists_updated_at();

-- book_notes (0046)
CREATE OR REPLACE FUNCTION public.update_book_notes_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER book_notes_updated_at
  BEFORE UPDATE ON public.book_notes
  FOR EACH ROW EXECUTE PROCEDURE public.update_book_notes_updated_at();

-- book_annotations (0047)
CREATE OR REPLACE FUNCTION public.update_book_annotations_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER book_annotations_updated_at
  BEFORE UPDATE ON public.book_annotations
  FOR EACH ROW EXECUTE PROCEDURE public.update_book_annotations_updated_at();

-- publications (0052)
CREATE OR REPLACE FUNCTION public.publications_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_publications_updated_at
  BEFORE UPDATE ON public.publications
  FOR EACH ROW EXECUTE FUNCTION public.publications_set_updated_at();


-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================

-- ── Enable RLS on every table ─────────────────────────────────────────────────
ALTER TABLE public.profiles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authors                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_files               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.download_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_books              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_progress         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_books            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_copies           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_rate_limit       ENABLE ROW LEVEL SECURITY;  -- no policies: service-role only
ALTER TABLE public.admin_audit_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.view_logs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_copies_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_reports         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_cohorts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_academic_years  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_reads       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage                 ENABLE ROW LEVEL SECURITY;
-- rate_limit intentionally has NO row level security (matches 0031): access is
-- controlled purely by the REVOKE in the GRANTS section; only the service role
-- can touch it.
ALTER TABLE public.post_likes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_saves               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_likes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_sections            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_requests            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_lists            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_list_books       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_notes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_annotations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_subscriptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publications             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_authors      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_affiliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_authorships  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_files        ENABLE ROW LEVEL SECURITY;

-- ── profiles (0002; hardened 0008/0012) ───────────────────────────────────────
CREATE POLICY "Users can view own profile"  ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.is_admin());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ── books (0002; is_admin() per 0008) ─────────────────────────────────────────
CREATE POLICY "Public can view published books" ON public.books FOR SELECT USING (is_published = true);
CREATE POLICY "Admins can view all books"       ON public.books FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can insert books"         ON public.books FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update books"         ON public.books FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can delete books"         ON public.books FOR DELETE USING (public.is_admin());

-- ── book_files (0006/0008; wide authenticated SELECT removed in 0019) ─────────
CREATE POLICY "Public can view book files for published books" ON public.book_files FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.books WHERE id = book_id AND is_published = true)
);
CREATE POLICY "Admins can manage book files" ON public.book_files FOR ALL USING (public.is_admin());

-- ── download_logs (0002/0008/0019) ────────────────────────────────────────────
CREATE POLICY "Users can insert own download logs" ON public.download_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own download logs"   ON public.download_logs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can view all download logs"  ON public.download_logs FOR SELECT USING (public.is_admin());

-- ── posts (0002/0008) ─────────────────────────────────────────────────────────
CREATE POLICY "Public can view published posts" ON public.posts FOR SELECT USING (is_published = true);
CREATE POLICY "Admins can view all posts"       ON public.posts FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can manage posts"         ON public.posts FOR ALL USING (public.is_admin());

-- ── saved_books (0019: per-operation with WITH CHECK on INSERT) ───────────────
CREATE POLICY "Users can select own saved_books" ON public.saved_books FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own saved_books" ON public.saved_books FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own saved_books" ON public.saved_books FOR DELETE USING (user_id = auth.uid());

-- ── reviews (0013/0019) ───────────────────────────────────────────────────────
CREATE POLICY "Public can view reviews"      ON public.reviews FOR SELECT USING (true);
CREATE POLICY "Users can insert own reviews" ON public.reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reviews" ON public.reviews FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own reviews" ON public.reviews FOR DELETE USING (user_id = auth.uid());

-- ── reading_progress (0019) ───────────────────────────────────────────────────
CREATE POLICY "Users can select own reading_progress" ON public.reading_progress FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own reading_progress" ON public.reading_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reading_progress" ON public.reading_progress FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own reading_progress" ON public.reading_progress FOR DELETE USING (user_id = auth.uid());

-- ── catalog_books (0002/0008) ─────────────────────────────────────────────────
CREATE POLICY "Public can view catalog books"  ON public.catalog_books FOR SELECT USING (true);
CREATE POLICY "Admins can manage catalog books" ON public.catalog_books FOR ALL USING (public.is_admin());

-- ── catalog_copies (0019) ─────────────────────────────────────────────────────
CREATE POLICY "Catalog copies viewable by everyone" ON public.catalog_copies FOR SELECT USING (true);
CREATE POLICY "Admins can insert catalog_copies"    ON public.catalog_copies FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update catalog_copies"    ON public.catalog_copies FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can delete catalog_copies"    ON public.catalog_copies FOR DELETE USING (public.is_admin());

-- ── admin_audit_log (0003; final form 0040; append-only — no UPDATE/DELETE) ───
CREATE POLICY "Admins can view audit logs"   ON public.admin_audit_log FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can insert audit logs" ON public.admin_audit_log FOR INSERT WITH CHECK (public.is_admin());

-- ── authors / categories (0019) ───────────────────────────────────────────────
CREATE POLICY "Authors are viewable by everyone" ON public.authors FOR SELECT USING (true);
CREATE POLICY "Admins can insert authors"        ON public.authors FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update authors"        ON public.authors FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can delete authors"        ON public.authors FOR DELETE USING (public.is_admin());

CREATE POLICY "Categories are viewable by everyone" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Admins can insert categories"        ON public.categories FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update categories"        ON public.categories FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can delete categories"        ON public.categories FOR DELETE USING (public.is_admin());

-- ── departments (0009) ────────────────────────────────────────────────────────
CREATE POLICY "Departments are viewable by everyone" ON public.departments FOR SELECT USING (true);
CREATE POLICY "Admins can insert departments"        ON public.departments FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update departments"        ON public.departments FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can delete departments"        ON public.departments FOR DELETE USING (public.is_admin());

-- ── view_logs (0019) — inserts come from service-role server actions ──────────
CREATE POLICY "Admins can view all view_logs" ON public.view_logs FOR SELECT USING (public.is_admin());
CREATE POLICY "Users can view own view_logs"  ON public.view_logs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can delete view_logs"   ON public.view_logs FOR DELETE USING (public.is_admin());

-- ── catalog_copies_log (0019) — append-only ───────────────────────────────────
CREATE POLICY "Admins can view catalog_copies_log"   ON public.catalog_copies_log FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can insert catalog_copies_log" ON public.catalog_copies_log FOR INSERT WITH CHECK (public.is_admin());

-- ── research_reports (0011; is_admin() per 0019) ──────────────────────────────
CREATE POLICY "Public can view published research reports" ON public.research_reports FOR SELECT USING (is_published = true);
CREATE POLICY "Admins can manage research reports"         ON public.research_reports FOR ALL USING (public.is_admin());

-- ── research_cohorts / research_academic_years (0015) ─────────────────────────
CREATE POLICY "Research cohorts viewable by everyone" ON public.research_cohorts FOR SELECT USING (true);
CREATE POLICY "Admins can insert research cohorts"    ON public.research_cohorts FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update research cohorts"    ON public.research_cohorts FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can delete research cohorts"    ON public.research_cohorts FOR DELETE USING (public.is_admin());

CREATE POLICY "Research academic years viewable by everyone" ON public.research_academic_years FOR SELECT USING (true);
CREATE POLICY "Admins can insert research academic years"    ON public.research_academic_years FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update research academic years"    ON public.research_academic_years FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can delete research academic years"    ON public.research_academic_years FOR DELETE USING (public.is_admin());

-- ── notifications / notification_reads (0021; is_admin() per 0040) ────────────
CREATE POLICY "admins_read_notifications" ON public.notifications FOR SELECT USING (public.is_admin());
CREATE POLICY "users_read_broadcast_notifications" ON public.notifications FOR SELECT
  USING (target_role IS NULL AND auth.uid() IS NOT NULL);

CREATE POLICY "users_select_own_reads" ON public.notification_reads FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "users_insert_own_reads" ON public.notification_reads FOR INSERT WITH CHECK (user_id = auth.uid());

-- ── ai_usage (0023) — all writes go through the service role via RPC ──────────
CREATE POLICY "read own ai usage" ON public.ai_usage FOR SELECT USING (auth.uid() = user_id);

-- ── post_likes / post_saves / post_comments (0033) ────────────────────────────
-- The toggle_* RPCs (SECURITY DEFINER) are the preferred mutation path; the
-- INSERT/DELETE policies are kept so PostgREST clients can also call them.
CREATE POLICY "Users can view own post likes"   ON public.post_likes FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own post likes" ON public.post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own post likes" ON public.post_likes FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Users can view own post saves"   ON public.post_saves FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own post saves" ON public.post_saves FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own post saves" ON public.post_saves FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Anyone can read non-deleted comments"   ON public.post_comments FOR SELECT USING (is_deleted = false);
CREATE POLICY "Authenticated users can post comments"  ON public.post_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can edit own comment body"        ON public.post_comments FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own comments"          ON public.post_comments FOR DELETE USING (user_id = auth.uid());
CREATE POLICY "Admins can manage all comments"         ON public.post_comments FOR ALL USING (public.is_admin());

-- ── comment_likes (0036; delete policy finalised 0040) ────────────────────────
CREATE POLICY "comment_likes_select_public"        ON public.comment_likes FOR SELECT USING (true);
CREATE POLICY "comment_likes_insert_own"           ON public.comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comment_likes_delete_own_or_admin"  ON public.comment_likes FOR DELETE
  USING (auth.uid() = user_id OR public.is_admin());

-- ── team_sections / team_members (0038; admin read finalised 0040) ────────────
CREATE POLICY "team_sections_public_read" ON public.team_sections FOR SELECT USING (true);
CREATE POLICY "team_members_public_read"  ON public.team_members  FOR SELECT USING (is_published = true);
CREATE POLICY "team_members_admin_read"   ON public.team_members  FOR SELECT USING (public.is_admin());

-- ── role_permissions (0041) — writes only via service role ────────────────────
CREATE POLICY "Admins can view role_permissions" ON public.role_permissions FOR SELECT USING (public.is_admin());

-- ── book_requests (0042) ──────────────────────────────────────────────────────
CREATE POLICY "users_read_own_requests" ON public.book_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_requests"   ON public.book_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "service_role_all"        ON public.book_requests FOR ALL USING (auth.role() = 'service_role');

-- ── reading_lists / reading_list_books (0043) ─────────────────────────────────
CREATE POLICY "owner_all_lists"   ON public.reading_lists FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "public_read_lists" ON public.reading_lists FOR SELECT USING (is_public = true);

CREATE POLICY "owner_all_list_books" ON public.reading_list_books FOR ALL USING (
  EXISTS (SELECT 1 FROM public.reading_lists l WHERE l.id = list_id AND l.user_id = auth.uid())
);
CREATE POLICY "public_read_list_books" ON public.reading_list_books FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.reading_lists l WHERE l.id = list_id AND l.is_public = true)
);

-- ── push_subscriptions (0044) ─────────────────────────────────────────────────
CREATE POLICY "users_own_subscriptions" ON public.push_subscriptions FOR ALL
  USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "service_role_read_all" ON public.push_subscriptions FOR SELECT
  USING (auth.role() = 'service_role');

-- ── book_notes / book_annotations (0046, 0047) ────────────────────────────────
CREATE POLICY "Users manage own notes"       ON public.book_notes       FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own annotations" ON public.book_annotations FOR ALL USING (auth.uid() = user_id);

-- ── content_subscriptions (0048) ──────────────────────────────────────────────
CREATE POLICY "Users manage own subscriptions" ON public.content_subscriptions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── publications suite (0052) ─────────────────────────────────────────────────
-- Public reads only see published articles. All writes go through Server
-- Actions using the service-role client (bypasses RLS) after
-- requirePermission('publications', 'write') — so no write policies exist.
CREATE POLICY "Public can view published publications" ON public.publications FOR SELECT USING (is_published = true);
CREATE POLICY "Admins can view all publications"       ON public.publications FOR SELECT USING (public.is_admin());

CREATE POLICY "Publication authors are viewable by everyone"      ON public.publication_authors      FOR SELECT USING (true);
CREATE POLICY "Publication affiliations are viewable by everyone" ON public.publication_affiliations FOR SELECT USING (true);

-- Row links and files are only visible once the parent article is published
-- (mirrors the book_files policy).
CREATE POLICY "Public can view authorships of published publications" ON public.publication_authorships FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.publications WHERE id = publication_id AND is_published = true)
    OR public.is_admin()
  );
CREATE POLICY "Public can view files of published publications" ON public.publication_files FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.publications WHERE id = publication_id AND is_published = true)
    OR public.is_admin()
  );


-- ============================================================
-- GRANTS
-- ============================================================

-- ── profiles: column-level privilege lock (0019/0030) ─────────────────────────
-- The UPDATE trigger is defence-in-depth; column grants are the primary gate
-- for the direct-browser PostgREST path. authenticated may only update
-- full_name and avatar_url — never role / is_super_admin / id.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT  UPDATE (full_name, avatar_url) ON public.profiles TO authenticated;

-- ── Service-role-only tables (0031) ───────────────────────────────────────────
REVOKE ALL ON TABLE public.rate_limit FROM public, anon, authenticated;

-- ── Table/view grants ─────────────────────────────────────────────────────────
GRANT SELECT ON public.books_with_stats TO anon, authenticated;          -- (0027)
GRANT SELECT ON public.posts TO anon;                                    -- (0034)
GRANT SELECT ON public.comment_likes TO anon, authenticated;             -- (0036)
GRANT SELECT, INSERT ON public.book_requests TO authenticated;           -- (0042)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reading_lists      TO authenticated;  -- (0043)
GRANT SELECT, INSERT, DELETE         ON public.reading_list_books TO authenticated;  -- (0043)
GRANT SELECT, INSERT, DELETE ON public.push_subscriptions TO authenticated;          -- (0044)

-- ── Function grants ───────────────────────────────────────────────────────────

-- Role helpers (0040)
GRANT EXECUTE ON FUNCTION public.is_staff()            TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_librarian()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin_role() TO authenticated;

-- AI usage: increment is service-role only; read is for the user's own display (0023)
REVOKE ALL ON FUNCTION public.increment_ai_usage(uuid, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_usage(uuid) TO authenticated;

-- Home stats: service role + anon only (0024 revoke, 0032 anon grant)
REVOKE ALL ON FUNCTION public.get_home_stats() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_home_stats() TO anon;

-- Post view counting may happen for anonymous visitors (0028)
GRANT EXECUTE ON FUNCTION public.increment_post_views(uuid) TO anon, authenticated;

-- Semantic search (0029)
GRANT EXECUTE ON FUNCTION public.match_library(vector, int, float) TO anon, authenticated, service_role;

-- Rate limiting: service-role only (0031)
REVOKE ALL ON FUNCTION public.check_rate_limit(text, int, bigint) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_rate_limit() FROM public, anon, authenticated;

-- Post/comment engagement (0033, 0036)
GRANT EXECUTE ON FUNCTION public.toggle_post_like(uuid)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_post_save(uuid)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_comment_like(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_comment_likes(uuid)   TO anon, authenticated;


-- ============================================================
-- SEED DATA
-- ============================================================

-- ── research cohorts + academic years (0015) ──────────────────────────────────
-- ⚠️ Confirm these values with the institution registrar before running in production.
WITH cohort_inserts AS (
  INSERT INTO public.research_cohorts (program_code, number, sort_order)
  VALUES
    ('b_ed_12_4',      1, 1),
    ('b_ed_12_4',      2, 2),
    ('b_ed_12_4',      3, 3),
    ('b_ed_12_4',      4, 4),
    ('b_ed_12_4',      5, 5),
    ('b_ed_12_4',      6, 6),
    ('bachelor_plus_1', 1, 1),
    ('bachelor_plus_1', 2, 2)
  ON CONFLICT (program_code, number) DO NOTHING
  RETURNING id, program_code, number
)
INSERT INTO public.research_academic_years (cohort_id, label, sort_order)
SELECT ci.id, ay.label, ay.sort_order
FROM cohort_inserts ci
JOIN (VALUES
  ('b_ed_12_4',      1, '2020-2021', 1),
  ('b_ed_12_4',      2, '2021-2022', 1),
  ('b_ed_12_4',      3, '2022-2023', 1),
  ('b_ed_12_4',      4, '2023-2024', 1),
  ('b_ed_12_4',      5, '2024-2025', 1),
  ('b_ed_12_4',      6, '2025-2026', 1),  -- ⚠️ TODO: confirm cohort 6 year with registrar
  ('bachelor_plus_1', 1, '2023-2024', 1),
  ('bachelor_plus_1', 2, '2024-2025', 1)
) AS ay(prog, num, label, sort_order)
  ON ci.program_code = ay.prog AND ci.number = ay.num::integer
ON CONFLICT (cohort_id, label) DO NOTHING;

-- ── PTEC Library organisational sections (0038) ───────────────────────────────
INSERT INTO public.team_sections (name_km, name_en, description_km, description_en, display_order) VALUES
  ('គ្រប់គ្រងទូទៅ',          'General Management',       'ក្រុមដឹកនាំ និងគ្រប់គ្រងបណ្ណាល័យ',                   'Library leadership and overall management',             1),
  ('ភារកិច្ច',               'Administration',           'ការរៀបចំរដ្ឋបាល ឯកសារ និងការទំនាក់ទំនង',              'Administrative operations, documentation and communication', 2),
  ('បណ្ណាល័យអេឡិចត្រូនិក',  'E-Library & Digital',      'គ្រប់គ្រងធនធានឌីជីថល ប្រព័ន្ធ E-Library',              'Digital resource management and E-Library platform',    3),
  ('ការចាត់ថ្នាក់ & ភ្ជាប់',  'Cataloging & Processing',  'ចំណាត់ថ្នាក់ DDC ការចុះបញ្ជី និងការរៀបចំឯកសារ',       'DDC classification, registration and document processing', 4),
  ('ការផ្តល់សេវា',           'Reader Services',          'ខ្ចី-សង ជំនួយការស្រាវជ្រាវ និងការបម្រើអ្នកអាន',       'Circulation, research assistance and patron services',  5),
  ('ការស្រាវជ្រាវវិទ្យា',    'Research Support',         'គាំទ្រការស្រាវជ្រាវ PTEC Library Press',               'Supporting PTEC research and Library Press publications', 6)
ON CONFLICT DO NOTHING;

-- ── Default role × resource permission matrix (0041 + publications rows 0052) ─
INSERT INTO public.role_permissions (role, resource, level) VALUES
  ('reader',      'books',         'read'),
  ('reader',      'catalog',       'read'),
  ('reader',      'research',      'read'),
  ('reader',      'posts',         'read'),
  ('reader',      'announcements', 'read'),
  ('reader',      'publications',  'read'),
  ('reader',      'users',         'none'),
  ('reader',      'roles',         'none'),

  ('staff',       'books',         'read'),
  ('staff',       'catalog',       'read'),
  ('staff',       'research',      'read'),
  ('staff',       'posts',         'write'),
  ('staff',       'announcements', 'write'),
  ('staff',       'publications',  'read'),
  ('staff',       'users',         'none'),
  ('staff',       'roles',         'none'),

  ('librarian',   'books',         'write'),
  ('librarian',   'catalog',       'write'),
  ('librarian',   'research',      'write'),
  ('librarian',   'posts',         'read'),
  ('librarian',   'announcements', 'read'),
  ('librarian',   'publications',  'write'),
  ('librarian',   'users',         'none'),
  ('librarian',   'roles',         'none'),

  ('admin',       'books',         'write'),
  ('admin',       'catalog',       'write'),
  ('admin',       'research',      'write'),
  ('admin',       'posts',         'write'),
  ('admin',       'announcements', 'write'),
  ('admin',       'publications',  'write'),
  ('admin',       'users',         'write'),
  ('admin',       'roles',         'none'),

  ('super_admin', 'books',         'write'),
  ('super_admin', 'catalog',       'write'),
  ('super_admin', 'research',      'write'),
  ('super_admin', 'posts',         'write'),
  ('super_admin', 'announcements', 'write'),
  ('super_admin', 'publications',  'write'),
  ('super_admin', 'users',         'write'),
  ('super_admin', 'roles',         'write')
ON CONFLICT (role, resource) DO NOTHING;
