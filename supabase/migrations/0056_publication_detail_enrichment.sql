-- 0056: Publication detail page enrichment
--
-- Backs the redesigned /publications/[slug] page:
--   * publications gains book-style metadata (publisher, ISBN) and pedagogical
--     content (subjects, table of contents, learning outcomes, FAQs)
--   * publication_authors gains biography fields for the "About the Authors"
--     section
--   * publication_reviews stores one rating (1–5) + optional comment per user
--     per article, mirroring the books `reviews` table

-- ── publications: optional detail-page metadata ──────────────────────────────
ALTER TABLE public.publications
  ADD COLUMN IF NOT EXISTS publisher         text,
  ADD COLUMN IF NOT EXISTS isbn              text,
  ADD COLUMN IF NOT EXISTS subjects          text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS table_of_contents jsonb  NOT NULL DEFAULT '[]'::jsonb,  -- [{ title, title_km?, page? }]
  ADD COLUMN IF NOT EXISTS learning_outcomes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS faqs              jsonb  NOT NULL DEFAULT '[]'::jsonb;  -- [{ question, answer }]

-- ── publication_authors: biography fields ────────────────────────────────────
ALTER TABLE public.publication_authors
  ADD COLUMN IF NOT EXISTS bio       text,
  ADD COLUMN IF NOT EXISTS bio_km    text,
  ADD COLUMN IF NOT EXISTS photo_url text;

-- ── publication_reviews ──────────────────────────────────────────────────────
CREATE TABLE public.publication_reviews (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid        NOT NULL REFERENCES public.publications(id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating         integer     NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content        text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (publication_id, user_id)
);

CREATE INDEX idx_publication_reviews_publication
  ON public.publication_reviews (publication_id, created_at DESC);

ALTER TABLE public.publication_reviews ENABLE ROW LEVEL SECURITY;

-- Reads are public (reviews of published articles only). Writes go through
-- Server Actions using the service client (mirroring book reviews), but users
-- may also manage their own rows directly.
CREATE POLICY "Public can view reviews of published publications" ON public.publication_reviews
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.publications WHERE id = publication_id AND is_published = true)
  );
CREATE POLICY "Users can insert own publication reviews" ON public.publication_reviews
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own publication reviews" ON public.publication_reviews
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own publication reviews" ON public.publication_reviews
  FOR DELETE USING (auth.uid() = user_id);
