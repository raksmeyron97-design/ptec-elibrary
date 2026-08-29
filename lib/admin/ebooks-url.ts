/**
 * Client-safe URL helpers for the Book Management workspace (no "server-only"
 * import, unlike lib/admin/ebooks.ts, since this runs in the browser).
 *
 * The three canonical routes live here as constants so every link, redirect,
 * `basePath` and `revalidatePath` in the app reads from one place. They were
 * previously spelled out as string literals in nineteen call sites across the
 * sidebar, the dashboard, the KPI tiles and two server-action files, which is
 * why consolidating the three legacy book routes into this family had to
 * touch all of them at once.
 *
 * Every filter/search/sort control reads and writes through `withUpdatedParams`
 * so state is always reflected in the URL — shareable, bookmarkable, survives a
 * refresh.
 */

/** The collection workspace: search, filter, and act on every e-book. */
export const EBOOKS_BASE_PATH = "/admin/books";

/** The creation workflow (single + bulk). */
export const EBOOKS_UPLOAD_PATH = "/admin/books/upload";

/** The quality-control workflow. */
export const EBOOKS_DUPLICATES_PATH = "/admin/books/duplicates";

/** Where a pending-review upload lands — the queue, not the collection. */
export const EBOOKS_REVIEW_PATH = "/admin/review";

/** Deep-link into the workspace with filters pre-applied (KPI tiles, dashboard
 *  cards, the command palette). Empty values are dropped. */
export function ebooksFilterUrl(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${EBOOKS_BASE_PATH}?${qs}` : EBOOKS_BASE_PATH;
}

/** Open the upload form with the title prefilled — the "add the book readers
 *  searched for and did not find" path from the dashboard's search gaps. */
export function ebookUploadUrl(title?: string): string {
  const trimmed = title?.trim();
  return trimmed ? `${EBOOKS_UPLOAD_PATH}?title=${encodeURIComponent(trimmed)}` : EBOOKS_UPLOAD_PATH;
}

/**
 * Merge `updates` into `current`, dropping any key whose new value is
 * null/empty, and resetting `page` back to 1 whenever anything other than
 * `page` itself changes.
 */
export function withUpdatedParams(
  current: URLSearchParams,
  updates: Record<string, string | null | undefined>,
): string {
  const next = new URLSearchParams(current.toString());
  const pageTouched = "page" in updates && Object.keys(updates).length === 1;

  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === "") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
  }

  if (!pageTouched) next.delete("page");

  const qs = next.toString();
  return qs ? `${EBOOKS_BASE_PATH}?${qs}` : EBOOKS_BASE_PATH;
}
