import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig, RuntimeCaching } from "serwist";
import { Serwist, NetworkFirst, CacheFirst, StaleWhileRevalidate, ExpirationPlugin } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Tables whose GET responses are safe to cache — they are public, non-personalized data.
// RLS-filtered tables (saved_books, reading_progress, profiles, etc.) must NOT be listed
// here, as serving cached rows to a different logged-in user would be a privacy violation.
const PUBLIC_REST_RE = /\/rest\/v1\/(books|catalog_books|posts|authors|categories|departments)(\?|$)/;

const customCaching: RuntimeCaching[] = [
  // Fallback for navigations to /~offline
  {
    matcher: ({ request, url }) => {
      if (url.pathname.startsWith('/api/auth') || url.pathname.startsWith('/auth')) return false;
      return request.mode === 'navigate';
    },
    handler: new NetworkFirst({
      cacheName: 'pages-cache',
      networkTimeoutSeconds: 5,
    }),
  },

  // Cache book cover images (Google Drive, OpenLibrary, Supabase, Amazon)
  {
    matcher: ({ request, url }) => {
      const isImage = request.destination === 'image';
      const isCoverDomain = [
        'lh3.googleusercontent.com',
        'covers.openlibrary.org',
        'images-na.ssl-images-amazon.com',
      ].includes(url.hostname) || url.hostname.endsWith('supabase.co');
      return isImage && isCoverDomain;
    },
    handler: new CacheFirst({
      cacheName: 'book-covers',
      plugins: [
        new ExpirationPlugin({
          maxEntries: 60,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          purgeOnQuotaError: true,
        }),
      ],
    }),
  },

  // Cache Next.js-optimized images (/_next/image?url=...). With the image
  // optimizer enabled, covers are fetched through this endpoint rather than
  // directly from the R2/CDN hosts matched above.
  {
    matcher: ({ url }) =>
      url.origin === self.location.origin && url.pathname === '/_next/image',
    handler: new CacheFirst({
      cacheName: 'next-image',
      plugins: [
        new ExpirationPlugin({
          maxEntries: 120,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          purgeOnQuotaError: true,
        }),
      ],
    }),
  },

  // Cache public Supabase REST GET responses for non-personalized tables only.
  // SKIP any request that carries an Authorization header — those are RLS-filtered
  // and serving one user's data to another on a shared device is a privacy violation.
  {
    matcher: ({ request, url }) => {
      if (request.headers.get('authorization')) return false;
      return (
        url.hostname.endsWith('supabase.co') &&
        request.method === 'GET' &&
        PUBLIC_REST_RE.test(url.pathname)
      );
    },
    handler: new StaleWhileRevalidate({
      cacheName: 'supabase-public-cache',
      plugins: [
        new ExpirationPlugin({
          maxEntries: 50,
          maxAgeSeconds: 6 * 60 * 60, // 6 hours
          purgeOnQuotaError: true,
        }),
      ],
    }),
  },

  // Cache PDF.js assets (worker, cmaps, standard fonts)
  {
    matcher: ({ url }) => /^\/pdf\/.*\.(mjs|js|bcmap|pfb|ttf|otf)$/.test(url.pathname),
    handler: new CacheFirst({
      cacheName: 'pdfjs-assets',
      plugins: [
        new ExpirationPlugin({
          maxEntries: 400,
          purgeOnQuotaError: true,
        }),
      ],
    }),
  },

  // Cache book PDFs for offline reading — limited to 12 entries / 30 days to avoid
  // exhausting device quota on low-end phones (PDFs can be 5-20 MB each).
  //
  // The /api/books/[slug]/file proxy returns Cache-Control: private, no-store; the SW
  // ignores that header and would silently cache private PDFs. To prevent serving one
  // user's private PDF to another on a shared device, we ONLY cache that proxy route when
  // the "Save offline" button explicitly appends ?offline=1.  Plain inline viewers
  // (which load /api/books/[slug]/file without the flag) are never cached.
  //
  // Public-storage .pdf URLs and /storage/v1/object/public/ paths are open data and are
  // safe to cache unconditionally.
  //
  // IMPORTANT: The "Save offline" UI (OfflineSaveButton) must request the URL with
  // ?offline=1 for this gate to work. See components/ui/pwa/OfflineSaveButton.tsx.
  {
    matcher: ({ url }) => {
      if (url.pathname.endsWith('.pdf')) return true;
      if (url.pathname.includes('/storage/v1/object/public/')) return true;
      // Proxy routes: only when the offline-save flag is present
      if (
        /^\/api\/(books|publications)\/[^/]+\/file$/.test(url.pathname) &&
        url.searchParams.get('offline') === '1'
      ) return true;
      return false;
    },
    handler: new CacheFirst({
      cacheName: 'offline-books',
      plugins: [
        new ExpirationPlugin({
          maxEntries: 12,
          maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
          purgeOnQuotaError: true,
        }),
      ],
    }),
  },

  ...defaultCache,
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: customCaching,
  fallbacks: {
    entries: [
      {
        url: '/~offline',
        matcher({ request }) {
          return request.destination === 'document';
        },
      },
    ],
  },
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
