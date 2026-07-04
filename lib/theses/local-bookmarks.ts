/**
 * Client-only "saved theses" list, stored in localStorage.
 *
 * There is no account-bound bookmark table for theses (unlike `saved_books`),
 * so this is intentionally per-browser rather than per-account. It exists to
 * back the card's Bookmark action without inventing server-side persistence
 * that isn't there yet.
 */

const STORAGE_KEY = "ptec_saved_theses";

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

export function isThesisBookmarked(id: string): boolean {
  return readAll().includes(id);
}

/** Toggles the id and returns the new bookmarked state. */
export function toggleThesisBookmark(id: string): boolean {
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
