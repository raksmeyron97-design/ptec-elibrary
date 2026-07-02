-- Content subscriptions: users can subscribe to departments or categories
-- to receive alerts when new books are added matching their interests.

CREATE TABLE content_subscriptions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  filter_type  text        NOT NULL CHECK (filter_type IN ('department', 'category')),
  filter_value text        NOT NULL,
  display_label text,
  created_at   timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, filter_type, filter_value)
);

ALTER TABLE content_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own subscriptions"
  ON content_subscriptions FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_content_subs_user ON content_subscriptions(user_id);
