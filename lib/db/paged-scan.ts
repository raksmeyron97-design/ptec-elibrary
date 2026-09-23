/**
 * Reading a whole result set out of PostgREST.
 *
 * PostgREST caps EVERY response at db-max-rows — 1000 here (`max_rows` in
 * supabase/config.toml, PGRST_DB_MAX_ROWS in infra/supabase/docker-compose.yml).
 * The cap is applied ON TOP OF the request's own `.limit()`, so a generous limit
 * does not defeat it: the response is silently clipped to 1000 rows, with no
 * error and no signal that anything was dropped. A `count: "exact", head: true`
 * request is NOT clipped — it returns no rows at all — which is why an exact
 * count of a table is trustworthy while a row scan of the same table is not.
 *
 * It applies to an `.in(...)` batch too: asking for 1,037 ids by name returns
 * the first 1000 of them. {@link chunked} is the fix there — several requests,
 * none of which can reach the cap.
 *
 * This module is deliberately free of any Supabase import: it takes a callback
 * and knows only about paging, so the rules below are unit-testable offline.
 * It lives in lib/db rather than lib/admin because the PUBLIC loaders need it:
 * the subject index, the author directory and the homepage subject tiles were
 * each built from the first 1000 of 1,956 published books, which understated
 * every subject count, held four hubs at `noindex` that clear the depth gate on
 * real counts, and left 223 author pages advertised nowhere
 * (SEO corpus audit, 2026-09-23, F-S1, F-A1).
 */

/** The server's own page size. Asking for more in one request does nothing. */
export const POSTGREST_MAX_ROWS = 1_000;

/** Enough of a PostgREST error to route on: callers branch on `code`. */
export type PagedScanError = { code?: string; message?: string };

export type PagedScanResult<T> = {
  data: T[];
  error: PagedScanError | null;
  /**
   * True when the scan stopped because it reached `maxRows`, not because the
   * set ran out — so `data` may be missing rows and is NOT a complete answer.
   *
   * Reported rather than thrown, because what a partial set means is the
   * caller's question: a repair queue can show what it found and say so, while
   * a public count must refuse to publish a number it cannot stand behind. The
   * one thing no caller may do is treat it as complete, which is the whole
   * defect this module exists to remove — so it is a field rather than
   * something you have to remember to compute from `data.length`.
   *
   * A set whose size is exactly `maxRows` reports `true`. That is the safe
   * direction: a false alarm costs a raised ceiling, a missed one costs a
   * silently wrong number.
   */
  truncated: boolean;
};

/**
 * Reads a result set one page at a time until it is exhausted or `maxRows` is
 * reached.
 *
 * Returns `{ data, error, truncated }` rather than throwing, because callers
 * branch on the PostgREST error CODE — a scan of `books` is retried without
 * `updated_at` (pre-0077) or the curation columns (pre-0149) on 42703, and a
 * rethrown Error would have discarded the code. It stops at the first failing
 * page and reports the error rather than returning a partial set that reads
 * like a complete one: subtracting a partial scan from a total is how a library
 * where every book had a PDF came to advertise 734 missing ones.
 *
 * The `page` callback MUST apply a stable ORDER BY. Postgres guarantees no row
 * order without one, so LIMIT/OFFSET pages may hand the same row to two pages
 * or to neither — and a row that goes missing between pages is indistinguishable
 * from a row that does not exist.
 */
export async function pagedScan<T>(
  // `data: unknown` rather than `T[] | null`: some callers select a column list
  // built at runtime, which postgrest-js cannot parse into a row type and
  // reports as GenericStringError[]. Those call sites cast after the await
  // already; the cast just moves inside.
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: PagedScanError | null }>,
  maxRows: number,
): Promise<PagedScanResult<T>> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += POSTGREST_MAX_ROWS) {
    const to = Math.min(from + POSTGREST_MAX_ROWS, maxRows) - 1;
    const { data, error } = await page(from, to);
    if (error) return { data: rows, error, truncated: false };
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    // A short page is the end of the set. A full one may not be, so ask again.
    if (batch.length < to - from + 1) return { data: rows, error: null, truncated: false };
  }
  return { data: rows, error: null, truncated: rows.length >= maxRows };
}

/**
 * How many ids to put in one `.in(...)` filter.
 *
 * Well under {@link POSTGREST_MAX_ROWS} so a batch can never be clipped, and
 * well under the URL length that makes PostgREST answer 414 — a batched `.in()`
 * travels in the query string.
 */
export const IN_FILTER_CHUNK = 500;

/**
 * Split a list of ids into batches small enough that no single request can be
 * clipped.
 *
 * `.in("id", ids)` looks bounded — you named the rows you want — which is
 * exactly why its truncation is hard to see. The author with 1,037 canonical
 * credits asked for all of them in one filter and was handed 1,000, and the
 * page then reported that as the author's complete works.
 */
export function chunked<T>(values: readonly T[], size: number = IN_FILTER_CHUNK): T[][] {
  if (size < 1) throw new Error("chunked(): size must be >= 1");
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}
