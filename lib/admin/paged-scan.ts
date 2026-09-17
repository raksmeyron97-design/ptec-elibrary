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
 * This module is deliberately free of any Supabase import: it takes a callback
 * and knows only about paging, so the rules below are unit-testable offline.
 */

/** The server's own page size. Asking for more in one request does nothing. */
export const POSTGREST_MAX_ROWS = 1_000;

/** Enough of a PostgREST error to route on: callers branch on `code`. */
export type PagedScanError = { code?: string; message?: string };

export type PagedScanResult<T> = { data: T[]; error: PagedScanError | null };

/**
 * Reads a result set one page at a time until it is exhausted or `maxRows` is
 * reached.
 *
 * Returns `{ data, error }` rather than throwing, because callers branch on the
 * PostgREST error CODE — a scan of `books` is retried without `updated_at`
 * (pre-0077) or the curation columns (pre-0149) on 42703, and a rethrown Error
 * would have discarded the code. It stops at the first failing page and reports
 * the error rather than returning a partial set that reads like a complete one:
 * subtracting a partial scan from a total is how a library where every book had
 * a PDF came to advertise 734 missing ones.
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
    if (error) return { data: rows, error };
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    // A short page is the end of the set. A full one may not be, so ask again.
    if (batch.length < to - from + 1) break;
  }
  return { data: rows, error: null };
}
