/**
 * Client-safe URL query-param helpers for the Announcement Center — mirrors
 * lib/admin/posts-url.ts so filter/search/sort state is always reflected in
 * the URL (shareable, bookmarkable, survives a refresh).
 */

export const ANNOUNCEMENTS_BASE_PATH = "/admin/announcements";

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
  return qs ? `${ANNOUNCEMENTS_BASE_PATH}?${qs}` : ANNOUNCEMENTS_BASE_PATH;
}
