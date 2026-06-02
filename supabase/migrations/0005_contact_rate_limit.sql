CREATE TABLE contact_rate_limit (
  ip text PRIMARY KEY,
  history bigint[] DEFAULT '{}',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);
