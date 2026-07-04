-- 0054_publication_subscriptions.sql
-- Let users subscribe to new publications (journal articles).
-- Extends the content_subscriptions filter_type CHECK (from 0048) with a
-- 'publications' content-type-level channel (filter_value is 'all').
-- Publishing an article for the first time pushes a web notification to
-- these subscribers (togglePublicationPublishStatus → broadcastPush).

ALTER TABLE public.content_subscriptions
  DROP CONSTRAINT IF EXISTS content_subscriptions_filter_type_check;

ALTER TABLE public.content_subscriptions
  ADD CONSTRAINT content_subscriptions_filter_type_check
  CHECK (filter_type IN ('department', 'category', 'publications'));
