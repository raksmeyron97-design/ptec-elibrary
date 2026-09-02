import type { PrecacheEntry, SerwistGlobalConfig, RuntimeCaching } from "serwist";
import {
  Serwist,
  NetworkFirst,
  NetworkOnly,
  CacheFirst,
  StaleWhileRevalidate,
  ExpirationPlugin,
  RangeRequestsPlugin,
} from "serwist";
import {
  CACHES,
  PUBLIC_REST_RE,
  isBookFileRequest,
  isCacheableResponse,
  isObsoleteCache,
  isPrivateRequest,
  manifestRevision,
  OFFLINE_FALLBACK_URL,
  OFFLINE_SHELL_URLS,
  offlineShellFor,
  shouldPrecache,
} from "@/lib/sw-policy";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// ─────────────────────────────────────────────────────────────────────────────
// CACHING POLICY — read lib/sw-policy.ts first. It explains why `defaultCache`
// from @serwist/next is NOT spread in here any more: its trailing catch-alls
// ("apis", "others", "cross-origin") cached every same-origin /api GET, which
// meant reading a book online stored the whole PDF. That was the ~240 MB of
// Cache Storage measured in the field.
//
// The rules below are an ALLOWLIST and the last one is NetworkOnly. Anything not
// explicitly listed goes to the network and is never stored. Do not add a
// catch-all.
// ─────────────────────────────────────────────────────────────────────────────

/** Refuse to store anything private, oversized, or not a clean 200 — even if a
 *  rule above matched it by mistake. The SW ignores Cache-Control by default;
 *  this is what makes `private, no-store` mean something down here. */
const guard = {
  cacheWillUpdate: async ({ response }: { response: Response }) =>
    isCacheableResponse(response) ? response : null,
};

/** Storage can be full, disabled, or evicted at any moment. A failed cache write
 *  must never turn into a failed page — swallow it and let the network answer. */
const tolerateStorageFailure = {
  handlerDidError: async () => undefined,
};

/** The injected manifest, minus the families lib/sw-policy.ts refuses to
 *  install. Filtering here is the only hook that exists — @serwist/next globs
 *  all of public/ into the precache and offers no way to opt a file out. See
 *  shouldPrecache() for what is dropped and why. */
const buildManifest = (self.__SW_MANIFEST ?? []).filter((entry) =>
  shouldPrecache(typeof entry === "string" ? entry : entry.url),
);

/** ...plus the offline shell, which nothing else adds. `fallbacks` below only
 *  NAMES it; without this entry the fallback resolves to nothing and an
 *  offline navigation shows the browser's network error. */
const buildRevision = manifestRevision(buildManifest);
const precacheEntries: (PrecacheEntry | string)[] = [
  ...buildManifest,
  { url: OFFLINE_FALLBACK_URL, revision: buildRevision },
  // ...and the two offline WORKING surfaces (library + reader, per locale).
  // Same mechanism, different purpose: /~offline apologises for the network,
  // these two open books that are already on the device. Precaching the
  // documents is what lets them boot cold with the radio off — a NetworkFirst
  // page cache only holds pages this visitor happened to open while online.
  ...OFFLINE_SHELL_URLS.map((url) => ({ url, revision: buildRevision })),
];

