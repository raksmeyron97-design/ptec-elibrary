/**
 * Client-safe URL query-param helpers for the Manage Posts page (no
 * "server-only" import, unlike lib/admin/posts.ts, since this runs in the
 * browser). Every filter/search/sort control reads and writes through here
 * so state is always reflected in the URL — shareable, bookmarkable,
 * survives a refresh.
 */

export const POSTS_BASE_PATH = "/admin/posts";

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
  return qs ? `${POSTS_BASE_PATH}?${qs}` : POSTS_BASE_PATH;
}
