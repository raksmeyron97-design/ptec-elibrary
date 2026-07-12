/**
 * Client-safe URL query-param helper for the admin Users page. Every
 * search/filter/sort control reads and writes state through the URL so it is
 * shareable, bookmarkable, and survives a refresh. Mirrors lib/admin/ebooks-url.ts.
 */

export const USERS_BASE_PATH = "/admin/users";

/**
 * Merge `updates` into `current`, dropping any key whose value is null/empty,
 * and resetting `page` to 1 whenever anything other than `page` itself changes.
 */
export function withUpdatedParams(
  current: URLSearchParams,
  updates: Record<string, string | null | undefined>,
): string {
  const next = new URLSearchParams(current.toString());
  const pageTouched = "page" in updates && Object.keys(updates).length === 1;

  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === "") next.delete(key);
    else next.set(key, value);
  }

  if (!pageTouched) next.delete("page");

  const qs = next.toString();
  return qs ? `${USERS_BASE_PATH}?${qs}` : USERS_BASE_PATH;
}
