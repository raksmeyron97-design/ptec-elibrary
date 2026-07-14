// ─────────────────────────────────────────────────────────────────────────────
// Service Worker caching policy — the *decisions*, kept out of the worker so
// they can be unit-tested (lib/sw-policy.test.ts). app/sw.ts wires them up.
//
// WHY THIS FILE EXISTS. The worker used to spread `...defaultCache` from
// @serwist/next, which ends with a chain of catch-alls:
//
//     { matcher: sameOrigin && pathname.startsWith("/api/"), method: "GET",
//       handler: NetworkFirst({ cacheName: "apis", maxEntries: 16 }) }
//     { matcher: sameOrigin && !pathname.startsWith("/api/"),
//       handler: NetworkFirst({ cacheName: "others" }) }
//     { matcher: !sameOrigin, handler: NetworkFirst({ cacheName: "cross-origin" }) }
//
// `/api/books/[slug]/file` streams a whole PDF, so *reading a book online* put
// the entire file into the "apis" cache. Sixteen entries x ~15 MB is the ~240 MB
// of Cache Storage that was measured in the field. It also meant the worker
// cached a route that returns `Cache-Control: private, no-store` (the SW does
// not honour that header — only an explicit rule can), and quietly defeated the
// `?offline=1` consent gate the offline-books rule was built around: a plain
// reader fetch simply fell through to the catch-all.
//
// The rules below are therefore an ALLOWLIST. Anything not matched is
// NetworkOnly. Never reintroduce a catch-all cache.
// ─────────────────────────────────────────────────────────────────────────────

/** Caches this worker owns. Anything else found at activate() is obsolete and
 *  gets deleted — that is how the ~240 MB is reclaimed from existing users. */
export const CACHES = {
  /** Public page navigations (HTML). Never admin/auth/dashboard. */
  pages: "ptec-pages-v3",
  /** Hashed build assets + fonts/CSS/JS. Content-addressed, safe to keep. */
  static: "ptec-static-v3",
  /** Book covers and other images, size-capped. */
  images: "ptec-images-v3",
  /** pdf.js worker, cmaps, standard fonts. */
  pdfjs: "ptec-pdfjs-v3",
  /** Anonymous Supabase REST reads of public tables only. */
  supabase: "ptec-supabase-public-v3",
  /**
   * Books the user explicitly chose to download.
   *
   * NAME IS LOAD-BEARING and deliberately unversioned: lib/offline.ts writes and
   * deletes entries here from the page, and existing users already have real
   * downloads in it. Renaming or purging it would silently destroy content
   * people saved for offline reading.
   */
  offlineBooks: "offline-books",
  /** Covers for downloaded books, written by lib/offline.ts. Same reasoning. */
  bookCovers: "book-covers",
} as const;

/** Caches that must survive a worker upgrade because they hold user-chosen
 *  content, not derived data. */
export const USER_OWNED_CACHES: string[] = [CACHES.offlineBooks, CACHES.bookCovers];

const OWNED = new Set<string>(Object.values(CACHES));

/**
 * Should this cache be deleted on activate?
 *
 * Allowlist, not denylist: every cache we do not own goes, which sweeps up both
 * the leaking ones ("apis", "cross-origin", "others", "pages-cache", …) and any
 * future junk. Serwist manages its own precache, so leave that alone.
 */
export function isObsoleteCache(name: string): boolean {
  if (OWNED.has(name)) return false;
  if (name.startsWith("serwist-precache")) return false;
  return true;
}

/** Route families that must never touch Cache Storage: they are session-scoped,
 *  their responses differ per user, and several carry Set-Cookie. */
const PRIVATE_PATH_RE =
  /^\/(admin|auth|dashboard|profile|lists)(\/|$)/;

/**
 * True when the request must go straight to the network and never be stored.
 *
 * ALL of /api is private by default — the opposite of the old default. Public
 * data reaches the browser through prerendered HTML/RSC, so there is no public
 * API worth caching here, and an allowlist that starts closed cannot leak the
 * next endpoint someone adds (/api/me, /api/notifications, /api/push/*, …).
 */
export function isPrivateRequest(input: {
  pathname: string;
  sameOrigin: boolean;
  hasAuthorizationHeader: boolean;
}): boolean {
  if (input.hasAuthorizationHeader) return true;
  if (!input.sameOrigin) return false; // cross-origin handled by its own rules
  if (input.pathname.startsWith("/api/")) return true;
  return PRIVATE_PATH_RE.test(input.pathname);
}

/** Book/publication file routes — the ones that stream whole PDFs. */
export const FILE_ROUTE_RE = /^\/api\/(books|publications|theses)\/[^/]+\/file(\.pdf)?$/;

/** A request for a large document (PDF/EPUB/…), wherever it is hosted. These are
 *  served from Cache Storage if the user downloaded them, but are NEVER written
 *  there automatically — only lib/offline.ts (a button press) stores one. */
export function isBookFileRequest(input: {
  pathname: string;
  sameOrigin: boolean;
}): boolean {
  if (input.sameOrigin && FILE_ROUTE_RE.test(input.pathname)) return true;
  return /\.(pdf|epub|docx|pptx|zip)$/i.test(input.pathname);
}

/** Supabase REST tables whose anonymous GETs are public, published data.
 *  RLS-filtered tables (profiles, saved_books, reading_progress, notifications…)
 *  must never appear here: a cached row served to the next user on a shared
 *  device is a privacy breach. */
export const PUBLIC_REST_RE =
  /\/rest\/v1\/(books|catalog_books|posts|authors|categories|departments)(\?|$)/;

/** Hard ceiling for anything cached automatically. Well above a cover or a JS
 *  chunk, well below a book. Belt-and-braces: even if a rule matched something
 *  it should not, a 15 MB body cannot enter a derived cache. */
export const MAX_AUTO_CACHE_BYTES = 2 * 1024 * 1024;

/**
 * May this response be stored in a *derived* (non-user-owned) cache?
 *
 * The SW does not honour Cache-Control on its own — a rule that matches will
 * cache a `private, no-store` response happily. This is the backstop that makes
 * the HTTP semantics real, and it is why /api/me being no-store actually means
 * something at this layer too.
 */
export function isCacheableResponse(res: {
  status: number;
  headers: { get(name: string): string | null };
}): boolean {
  // Only plain 200s. Opaque (status 0) responses are excluded on purpose: their
  // size is unknowable, and Chrome pads them to several MB each in quota
  // accounting, so a bounded maxEntries does not bound the storage.
  if (res.status !== 200) return false;

  if (res.headers.get("set-cookie")) return false;

  const cc = res.headers.get("cache-control")?.toLowerCase() ?? "";
  if (cc.includes("no-store") || cc.includes("private")) return false;

  const len = Number(res.headers.get("content-length") ?? "0");
  if (len > MAX_AUTO_CACHE_BYTES) return false;

  return true;
}
