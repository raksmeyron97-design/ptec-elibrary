-- 0052_publications.sql
-- Academic journal articles ("Publications") — standalone articles with
-- authors, affiliations, supporting files, and AI-search embeddings.
--
-- NOTE: the person table is `publication_authors` (NOT `authors`, which
-- already exists for books with a different shape), and the ordered M:N
-- join is `publication_authorships`.
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE / DROP IF EXISTS.

-- ── 1. Tables ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.publication_authors (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name    text        NOT NULL,
  full_name_km text,
  orcid        text,
  email        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.publication_affiliations (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  name_km    text,
  city       text,
  country    text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.publications (
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

CREATE TABLE IF NOT EXISTS public.publication_authorships (
  publication_id   uuid    NOT NULL REFERENCES public.publications(id) ON DELETE CASCADE,
  author_id        uuid    NOT NULL REFERENCES public.publication_authors(id) ON DELETE CASCADE,
  author_order     integer NOT NULL DEFAULT 1,
  is_corresponding boolean NOT NULL DEFAULT false,
  affiliation_ids  uuid[]  NOT NULL DEFAULT '{}',
  PRIMARY KEY (publication_id, author_id)
);

CREATE TABLE IF NOT EXISTS public.publication_files (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid    NOT NULL REFERENCES public.publications(id) ON DELETE CASCADE,
  label          text    NOT NULL,
  file_url       text    NOT NULL,
  file_type      text,
  size_bytes     bigint,
  sort_order     integer NOT NULL DEFAULT 0
);

-- ── 2. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_publications_published_created
  ON public.publications (is_published, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_publications_publication_date
  ON public.publications (publication_date DESC);
CREATE INDEX IF NOT EXISTS idx_publications_keywords
  ON public.publications USING gin (keywords);
CREATE INDEX IF NOT EXISTS publications_embedding_idx
  ON public.publications USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_publication_authorships_author
  ON public.publication_authorships (author_id);
CREATE INDEX IF NOT EXISTS idx_publication_files_publication
  ON public.publication_files (publication_id, sort_order);

-- ── 3. updated_at trigger (mirrors posts_set_updated_at from 0034) ───────────

CREATE OR REPLACE FUNCTION public.publications_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_publications_updated_at ON public.publications;
CREATE TRIGGER trg_publications_updated_at
  BEFORE UPDATE ON public.publications
  FOR EACH ROW EXECUTE FUNCTION public.publications_set_updated_at();

-- ── 4. Counter RPCs (mirror increment_research_* from 0011) ──────────────────

CREATE OR REPLACE FUNCTION increment_publication_view_count(row_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.publications SET view_count = view_count + 1 WHERE id = row_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_publication_download_count(row_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.publications SET download_count = download_count + 1 WHERE id = row_id;
END;
$$ LANGUAGE plpgsql;

-- ── 5. Stats/listing view (mirrors books_with_stats from 0027) ───────────────
-- security_invoker = true so the view respects RLS of the calling user:
-- anon sees only published rows, exactly like the base table.

DROP VIEW IF EXISTS public.publications_with_stats;

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

-- ── 6. RLS ────────────────────────────────────────────────────────────────────
-- Public reads only see published articles. All writes go through Server
-- Actions using the service-role client (bypasses RLS) after
-- requirePermission('publications', 'write') — so no write policies exist.

ALTER TABLE public.publications            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_authors     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_affiliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_authorships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_files       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view published publications" ON public.publications;
CREATE POLICY "Public can view published publications"
  ON public.publications FOR SELECT
  USING (is_published = true);

DROP POLICY IF EXISTS "Admins can view all publications" ON public.publications;
CREATE POLICY "Admins can view all publications"
  ON public.publications FOR SELECT
  USING (public.is_admin());

-- Author/affiliation records are plain metadata needed to render bylines.
DROP POLICY IF EXISTS "Publication authors are viewable by everyone" ON public.publication_authors;
CREATE POLICY "Publication authors are viewable by everyone"
  ON public.publication_authors FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Publication affiliations are viewable by everyone" ON public.publication_affiliations;
CREATE POLICY "Publication affiliations are viewable by everyone"
  ON public.publication_affiliations FOR SELECT
  USING (true);

-- Row links and files are only visible once the parent article is published
-- (mirrors the book_files policy from 0006).
DROP POLICY IF EXISTS "Public can view authorships of published publications" ON public.publication_authorships;
CREATE POLICY "Public can view authorships of published publications"
  ON public.publication_authorships FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.publications
      WHERE id = publication_id AND is_published = true
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Public can view files of published publications" ON public.publication_files;
CREATE POLICY "Public can view files of published publications"
  ON public.publication_files FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.publications
      WHERE id = publication_id AND is_published = true
    )
    OR public.is_admin()
  );

-- ── 7. Permission matrix seed (mirrors 0041) ──────────────────────────────────
-- librarian+ = write, reader/staff = read.

INSERT INTO public.role_permissions (role, resource, level) VALUES
  ('reader',      'publications', 'read'),
  ('staff',       'publications', 'read'),
  ('librarian',   'publications', 'write'),
  ('admin',       'publications', 'write'),
  ('super_admin', 'publications', 'write')
ON CONFLICT (role, resource) DO NOTHING;
