-- Book request system: users can request books not yet in the library
CREATE TABLE IF NOT EXISTS book_requests (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  title       TEXT        NOT NULL,
  author      TEXT,
  isbn        TEXT,
  reason      TEXT,
  status      TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved', 'rejected', 'added')),
  admin_note  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_book_requests_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_book_requests_updated_at
  BEFORE UPDATE ON book_requests
  FOR EACH ROW EXECUTE FUNCTION update_book_requests_updated_at();

-- RLS
ALTER TABLE book_requests ENABLE ROW LEVEL SECURITY;

-- Users can read their own requests
CREATE POLICY "users_read_own_requests" ON book_requests
  FOR SELECT USING (auth.uid() = user_id);

-- Authenticated users can insert
CREATE POLICY "users_insert_requests" ON book_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Service role (admin) can do anything
CREATE POLICY "service_role_all" ON book_requests
  FOR ALL USING (auth.role() = 'service_role');

-- Grant anon/authenticated read access to own rows (handled by RLS above)
GRANT SELECT, INSERT ON book_requests TO authenticated;
