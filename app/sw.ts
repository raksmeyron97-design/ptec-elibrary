import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig, RuntimeCaching } from "serwist";
import { Serwist, NetworkFirst, CacheFirst, StaleWhileRevalidate, ExpirationPlugin } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const customCaching: RuntimeCaching[] = [
  // Fallback for navigations to /~offline
  {
    matcher: ({ request, url }) => {
      // Don't intercept auth routes or api routes that aren't public
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
  // Cache public Supabase API GET requests for non-personalized data only.
  // Requests carrying an Authorization header contain RLS-filtered rows and
  // must NOT be served from cache to avoid leaking one user's data to another.
  {
    matcher: ({ request, url }) => {
      if (request.headers.get('authorization')) return false;
      const publicPaths = ['/rest/v1/books', '/rest/v1/catalog', '/rest/v1/posts', '/rest/v1/research'];
      return (
        url.hostname.endsWith('supabase.co') &&
        publicPaths.some((p) => url.pathname.includes(p)) &&
        request.method === 'GET'
      );
    },
    handler: new StaleWhileRevalidate({
      cacheName: 'supabase-api-cache',
      plugins: [
        new ExpirationPlugin({
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60, // 1 day
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
  // Cache book PDFs — limited to 12 entries / 30 days to avoid exhausting
  // device quota on low-end phones (PDFs can be 5-20 MB each).
  {
    matcher: ({ url }) =>
      url.pathname.endsWith('.pdf') ||
      url.pathname.includes('/storage/v1/object/public/') ||
      url.pathname.match(/^\/api\/books\/[^/]+\/file$/) !== null,
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

serwist.addEventListeners();
