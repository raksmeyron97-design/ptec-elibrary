-- Named reading lists: users can organise saved books into named collections
CREATE TABLE IF NOT EXISTS reading_lists (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT,
  is_public   BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reading_list_books (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id   UUID        NOT NULL REFERENCES reading_lists(id) ON DELETE CASCADE,
  book_id   UUID        NOT NULL REFERENCES books(id)         ON DELETE CASCADE,
  added_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (list_id, book_id)
);

-- Auto-update updated_at on reading_lists
CREATE OR REPLACE FUNCTION update_reading_lists_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_reading_lists_updated_at
  BEFORE UPDATE ON reading_lists
  FOR EACH ROW EXECUTE FUNCTION update_reading_lists_updated_at();

-- RLS
ALTER TABLE reading_lists      ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_list_books ENABLE ROW LEVEL SECURITY;

-- reading_lists policies
CREATE POLICY "owner_all_lists" ON reading_lists
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "public_read_lists" ON reading_lists
  FOR SELECT USING (is_public = true);

-- reading_list_books policies
CREATE POLICY "owner_all_list_books" ON reading_list_books
  FOR ALL USING (
    EXISTS (SELECT 1 FROM reading_lists l WHERE l.id = list_id AND l.user_id = auth.uid())
  );

CREATE POLICY "public_read_list_books" ON reading_list_books
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM reading_lists l WHERE l.id = list_id AND l.is_public = true)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON reading_lists      TO authenticated;
GRANT SELECT, INSERT, DELETE         ON reading_list_books TO authenticated;