const runtimeCaching: RuntimeCaching[] = [
  // ── 1. Book files (PDF/EPUB/…): READ from cache, NEVER write. ─────────────
  // FIRST on purpose. These live under /api, so the private NetworkOnly rule
  // below would otherwise claim them — and then a book the user downloaded
  // could never be read back offline (verified: it silently broke offline
  // reading). Putting it first is safe precisely BECAUSE it cannot write:
  // `cacheWillUpdate: () => null` is the hard switch. It can only ever hand
  // back a file this same user explicitly downloaded.
  //
  // This is the rule that used to leak. Merely *reading* a book online now
  // stores nothing; a book enters Cache Storage only when the user presses
  // "Save offline", which fetches it and cache.put()s the verified bytes from
  // the page (downloadOfflineBook in lib/offline.ts).
  //
  // - ignoreSearch: the download is stored as `…/file?offline=1`, but the reader
  //   requests the bare `…/file`. Without this the saved copy is never found.
  // - RangeRequestsPlugin: pdf.js fetches byte ranges; this serves 206s out of
  //   the stored full response instead of failing or refetching the whole book.
  {
    matcher: ({ url, sameOrigin }) =>
      isBookFileRequest({ pathname: url.pathname, sameOrigin }),
    handler: new CacheFirst({
      cacheName: CACHES.offlineBooks,
      matchOptions: { ignoreSearch: true },
      plugins: [
        new RangeRequestsPlugin(),
        { cacheWillUpdate: async () => null },
        tolerateStorageFailure,
      ],
    }),
  },

  // ── 2. Offline library + offline reader: always answerable. ──────────────
  // Before the generic navigation rule, and before the fallback can claim
  // these: showing "you're offline" on the page whose entire job is to open
  // downloaded books would be the exact failure this route exists to fix.
  //
  // Network first, because online these pages should reflect the current
  // deployment. Offline, the precached shell answers — including for
  // `/offline-reader?id=<bookId>`, which the precache route itself cannot match
  // (its URL carries a query string, and serwist only ignores utm_/fbclid).
  // The shell is id-independent by design; the page reads the id on the client.
  {
    matcher: ({ request, url, sameOrigin }) =>
      sameOrigin &&
      request.mode === "navigate" &&
      offlineShellFor(url.pathname) !== null,
    handler: async ({ request, url, event }) => {
      try {
        // navigationPreload is on, so the browser already started this request
        // while the worker was booting. Consuming it avoids a second fetch and
        // the "preload response not used" warning.
        const preloaded = (await (event as FetchEvent).preloadResponse) as
          | Response
          | undefined;
        const fresh = preloaded ?? (await fetch(request));
        if (fresh && (fresh.ok || fresh.type === "opaqueredirect")) return fresh;
      } catch {
        // No network — that is the case this rule exists for.
      }
      const shell = offlineShellFor(url.pathname);
      // ignoreSearch: precache entries are keyed with a __WB_REVISION__ param.
      const cached = shell
        ? await caches.match(shell, { ignoreSearch: true })
        : undefined;
      return (
        cached ??
        (await caches.match(OFFLINE_FALLBACK_URL, { ignoreSearch: true })) ??
        Response.error()
      );
    },
  },

  // ── 3. Private: session-scoped, per-user, or Set-Cookie-bearing. ──────────
  // Everything under /api (including /api/me, /api/push/*, /api/notifications),
  // plus /admin, /auth, /dashboard, /profile, /lists. `/admin/login` really was
  // landing in Cache Storage before this rule existed.
  {
    matcher: ({ request, url, sameOrigin }) =>
      isPrivateRequest({
        pathname: url.pathname,
        sameOrigin,
        hasAuthorizationHeader: !!request.headers.get("authorization"),
      }),
    handler: new NetworkOnly(),
  },

  // ── 4. Public page navigations. ──────────────────────────────────────────
  // Private paths were already taken by rule 3, so this only ever sees public
  // pages. NetworkFirst keeps content fresh and gives the offline shell a
  // fallback.
  //
  // The timeout is the launch budget for an installed app on a bad connection:
  // it is how long the user stares at the platform splash before the worker
  // gives up and serves the last good copy of the page. Five seconds was long
  // enough to read as "broken". Three still clears a normal slow-4G document
  // (measured ~1.2 s for the 84 KB gzipped homepage) with headroom, while
  // capping the worst case a user can actually feel.
  //
  // `navigationPreload: true` below is what keeps this from being a dead wait:
  // the browser starts the network request while the worker is still booting,
  // and serwist's StrategyHandler consumes event.preloadResponse for navigate
  // requests instead of issuing a second fetch.
  {
    matcher: ({ request }) => request.mode === "navigate",
    handler: new NetworkFirst({
      cacheName: CACHES.pages,
      networkTimeoutSeconds: 3,
      plugins: [
        guard,
        // 16, not 32. Only prerendered pages ever land here — every dynamic
        // public route (/books, /theses, /publications, /posts) answers with
        // `private, no-cache, no-store`, which `guard` refuses — and a measured
        // page is 300-600 KB of HTML+RSC payload. At 32 entries against the
        // 2 MB per-entry cap the ceiling was 64 MB, and ~14 MB realistically,
        // on a derived cache holding content the network can always re-supply.
        // 16 still covers a session's worth of static pages for offline.
        new ExpirationPlugin({ maxEntries: 16, maxAgeSeconds: 24 * 60 * 60, purgeOnQuotaError: true }),
        // NO `tolerateStorageFailure` HERE, and that is load-bearing. Serwist
        // attaches its offline fallback plugin only to strategies that have no
        // plugin defining handlerDidError:
        //
        //   if (handler instanceof Strategy &&
        //       !handler.plugins.some((p) => "handlerDidError" in p))
        //     handler.plugins.push(fallbackPlugin);
        //
        // `tolerateStorageFailure` is exactly such a plugin, so listing it here
        // silently disabled `fallbacks` for navigations — verified offline:
        // every uncached route died with the browser's network error instead of
        // /~offline. The fallback plugin subsumes what it was doing anyway: any
        // handler error now resolves to the offline shell rather than throwing.
      ],
    }),
  },

  // ── 5. Hashed build output. Content-addressed, so CacheFirst is safe. ─────
  {
    matcher: ({ url, sameOrigin }) =>
      sameOrigin && url.pathname.startsWith("/_next/static/"),
    handler: new CacheFirst({
      cacheName: CACHES.static,
      plugins: [
        guard,
        new ExpirationPlugin({ maxEntries: 96, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true }),
        tolerateStorageFailure,
      ],
    }),
  },

  // ── 6. pdf.js worker, cmaps, standard fonts. ─────────────────────────────
  {
    matcher: ({ url, sameOrigin }) =>
      sameOrigin && /^\/pdf\/.*\.(mjs|js|bcmap|pfb|ttf|otf)$/.test(url.pathname),
    handler: new CacheFirst({
      cacheName: CACHES.pdfjs,
      plugins: [
        guard,
        new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true }),
        tolerateStorageFailure,
      ],
    }),
  },

  // ── 7. Images (book covers, logos). Size-capped by `guard`. ──────────────
  // Opaque cross-origin responses are rejected by the guard (status 0): their
  // size is unknowable and Chrome pads them to megabytes each in quota
  // accounting, so maxEntries alone would not bound storage.
  {
    matcher: ({ request }) => request.destination === "image",
    handler: new CacheFirst({
      cacheName: CACHES.images,
      plugins: [
        guard,
        new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true }),
        tolerateStorageFailure,
      ],
    }),
  },

  // ── 8. Anonymous Supabase reads of public tables only. ───────────────────
  // Requests carrying an Authorization header were already claimed by rule 3,
  // so an RLS-filtered row cannot reach this cache and be replayed to the next
  // user on a shared device.
  {
    matcher: ({ request, url }) =>
      url.hostname.endsWith("supabase.co") &&
      request.method === "GET" &&
      PUBLIC_REST_RE.test(url.pathname),
    handler: new StaleWhileRevalidate({
      cacheName: CACHES.supabase,
      plugins: [
        guard,
        new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 6 * 60 * 60, purgeOnQuotaError: true }),
        tolerateStorageFailure,
      ],
    }),
  },

  // ── 9. Everything else: network, never stored. ───────────────────────────
  { matcher: () => true, handler: new NetworkOnly() },
];

