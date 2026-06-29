-- Web push subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   TEXT        NOT NULL UNIQUE,
  p256dh     TEXT        NOT NULL,
  auth_key   TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users manage their own subscriptions
CREATE POLICY "users_own_subscriptions" ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id OR user_id IS NULL);

-- Service role can read all (needed for sending)
CREATE POLICY "service_role_read_all" ON push_subscriptions
  FOR SELECT USING (auth.role() = 'service_role');

GRANT SELECT, INSERT, DELETE ON push_subscriptions TO authenticated;
