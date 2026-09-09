import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import withNextIntl from 'next-intl/plugin';
// Relative import: path aliases are not resolved inside next.config.ts.
import { isIndexableEnvironment, NOINDEX_HEADER_VALUE } from "./lib/seo/indexing";

const withNextIntlPlugin = withNextIntl('./i18n/request.ts');

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // NOTE — anything added to public/ is precached, and there is NO way to opt
  // out of that here. @serwist/next hands public/ files to InjectManifest as
  // `additionalPrecacheEntries`, and @serwist/build appends those to the
  // manifest AFTER every user manifestTransform has run
  // (additionalPrecacheEntriesTransform is always last), so neither `exclude`
  // nor a manifestTransform can drop them — both were tried against the iOS
  // launch images and both were no-ops. Size the asset instead; see
  // SPLASH_LOGO_MAX_PX in scripts/generate-pwa-assets.mjs.
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
  reactStrictMode: false,
  // Metadata goes in <head>, for everyone — i.e. streaming metadata off.
  //
  // Next 16 resolves generateMetadata WITHOUT blocking the shell and emits the
  // tags later in the stream, inside <body>, relying on React to hoist them
  // client-side. `htmlLimitedBots` is the UA allowlist that gets the blocking
  // behaviour instead; widening it to everything opts the whole site out.
  //
  // WHY. The hoist does not always happen. Measured on /theses/research: the
  // <meta name="description"> AND the <title> stay in <body> permanently, in a
  // real browser, long after hydration — while /books hoists fine. A meta
  // description in <body> is invalid HTML that head-only consumers ignore, so
  // this was a live SEO defect, not just the failing Lighthouse audit
  // (categories:seo 0.92 against a 0.95 error-level gate) that surfaced it.
  //
  // COST, measured locally (warm, median of 10; this machine's link to Supabase
  // is far slower than Vercel sin1's, so production pays less):
  //
  //   /theses/research   TTFB 42ms -> 146ms   meta BODY -> head
  //   /books             TTFB 43ms ->  35ms   meta head -> head (unchanged)
  //
  // Only routes whose generateMetadata does uncached DB work pay anything; the
  // rest are unaffected. For a library whose discovery depends on search, head
  // metadata is worth ~100ms of TTFB on detail pages.
  htmlLimitedBots: /.*/,
  // Self-contained server bundle for the ZimaOS Docker image (Dockerfile
  // copies .next/standalone). Harmless elsewhere: `next start` and Vercel
  // deployments ignore it.
  output: "standalone",
  /**
   * NO PERSISTENT WEBPACK CACHE IN A PRODUCTION BUILD.
   *
   * Vercel restores `.next/cache` from the previous deployment. Reading that
   * cache back crashes the compile:
   *
   *     ✓ (serwist) Bundling the service worker script ...
   *     uncaughtException TypeError: Cannot read properties of undefined (reading 'length')
   *     Error: Command "npm run build" exited with 1
   *
   * about 40s in — right where the successful build reports "Compiled
   * successfully in 42s", i.e. as webpack seals and serializes its pack files.
   * Next hides the frames (`at ignore-listed frames`), so there is no actionable
   * stack; `__NEXT_SHOW_IGNORE_LISTED=true` does not recover one either.
   *
   * PROVEN, not guessed. The same commit, on the same 2-core/8 GB Vercel
   * builder, with the same env:
   *
   *   restored cache                      -> crash  (dpl_CdaAJvUdSb44t1rfHpQYDhsQGwhW)
   *   `vercel deploy --force` (no cache)  -> READY  (dpl_3TNf59hZxSFmXaG1EGTD53QrUNCC)
   *
   * It is NOT the code. Every local combination builds fine — cold, warm, and
   * with a cache written by an older commit and read by a newer one — on a
   * machine with more cores and RAM than the builder. Bisecting the diff was a
   * false trail for the same reason: the reverts "fixed" it only because each
   * test happened to start from a clean `.next`.
   *
   * WHY THIS AND NOT `VERCEL_FORCE_NO_BUILD_CACHE=1`. That env var works, but
   * it lives in project settings where nothing explains it, and it would not
   * protect a build run anywhere else. This is versioned, it travels with the
   * repo, and it says why. Guarded on `!dev` so `next dev` keeps its cache —
   * the dev cache is a different mechanism and is not implicated.
   *
   * COST: none worth counting. Vercel compiles this app in ~42s from cold, and
   * the ZimaOS Docker build is already cold every time (`.dockerignore`
   * excludes `.next`), so it never had a cache to lose.
   *
   * REVISIT on the next Next.js/webpack major — this is a workaround for a bug
   * in their persistent cache, not a property of this codebase.
   */
  webpack: (config, { dev }) => {
    if (!dev) config.cache = false;
    return config;
  },
  experimental: {
    // `forbidden()` / `unauthorized()` from next/navigation. They are what keep
    // an authorization failure out of the generic error boundary: each throws a
    // distinct HTTP interrupt that Next routes to forbidden.tsx / unauthorized.tsx
    // with a real status code, instead of the redacted, digest-only Error that a
    // client `error.tsx` receives in production and cannot classify.
    // See lib/admin/route-guard.ts.
    authInterrupts: true,
    serverActions: {
      // Catalog cover uploads allow a 5 MB image; the rest of the multipart
      // body (bibliographic fields + boundaries) needs headroom beyond that.
      bodySizeLimit: "6mb",
    },
    // Rewrite `import { X } from "lucide-react"` to the individual icon module.
    //
    // lucide-react's barrel re-exports 3,972 icon modules, and 300 files in
    // this app import from it. Without this, every one of those files pulls
    // the whole barrel into the dev module graph, which is re-evaluated per
    // request — so dev render time scaled with component-tree size rather
    // than with work done. Measured on this machine before/after; see the
    // numbers in the commit message.
    //
    // Production builds tree-shake the barrel anyway, so this is almost
    // entirely a DEV ergonomics fix; it does not change shipped bundles.
    optimizePackageImports: ["lucide-react"],
    // There is no single app/layout.tsx any more (the public tree owns its own
    // <html> so it can read the locale from params instead of headers()), so
    // unmatched routes need a root-layout-free 404 page: app/global-not-found.tsx.
    globalNotFound: true,
  },
  // NOTE: `experimental.rootParams` was removed in Next 16.3.0 — root params are
  // stable now and the flag is a type error. `next/root-params` itself is
  // unchanged, and i18n/request.ts still depends on it: it reads the [locale]
  // segment of app/[locale]/layout.tsx (a ROOT layout since the split) without
  // touching headers(). next-intl's setRequestLocale() does not survive across
  // route segments here — verified: getLocale() returned "en" on /km/home even
  // immediately after setRequestLocale("km") in the same layout — and every
  // other way of resolving the locale server-side is a dynamic API that would
  // un-cache the whole public tree. Root params are params, so they stay
  // prerender-safe.
  // pdfjs is loaded lazily by lib/pdf-page-index.ts for server-side text
  // extraction; keep it out of the server bundle (worker/canvas quirks).
  serverExternalPackages: ["pdfjs-dist"],
  /**
   * SHIP pdf.worker.mjs, WHICH FILE TRACING CANNOT SEE.
   *
   * `lib/pdf-page-index.ts` imports `pdfjs-dist/legacy/build/pdf.mjs` by a
   * string literal, so the tracer finds THAT file and copies it into
   * `.next/standalone/node_modules/`. But pdf.js does not reach its worker
   * through an import the tracer can follow — it resolves one at runtime:
   *
   *     GlobalWorkerOptions.workerSrc ||= "./pdf.worker.mjs";
   *
   * In Node there is no real Worker, so `getDocument()` takes the "fake
   * worker" path, which imports that specifier to get `WorkerMessageHandler`.
   * A relative specifier assigned to a mutable global is invisible to static
   * analysis, so the traced output contained exactly one pdfjs file —
   * `legacy/build/pdf.mjs` — and every call in the container died on its first
   * statement with:
   *
   *     Setting up fake worker failed: "Cannot find module
   *     .../pdfjs-dist/legacy/build/pdf.worker.mjs"
   *
   * `indexPdfPagesSafe()` is non-throwing by contract, so that exception was
   * caught and logged and nothing else. The result in production: `book_pages`
   * held 0 rows for 120 uploaded books across five weeks, "found inside"
   * search matched nothing, and the AI assistant could cite no page of any
   * book — while every local run and every test passed, because a dev
   * `node_modules` has the worker sitting next to `pdf.mjs`.
   *
   * The reproduction is one `mv` away: hide `pdf.worker.mjs` and the extractor
   * throws that exact message; restore it and the same PDF yields 172 pages.
   *
   * This entry is therefore load-bearing for search and for RAG, not a build
   * detail. `lib/pdf-worker-tracing.test.ts` fails if it is removed or if the
   * path stops matching the file pdf.js actually asks for.
   */
  outputFileTracingIncludes: {
    "/**": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
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
      // Non-production builds (previews, branch deploys, staging, local) are
      // noindex on EVERY response — including static files (PDFs, images)
      // that middleware's matcher never sees. Evaluated at build time; a
      // Vercel preview build has VERCEL_ENV=preview, so this bakes in there
      // and never on production builds. Middleware + metadata robots are the
      // other two layers (lib/seo/indexing.ts).
      ...(!isIndexableEnvironment()
        ? [
            {
              source: "/:path*",
              headers: [{ key: "X-Robots-Tag", value: NOINDEX_HEADER_VALUE }],
            },
          ]
        : []),
      // Hero image variants are effectively content-versioned: if the photo
      // ever changes, scripts/optimize-hero.mjs output must get new filenames
      // (bump the name, not the content) — that's what makes immutable safe.
      {
        source: "/hero/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      // The PWA launch surface: the boot emblem and the 21 iOS startup images.
      //
      // The rule above SAYS "PWA icons" but its filename group never matched
      // anything under /pwa/, so these fell through to Next's default for
      // public files — MEASURED `public, max-age=0` at the origin, which is
      // why Cloudflare was serving boot-emblem.webp on its own 4-hour default
      // guess. This is the FIRST image request on every page load, so a
      // returning reader was revalidating it before the shell could paint.
      //
      // Deliberately NOT `immutable`, unlike /hero/ above. These names are
      // stable across regeneration (ipad-1024x1366-portrait.png is keyed by
      // device, not by content), so `npm run pwa:assets` can change the bytes
      // behind a name that never changes. Immutable belongs to hashed or
      // hand-versioned filenames only; a year-long immutable cache on a name
      // that can be rewritten is unfixable in the field.
      {
        source: "/pwa/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      // Unversioned public images (logos, OG image): cache a day
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
    // NOT `unoptimized: true`. That one flag made every <Image> render a bare
    // <img> with the raw src — no `srcset`, and no `sizes` either, since Next
    // only emits one alongside the other. Measured on the live homepage at
    // 375px/DPR 2: 68 <img>, ZERO with a srcset, every cover arriving at its
    // full 800px intrinsic width into a 114-162px slot. ~1.17 MB of covers to
    // paint ~110 KB worth of pixels, on 4G, on the phones this library is for.
    //
    // The components were never the problem: SmartBookCover already renders
    // `fill` + `sizes`, and every call site passes one. The flag overrode all
    // of it. Per-call-site opt-out still works and is still correct for
    // arbitrary external URLs — see CatalogCard, which passes `unoptimized`.
    //
    // Enabling this puts the optimizer on the ZimaOS box (read_only, 1 GB, and
    // .next/cache is a tmpfs — so variants are RAM-backed and re-made after
    // every deploy). That is affordable ONLY because of `formats` below.
    formats: ["image/webp"],
    // WebP only — AVIF is a measured LOSS for this collection, not a win.
    //
    // Covers are ALREADY WebP and land in small slots, which is the regime
    // where AVIF's overhead stops paying for itself. Measured with this repo's
    // own sharp on a real 800x1035 cover (51.3 KB source):
    //
    //   228w  webp   5.3 KB   35 ms      456w  webp  18.5 KB   67 ms
    //   228w  avif   7.3 KB  353 ms      456w  avif  24.9 KB  356 ms
    //
    // 38% BIGGER and 10x slower to encode. Since the tmpfs cache is wiped on
    // every deploy, that 10x is paid again on every release, on a home server.
    // Re-add AVIF only if the sources stop being WebP or the slots get large.
    // Covers change rarely; cache transformed variants for 31 days.
    minimumCacheTTL: 2678400,
    qualities: [70, 75],
    // Trimmed from the default [640, 750, 828, 1080, 1200, 1920, 2048, 3840].
    // Nothing here is displayed above 1920, and `w` is attacker-controlled on
    // /_next/image: leaving 3840 in the allowlist buys nothing but lets anyone
    // make this box UPSCALE an 800px cover to 4K, repeatedly, into a RAM cache.
    deviceSizes: [640, 828, 1080, 1200, 1920],
    // The cover ladder. Every cover on the site occupies a 112-300px slot, so
    // at DPR 2-3 the useful band is ~224-450px — where the default imageSizes
    // ([32, 48, 64, 96, 128, 256, 384]) jump straight from 256 to 384 to 640.
    //
    // These MUST all stay below deviceSizes[0]; the docs are explicit, and
    // Next builds the srcset from both lists concatenated, so a value above it
    // would shadow a device breakpoint. That is why the ladder tops out at 512
    // rather than the 456+ rungs a naive reading of the slot math suggests.
    imageSizes: [96, 128, 160, 192, 224, 256, 320, 384, 448, 512],
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
      // NO WILDCARD `*.r2.dev` HERE, deliberately.
      //
      // Any r2.dev subdomain is registrable by anyone with a Cloudflare
      // account, so a wildcard turns /_next/image into a fetcher for
      // attacker-supplied bytes: the optimizer must DECODE whatever an
      // allowlisted host returns, which is the reachable half of the AVIF
      // image-decoder RCE class (GHSA-2xp9-vwfh-vxw4). Verified against
      // production: `/_next/image?url=https://pub-<random>.r2.dev/x.avif`
      // answered 401 (upstream propagated = fetched), while a non-allowlisted
      // host answers 400.
      //
      // It also bought nothing. Every books.cover_url and book_files.file_url
      // in production (270 of each) points at storage-ptec.online, and the one
      // r2.dev row left in the collection — a single profiles.avatar_url — is
      // on the pub-859a15… bucket named explicitly above.
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
