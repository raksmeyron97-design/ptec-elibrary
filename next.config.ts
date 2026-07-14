import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import withNextIntl from 'next-intl/plugin';

const withNextIntlPlugin = withNextIntl('./i18n/request.ts');

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

// CSP is set per-request in proxy.ts (includes a per-request nonce).
// Only set the non-CSP security headers here — having two CSP headers causes
// the browser to enforce the intersection (most restrictive) of both.
const securityHeaders = [
  // DENY matches the CSP's frame-ancestors 'none' (nothing on the site is
  // framed; the only iframes are outbound embeds like Google Maps).
  { key: "X-Frame-Options",           value: "DENY" },
  { key: "X-Content-Type-Options",    value: "nosniff" },
  { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy",        value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  // allow-popups: OAuth and share flows may open windows; plain same-origin
  // would sever their opener handle. Still isolates our browsing context group.
  { key: "Cross-Origin-Opener-Policy",   value: "same-origin-allow-popups" },
  // Nothing on this origin is meant to be embedded as a subresource elsewhere.
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

const nextConfig: NextConfig = {
  // Self-contained server bundle for the ZimaOS Docker image (Dockerfile
  // copies .next/standalone). Harmless elsewhere: `next start` and Vercel
  // deployments ignore it.
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
    // There is no single app/layout.tsx any more (the public tree owns its own
    // <html> so it can read the locale from params instead of headers()), so
    // unmatched routes need a root-layout-free 404 page: app/global-not-found.tsx.
    globalNotFound: true,
    // Lets i18n/request.ts read the [locale] segment of app/[locale]/layout.tsx
    // (a ROOT layout since the split) without touching headers(). next-intl's
    // setRequestLocale() does not survive across route segments here — verified:
    // getLocale() returned "en" on /km/home even immediately after
    // setRequestLocale("km") in the same layout — and every other way of
    // resolving the locale server-side is a dynamic API that would un-cache the
    // whole public tree. Root params are params, so they are prerender-safe.
    rootParams: true,
  },
  // pdfjs is loaded lazily by lib/pdf-page-index.ts for server-side text
  // extraction; keep it out of the server bundle (worker/canvas quirks).
  serverExternalPackages: ["pdfjs-dist"],
  turbopack: {},
  async rewrites() {
    return {
      beforeFiles: [
        // Allow Google Scholar to fetch PDFs from a .pdf-suffixed URL
        // while the in-app viewer keeps using /file (no suffix needed there).
        {
          source: "/api/theses/:id/file.pdf",
          destination: "/api/theses/:id/file",
        },
      ],
    };
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      // Hero image variants are effectively content-versioned: if the photo
      // ever changes, scripts/optimize-hero.mjs output must get new filenames
      // (bump the name, not the content) — that's what makes immutable safe.
      {
        source: "/hero/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      // Unversioned public images (logos, OG image, PWA icons): cache a day
      // at the edge/browser, serve stale for a week while revalidating.
      {
        source:
          "/:file(logo.png|logo.webp|logo_top.png|logo_footer.png|logo_footer.webp|og-default.png|og-default.jpg|ptec-library.jpg)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/favicon/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  images: {
    unoptimized: true,
    formats: ["image/avif", "image/webp"],
    // Covers change rarely; cache transformed variants for 31 days.
    minimumCacheTTL: 2678400,
    qualities: [70, 75],
    remotePatterns: [
      // Supabase Storage
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      // Google Drive direct image CDN (lh3.googleusercontent.com/d/{FILE_ID})
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      // Google avatars
      {
        protocol: "https",
        hostname: "avatars.googleusercontent.com",
      },
      // Google Drive domains
      {
        protocol: "https",
        hostname: "drive.google.com",
      },
      // GitHub avatars
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      // Open Library covers
      {
        protocol: "https",
        hostname: "covers.openlibrary.org",
      },
      // Amazon covers
      {
        protocol: "https",
        hostname: "images-na.ssl-images-amazon.com",
      },
      // Cloudflare R2 public buckets (legacy books bucket)
      {
        protocol: "https",
        hostname: "pub-a07b6a3e6c63466392999efa42558aed.r2.dev",
      },
      // Cloudflare R2 covers bucket
      {
        protocol: "https",
        hostname: "pub-859a15e085144721b664647523d5ccff.r2.dev",
      },
      // Vercel Blob
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
      // Cloudflare Images (avatar delivery variant URLs)
      {
        protocol: "https",
        hostname: "imagedelivery.net",
      },
      // Wildcard Cloudflare R2 public buckets
      {
        protocol: "https",
        hostname: "*.r2.dev",
      },
      // Zima Storage API — allow both http and https since the server may serve either
      {
        protocol: "https",
        hostname: "api.storage-ptec.online",
      },
      {
        protocol: "http",
        hostname: "api.storage-ptec.online",
      },
      {
        protocol: "https",
        hostname: "storage-ptec.online",
      },
      {
        protocol: "http",
        hostname: "storage-ptec.online",
      },
      {
        protocol: "https",
        hostname: "cdn.storage-ptec.online",
      },
      {
        protocol: "http",
        hostname: "cdn.storage-ptec.online",
      },
    ],
  },
};





export default withNextIntlPlugin(withSerwist(nextConfig));
