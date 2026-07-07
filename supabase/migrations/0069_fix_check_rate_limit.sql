-- 0069: Fix check_rate_limit() — rate limiting was silently disabled.
--
-- The squashed baseline's version pruned old timestamps with:
--     array(SELECT unnest(rate_limit.history) WHERE unnest > v_cutoff)
-- but Postgres does not allow referencing the select-list alias ("unnest")
-- in WHERE, so every ON CONFLICT update raised:
--     column "unnest" does not exist
-- The first request per key succeeded (plain INSERT); every subsequent call
-- errored and lib/rate-limit.ts failed open by design. Net effect: all
-- app-level rate limits (search, file reads, downloads, contact) were
-- accepting unlimited traffic. Discovered 2026-07-07 during DDoS-hardening
-- verification; confirmed by "[rate-limit] DB error, failing open" logs.

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key       text,
  p_limit     int,
  p_window_ms bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now    bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_cutoff bigint := v_now - p_window_ms;
  v_history bigint[];
BEGIN
  -- Upsert the row, pruning stale timestamps on the fly
  INSERT INTO public.rate_limit(key, history, updated_at)
  VALUES (p_key, array[v_now], now())
  ON CONFLICT (key) DO UPDATE
    SET history    = array_append(
                       (SELECT coalesce(array_agg(ts), '{}')
                        FROM unnest(rate_limit.history) AS t(ts)
                        WHERE ts > v_cutoff),
                       v_now
                     ),
        updated_at = now()
  RETURNING history INTO v_history;

  RETURN array_length(v_history, 1) <= p_limit;
END;
$$;
