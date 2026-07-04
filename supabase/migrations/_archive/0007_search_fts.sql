-- Enable pg_trgm extension for trigram-based search
-- Trigram matching is highly effective for Khmer text where spaces are not used between words,
-- making standard to_tsvector FTS less effective without specialized parsers.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN indexes on title and description for fast ILIKE queries
CREATE INDEX IF NOT EXISTS books_title_trgm_idx ON books USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS books_description_trgm_idx ON books USING GIN (description gin_trgm_ops);
