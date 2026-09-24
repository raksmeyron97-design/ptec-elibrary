-- 0155_lifetime_counter_backfill.sql
--
-- REPAIR THE HISTORY THE FROZEN COUNTER LOST.
--
-- 0154 and the code change that shipped with it fixed the counters going
-- FORWARD: `increment_view_count` had been called with an argument name no
-- function declares, PostgREST answered 404 rather than throwing, and
-- `books.view_count` had not moved since the initial schema. Nothing repaired
-- the number that had been standing still the whole time, so a card now reads
--
--     6 views · 11 downloads
--
-- which is not a book people download without reading. It is one counter
-- measuring the days since the fix deployed and the other measuring the life
-- of the library. Two numbers printed side by side have to measure the same
-- span, and no code change can give the first one its past back — only the
-- log can.
--
-- `view_logs` HAS that past. The logging path was never broken: every
-- book-detail view has written a row since June, bot-filtered, carrying the
-- viewer's account id or the daily-rotating anonymous session hash. Only the
-- counter derived from it was broken. So this replays the live rule over the
-- log instead of inventing a number.
--
-- THE RULE IS REPLAYED, NOT APPROXIMATED. lib/analytics/counting.ts says one
-- event per viewer per ROLLING 24 hours. The tempting shortcut — count
-- distinct (viewer, calendar day) — is a different rule: a reader at 23:50 and
-- again at 00:10 is one viewer in one evening and two calendar days, and
-- bucketing by day would print a number the live path will never produce
-- again. The loops below scan each (book, viewer) run in time order and count
-- an event only when it is at least 24 hours after the last counted one, which
-- is exactly what `decideLifetimeCount` + `viewCountedWithinWindow` decide
-- request by request.
--
-- A VIEWER THE LOG CANNOT IDENTIFY IS NOT COUNTED — the `unidentified` branch
-- of the same rule. Rows with neither `user_id` nor `session_hash` (guests
-- logged before 0090 added the hash column) have no key to deduplicate
-- against, and counting them anyway would make the repaired number a refresh
-- counter. Refusing is the visible direction: it reads as a lower number, not
-- as a plausible wrong one.
--
-- IT ONLY EVER RAISES A COUNTER (`greatest`). A log is a LOWER bound on what
-- happened, for reasons that are structural and cannot be recovered here:
-- `download_logs.user_id` is `ON DELETE CASCADE`, so a closed account takes
-- its download history with it; `view_logs.user_id` is `ON DELETE SET NULL`,
-- so a closed account's views survive as unidentified rows this migration
-- skips; and anonymous view logging is rate-limited per IP. Rebuilding a
-- published number downward on that evidence would trade a counter that was
-- frozen for one that is quietly wrong in the other direction. So the repair
-- raises `view_count` to what the log can prove and leaves `download_count`,
-- which was climbing all along, wherever it already stands unless the log
-- proves MORE. That also makes the file idempotent: a second run changes
-- nothing.
--
-- NOT TOUCHED: `book_files.download_count`. `increment_download_count(row_id)`
-- bumps it alongside `books.download_count`, but no read path in the
-- application looks at it — repairing a number nobody reads would be a claim
-- this migration cannot check. `research_reports` and `publications` are not
-- touched either: their counters pass `row_id` and have worked the whole time.
--
-- Data-only. No table, no column, no policy, no grant, no function.

-- ── views ───────────────────────────────────────────────────────────────────

drop table if exists pg_temp.counter_repair_views;
create temporary table counter_repair_views (
  content_id uuid primary key,
  counted    bigint not null
);

do $$
declare
  r                record;
  current_content  uuid        := null;
  current_viewer   text        := null;
  last_counted_at  timestamptz := null;
  running          bigint      := 0;
begin
  for r in
    select vl.content_id,
           coalesce(vl.user_id::text, 'session:' || vl.session_hash) as viewer,
           vl.viewed_at
      from public.view_logs vl
      join public.books b on b.id = vl.content_id
     where vl.content_type = 'book'
       and vl.viewed_at is not null
       and (vl.user_id is not null or vl.session_hash is not null)
     order by vl.content_id,
              coalesce(vl.user_id::text, 'session:' || vl.session_hash),
              vl.viewed_at
  loop
    if current_content is distinct from r.content_id then
      if current_content is not null then
        insert into counter_repair_views (content_id, counted) values (current_content, running);
      end if;
      current_content := r.content_id;
      current_viewer  := null;
      running         := 0;
    end if;

    if current_viewer is distinct from r.viewer then
      current_viewer  := r.viewer;
      last_counted_at := null;
    end if;

    if last_counted_at is null or r.viewed_at >= last_counted_at + interval '24 hours' then
      running         := running + 1;
      last_counted_at := r.viewed_at;
    end if;
  end loop;

  if current_content is not null then
    insert into counter_repair_views (content_id, counted) values (current_content, running);
  end if;
end;
$$;

update public.books b
   set view_count = v.counted
  from counter_repair_views v
 where v.content_id = b.id
   and v.counted > coalesce(b.view_count, 0);

-- ── downloads ───────────────────────────────────────────────────────────────
--
-- The viewer key here is the account alone, not `coalesce(user_id,
-- session_hash)`: downloading requires a session, so `downloadCountedWithinWindow`
-- asks only about `user_id`, and a log row that lost its account to a cascade
-- delete cannot be attributed to anyone.

drop table if exists pg_temp.counter_repair_downloads;
create temporary table counter_repair_downloads (
  content_id uuid primary key,
  counted    bigint not null
);

do $$
declare
  r                record;
  current_content  uuid        := null;
  current_reader   uuid        := null;
  last_counted_at  timestamptz := null;
  running          bigint      := 0;
begin
  for r in
    select dl.content_id,
           dl.user_id,
           dl.downloaded_at
      from public.download_logs dl
      join public.books b on b.id = dl.content_id
     where dl.content_type = 'book'
       and dl.content_id is not null
       and dl.user_id is not null
       and dl.downloaded_at is not null
     order by dl.content_id, dl.user_id, dl.downloaded_at
  loop
    if current_content is distinct from r.content_id then
      if current_content is not null then
        insert into counter_repair_downloads (content_id, counted) values (current_content, running);
      end if;
      current_content := r.content_id;
      current_reader  := null;
      running         := 0;
    end if;

    if current_reader is distinct from r.user_id then
      current_reader  := r.user_id;
      last_counted_at := null;
    end if;

    if last_counted_at is null or r.downloaded_at >= last_counted_at + interval '24 hours' then
      running         := running + 1;
      last_counted_at := r.downloaded_at;
    end if;
  end loop;

  if current_content is not null then
    insert into counter_repair_downloads (content_id, counted) values (current_content, running);
  end if;
end;
$$;

update public.books b
   set download_count = d.counted
  from counter_repair_downloads d
 where d.content_id = b.id
   and d.counted > coalesce(b.download_count, 0);

drop table if exists pg_temp.counter_repair_views;
drop table if exists pg_temp.counter_repair_downloads;
