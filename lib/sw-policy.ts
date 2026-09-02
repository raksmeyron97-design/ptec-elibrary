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

/**
 * The offline shell (app/~offline/page.tsx).
 *
 * MUST be precached explicitly. Serwist's `fallbacks` option only *names* this
 * URL as the document fallback — it does not add it to the precache — and
 * @serwist/next does not either, because it lives under app/ rather than
 * public/. Verified against a real install: the precache held the route's JS
 * chunks (/_next/static/chunks/app/~offline/*) but not the page, so
 * `caches.match("/~offline")` missed and every offline navigation to an
 * uncached route died with the browser's own network error instead of the
 * branded offline screen.
 *
 * It also has to bypass the locale rewrite in middleware.ts — it sits outside
 * the [locale] segment — or the install fetch 404s and takes the whole service
 * worker registration down with it.
 */
export const OFFLINE_FALLBACK_URL = "/~offline";

/**
 * Pages that must be able to BOOT with no network — the offline library and the
 * offline reader, in both locales.
 *
 * `/~offline` above is the generic "you have no connection" screen. These are
 * different in kind: they are working surfaces over content already on the
 * device, so serving them the apology page would be a bug. They are precached
 * as documents for the same reason /~offline is (nothing else adds an app/
 * route to the manifest), and their JS chunks come from the build manifest, so
 * an installed worker always holds an HTML+chunk pair from ONE build.
 *
 * Locale-prefixed rather than locale-agnostic: a precached document carries the
 * server-rendered messages of the locale it was fetched for, so Khmer readers
 * need their own copy. English is unprefixed (localePrefix: "as-needed").
 */
export const OFFLINE_SHELL_URLS = [
  "/offline-books",
  "/km/offline-books",
  "/offline-reader",
  "/km/offline-reader",
] as const;

/**
 * Which precached shell answers this navigation, if any.
 *
 * The reader is addressed as `/offline-reader?id=<bookId>`: the book id is in
 * the query string precisely so that ONE prerendered document can serve every
 * saved book (a `[bookId]` segment would need a precache entry per book). The
 * shell reads the id from the URL on the client, so substituting it for any
 * `/offline-reader` URL is correct rather than a compromise.
 */
export function offlineShellFor(pathname: string): string | null {
  const clean = pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
  return (OFFLINE_SHELL_URLS as readonly string[]).includes(clean) ? clean : null;
}

/**
 * A revision string for entries we add ourselves, derived from the injected
 * build manifest.
 *
 * `revision: null` would mark the offline shell immutable and it would never
 * update again; hashing the manifest means it changes exactly when the build
 * does. FNV-1a, run once at worker startup over ~370 short strings.
 */
export function manifestRevision(entries: readonly (string | { url: string; revision?: string | null })[]): string {
  let hash = 0x811c9dc5;
  for (const entry of entries) {
    const text = typeof entry === "string" ? entry : `${entry.url}${entry.revision ?? ""}`;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return (hash >>> 0).toString(36);
}

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

/**
 * Should this precache entry be installed?
 *
 * @serwist/next globs ALL of public/ into the precache, so every file dropped
 * in there is downloaded by every visitor on first load whether or not it is
 * ever used. That silently grew the install to 11 MB. The plugin offers no way
 * to exclude a public file — `exclude` only sees webpack assets, and
 * @serwist/build appends public entries AFTER every manifestTransform — so the
 * filtering happens here instead, on `self.__SW_MANIFEST` inside the worker.
 *
 * Only two families are dropped, both for reasons specific to them:
 *
 *   • /pdf/cmaps/** (169 files, 1.6 MB) — CJK character maps. This library's
 *     collection is Khmer and English; a reader who opens a PDF that needs one
 *     gets it from the network, and runtime rule 5 in app/sw.ts (CacheFirst on
 *     /pdf/*.bcmap) keeps it from then on. Precaching all 169 up front to serve
 *     approximately none of them is the worst trade in the manifest.
 *
 *   • /pwa/splash/** — iOS launch images. iOS reads an
 *     apple-touch-startup-image while showing the splash, BEFORE the page and
 *     therefore the worker are running, so the worker can never serve one.
 *     Precaching them is pure waste.
 *
 *   • Files the page never requests. Measured from a real install: the
 *     precache held ~1.5 MB of images no runtime code fetches. Open Graph
 *     images are read by social crawlers off an absolute URL; the schema.org
 *     logo is a JSON-LD string, not an <img>; ptec-library*.jpg are the SOURCE
 *     images scripts/optimize-hero.mjs derives /hero/* from; logo_footer.png
 *     and og-default.jpg have no references at all. None of them can reach the
 *     worker, so precaching them only costs install bandwidth.
 *
 * DELIBERATELY STILL PRECACHED: /pdf/pdf.worker.min.mjs (nothing renders
 * without it) and /pdf/standard_fonts/** (PDFs that embed no fonts render with
 * the wrong glyphs without these, and offline reading is a shipped feature —
 * 800 KB is the price of it working). Also /favicon/web-app-manifest-192x192.png,
 * which app/sw.ts uses as the DEFAULT push notification icon and therefore has
 * to be able to serve while offline — do not "tidy" it away with the 512.
 */
const NEVER_PRECACHED = [
  "/pdf/cmaps/",
  "/pwa/splash/",
] as const;

/** Exact paths in public/ that no runtime request ever asks the worker for. */
const UNREACHABLE_FROM_THE_PAGE = new Set([
  "/og-default.png", // Open Graph — fetched by crawlers off an absolute URL
  "/og-default.jpg", // no references at all
  "/logo.png", // JSON-LD "logo"/"image" string in RootShell, never an <img>
  "/logo_footer.png", // no references (the .webp is what the footer renders)
  "/ptec-library.jpg", // hero SOURCE image for scripts/optimize-hero.mjs
  "/ptec-library-opt.jpg", // ditto
  "/favicon/web-app-manifest-512x512.png", // read by the OS at install, over HTTP
  "/googlee89036a09f36e87d.html", // Search Console verification file
]);

export function shouldPrecache(url: string): boolean {
  if (NEVER_PRECACHED.some((prefix) => url.startsWith(prefix))) return false;
  if (UNREACHABLE_FROM_THE_PAGE.has(url)) return false;
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
