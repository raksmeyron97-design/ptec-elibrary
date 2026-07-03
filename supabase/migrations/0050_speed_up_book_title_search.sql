-- Speed up book title search
CREATE INDEX IF NOT EXISTS idx_books_title 
  ON catalog_books USING gin (to_tsvector('simple', title));

-- Speed up author search  
CREATE INDEX IF NOT EXISTS idx_books_author ON catalog_books (author);

-- Speed up category filtering
CREATE INDEX IF NOT EXISTS idx_books_category ON catalog_books (category);

-- Speed up sorting by newest
CREATE INDEX IF NOT EXISTS idx_books_created_at ON catalog_books (created_at DESC);