// lib/recently-viewed.ts
// The books this device opened most recently, kept so the offline pages can
// still show them when the network is gone.
//
// Why this exists: book pages are served `private, no-store` (they carry
// per-reader state), so the service worker never caches them — offline, a
// reader who looked at a book yesterday would find no trace of it. Changing
// those headers is deliberately out of scope (stale per-reader HTML is the
// worse failure). Instead the book page records a tiny public summary here —
// slug, title, author, cover URL — newest first, capped at MAX_RECENT, and
// /~offline and /offline-books list it. A cover loaded while online may come
// back from the image cache (app/sw.ts rule 7); when it does not, the list's
// cover falls back to the generated one.
//
// Device-local, like recent searches (lib/recent-searches.ts): nothing here
// leaves the browser, and it holds only what any visitor can see on a public
// book page. Every storage access is guarded — private mode, a full quota or
// disabled storage must never break the page that records or reads it.

export const RECENTLY_VIEWED_KEY = "ptec.recentlyViewed";
export const MAX_RECENT = 12;

export type RecentBook = {
  slug: string;
  title: string;
  author?: string | null;
  coverUrl?: string | null;
  /** Epoch ms of the most recent view. */
  viewedAt: number;
};

function isRecentBook(value: unknown): value is RecentBook {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.slug === "string" && v.slug.length > 0 && typeof v.title === "string" && typeof v.viewedAt === "number";
}

export function readRecentlyViewed(): RecentBook[] {
  try {
    const raw = window.localStorage.getItem(RECENTLY_VIEWED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isRecentBook).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

/** Move (or add) a book to the front of the list. Returns the new list. */
export function recordRecentlyViewed(book: Omit<RecentBook, "viewedAt">, now: number = Date.now()): RecentBook[] {
  if (!book.slug || !book.title) return readRecentlyViewed();
  const entry: RecentBook = {
    slug: book.slug,
    title: book.title,
    author: book.author ?? null,
    coverUrl: book.coverUrl ?? null,
    viewedAt: now,
  };
  const next = [entry, ...readRecentlyViewed().filter((b) => b.slug !== book.slug)].slice(0, MAX_RECENT);
  try {
    window.localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next));
  } catch {
    // Storage full or unavailable — the list is a convenience, never a failure.
  }
  return next;
}

export function clearRecentlyViewed(): void {
  try {
    window.localStorage.removeItem(RECENTLY_VIEWED_KEY);
  } catch {
    // Nothing to clear.
  }
}