const serwist = new Serwist({
  precacheEntries,
  // ── skipWaiting is OFF on purpose. ───────────────────────────────────────
  // With it on, a deploy activated the new worker under open pages the moment
  // it installed. Those pages are still running the OLD build, and their lazy
  // route chunks are hashed per build — so the next navigation inside a page
  // someone had open could ask for a chunk the new deployment no longer has.
  // Reading a PDF, filling a form or editing in the admin panel are exactly
  // when that is least acceptable.
  //
  // Now the new worker installs and WAITS. components/pwa/UpdateAvailable.tsx
  // notices it and offers an Update button; only that button (or closing every
  // tab) hands over, via the SKIP_WAITING message handled below. Nothing
  // reloads under the user.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: OFFLINE_FALLBACK_URL,
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

// ── Reclaim the leaked storage from existing users. ─────────────────────────
// Every cache this worker does not own is deleted on activate — which is what
// removes the old "apis" cache (the one holding hundreds of MB of PDFs) plus
// "others", "cross-origin", "pages-cache", "pages-rsc*" and the rest of the
// abandoned defaultCache names. Books the user actually chose to download live
// in "offline-books"/"book-covers" and are explicitly preserved
// (USER_OWNED_CACHES in lib/sw-policy.ts) — an upgrade must not destroy content
// someone saved.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const names = await caches.keys();
        await Promise.all(
          names.filter(isObsoleteCache).map((name) => caches.delete(name)),
        );
      } catch {
        // Storage unavailable — nothing to reclaim, and the app works regardless.
      }
    })(),
  );
});

