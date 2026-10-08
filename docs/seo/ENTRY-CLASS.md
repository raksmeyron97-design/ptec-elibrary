# Entry class: how a session began (WI-3)

SEO audit 2026-10, WI-3 / P2-10. Migration `0173_entry_class.sql`.

## What is recorded

`view_logs.entry_class` (book detail views) and `reader_open_logs.entry_class`
(reader opens) hold ONE of five classes, or NULL:

| Class | Landing referrer host |
|---|---|
| `search` | `google.*`, `bing.com`, `duckduckgo.com`, `yahoo.*`, `yandex.*`, `baidu.com` |
| `social` | `facebook.com`, `m.`/`l.`/`lm.facebook.com`, `t.me`, `telegram.org` |
| `referral` | any other host |
| `direct` | no referrer |
| `internal` | this site |

The class is decided **in the browser, on the page the tab landed on**
(`lib/analytics/entry-class.ts`, `landingEntryClass()`), and kept in one
sessionStorage key (`ptec.entry`) for the life of the tab. A book opened three
clicks after a Google landing is therefore `search`. A Server Action could not
decide this: its `Referer` is the page that called it.

Only the class is stored, in the browser and in the database. Never the
referrer URL, its host, or a path: a referrer can carry the visitor's search
words. `lib/analytics/entry-class.test.ts` scans every analytics writer for a
referrer field.

NULL means "not recorded": rows from before 0173, a browser that blocks
storage and gives no referrer, or `ENTRY_CLASS=off` (the rollback switch).

## K-E1: search-landed book views, and how many of those sessions opened a reader

`session_hash` is a keyed hash of ip + user agent that **rotates every UTC
day** (`anonymousSessionHash`, `lib/search/analytics.ts`). It identifies a
visitor within a day and never across days, so the query buckets by UTC day
and matches views to reader opens within the same day only.

Written from the definition in the master prompt (the Gate 5 document's own
SQL was not available when this was written).

```sql
with search_views as (
  select (viewed_at at time zone 'UTC')::date as day, session_hash
    from public.view_logs
   where content_type = 'book'
     and entry_class = 'search'
     and session_hash is not null
),
opens as (
  select distinct (opened_at at time zone 'UTC')::date as day, session_hash
    from public.reader_open_logs
   where session_hash is not null
)
select v.day,
       count(*)                                        as search_landed_book_views,
       count(distinct v.session_hash)                  as search_sessions,
       count(distinct v.session_hash)
         filter (where o.session_hash is not null)     as sessions_that_opened_a_reader,
       round(100.0 * count(distinct v.session_hash) filter (where o.session_hash is not null)
             / nullif(count(distinct v.session_hash), 0), 1) as opened_pct
  from search_views v
  left join opens o on o.day = v.day and o.session_hash = v.session_hash
 group by v.day
 order by v.day desc;
```

Two caveats when reading it:
- A signed-in reader is counted by `session_hash` like everyone else. The
  reader route redirects an anonymous visitor to sign in, and a sign-in
  changes neither the ip nor the user agent, so the hash survives it.
- Clicks in Search Console are not visits. Expect search-class views per day
  within about 2× of GSC clicks per day, not equal to them.
