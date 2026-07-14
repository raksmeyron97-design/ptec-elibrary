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
  // "Save offline", which calls cache.add() from the page (lib/offline.ts).
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

  // ── 2. Private: session-scoped, per-user, or Set-Cookie-bearing. ──────────
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

  // ── 3. Public page navigations. ──────────────────────────────────────────
  // Private paths were already taken by rule 1, so this only ever sees public
  // pages. NetworkFirst keeps content fresh and gives the offline shell a
  // fallback.
  {
    matcher: ({ request }) => request.mode === "navigate",
    handler: new NetworkFirst({
      cacheName: CACHES.pages,
      networkTimeoutSeconds: 5,
      plugins: [
        guard,
        new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 24 * 60 * 60, purgeOnQuotaError: true }),
        tolerateStorageFailure,
      ],
    }),
  },

  // ── 4. Hashed build output. Content-addressed, so CacheFirst is safe. ─────
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

  // ── 5. pdf.js worker, cmaps, standard fonts. ─────────────────────────────
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

  // ── 6. Images (book covers, logos). Size-capped by `guard`. ──────────────
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

  // ── 7. Anonymous Supabase reads of public tables only. ───────────────────
  // Requests carrying an Authorization header were already claimed by rule 1,
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

  // ── 8. Everything else: network, never stored. ───────────────────────────
  { matcher: () => true, handler: new NetworkOnly() },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
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
self.addEventListener("message", (event) => {
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
