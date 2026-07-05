/**
 * Client-only "saved publications" list, stored in localStorage.
 *
 * There is no account-bound bookmark table for publications (unlike
 * `saved_books`), so this is intentionally per-browser rather than
 * per-account. Mirrors `lib/theses/local-bookmarks.ts`.
 */

const STORAGE_KEY = "ptec_saved_publications";

function readAll(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeAll(ids: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable (private mode, quota) — bookmark silently no-ops */
  }
}

export function isPublicationBookmarked(id: string): boolean {
  return readAll().includes(id);
}

/** Toggles the id and returns the new bookmarked state. */
export function togglePublicationBookmark(id: string): boolean {
  const ids = readAll();
  const idx = ids.indexOf(id);
  if (idx === -1) {
    ids.push(id);
    writeAll(ids);
    return true;
  }
  ids.splice(idx, 1);
  writeAll(ids);
  return false;
}