// ── Sign-out / account switch. ──────────────────────────────────────────────
// The page posts this after the session is torn down. Derived caches can hold a
// page rendered for the previous account, so they go. Downloaded books are left
// alone: they are user-chosen content, and lib/offline.ts owns their lifecycle.
// ── User-approved update. ───────────────────────────────────────────────────
// The only way a waiting worker ever takes over, since skipWaiting is off. The
// page posts this from the Update button and reloads on `controllerchange`.
// Only this origin's own pages can drive the service worker — a page from
// another origin cannot normally reach it (a service worker's message port
// is scoped to clients it controls), but nothing here should depend on that
// alone: verify explicitly rather than trust an unauthenticated postMessage.
function isTrustedClientOrigin(event: ExtendableMessageEvent): boolean {
  return event.origin === self.location.origin;
}

self.addEventListener("message", (event) => {
  if (!isTrustedClientOrigin(event)) return;
  if ((event.data as { type?: string } | null)?.type !== "SKIP_WAITING") return;
  self.skipWaiting();
});

self.addEventListener("message", (event) => {
  if (!isTrustedClientOrigin(event)) return;
  if ((event.data as { type?: string } | null)?.type !== "CLEAR_PRIVATE_CACHES") return;
  event.waitUntil(
    (async () => {
      try {
        await Promise.all([
          caches.delete(CACHES.pages),
          caches.delete(CACHES.supabase),
        ]);
      } catch {
        // Nothing to do — worst case the next navigation refetches from network.
      }
    })(),
  );
});

type PushNotificationPayload = {
  type?: string;
  title?: string;
  body?: string;
  url?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  entityId?: string;
  eventId?: string;
};

const DEFAULT_NOTIFICATION = {
  title: "PTEC Library",
  body: "A new update is available from PTEC Library.",
  url: "/",
  icon: "/favicon/web-app-manifest-192x192.png",
  badge: "/favicon/favicon-96x96.png",
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function cleanText(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function safePath(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_NOTIFICATION.url;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2000) return DEFAULT_NOTIFICATION.url;

  try {
    const url = new URL(trimmed, self.location.origin);
    if (url.origin !== self.location.origin) return DEFAULT_NOTIFICATION.url;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_NOTIFICATION.url;
  }
}

function parsePushPayload(event: PushEvent): PushNotificationPayload {
  if (!event.data) return {};

  try {
    return asRecord(event.data.json()) as PushNotificationPayload;
  } catch {
    try {
      const text = event.data.text();
      return text ? { body: text } : {};
    } catch {
      return {};
    }
  }
}

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    const payload = parsePushPayload(event);
    const title = cleanText(payload.title, DEFAULT_NOTIFICATION.title, 120);
    const body = cleanText(payload.body, DEFAULT_NOTIFICATION.body, 500);
    const destination = safePath(payload.url);
    const eventId = cleanText(payload.eventId, "", 160);
    const tag = cleanText(payload.tag, eventId || `ptec-library-${payload.type ?? "update"}`, 120);

    await self.registration.showNotification(title, {
      body,
      icon: cleanText(payload.icon, DEFAULT_NOTIFICATION.icon, 2000),
      badge: cleanText(payload.badge, DEFAULT_NOTIFICATION.badge, 2000),
      tag,
      data: {
        url: destination,
        type: cleanText(payload.type, "BROADCAST", 40),
        entityId: cleanText(payload.entityId, "", 160),
        eventId,
      },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil((async () => {
    const data = asRecord(event.notification.data);
    const destination = safePath(data.url);
    const targetUrl = new URL(destination, self.location.origin).href;
    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });

    for (const client of windows) {
      const windowClient = client as WindowClient;
      if (new URL(windowClient.url).origin !== self.location.origin) continue;
      if ("navigate" in windowClient) {
        await windowClient.navigate(targetUrl);
      }
      await windowClient.focus();
      return;
    }

    await self.clients.openWindow(targetUrl);
  })());
});

serwist.addEventListeners();
