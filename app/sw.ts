import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig, RuntimeCaching } from "serwist";
import { Serwist } from "serwist";

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
    handler: 'NetworkFirst',
    options: {
      cacheName: 'pages-cache',
      networkTimeoutSeconds: 5,
      fallbackOptions: {
        fallbackURL: '/~offline',
      },
    },
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
    handler: 'CacheFirst',
    options: {
      cacheName: 'book-covers',
      expiration: {
        maxEntries: 60,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      },
    },
  },
  // Cache Supabase API GET requests (excluding auth/mutations)
  {
    matcher: ({ request, url }) => {
      return url.hostname.endsWith('supabase.co') && 
             url.pathname.includes('/rest/v1/') && 
             request.method === 'GET';
    },
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: 'supabase-api-cache',
      expiration: {
        maxEntries: 50,
        maxAgeSeconds: 24 * 60 * 60, // 1 day
      },
    },
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
