import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..", "..");
const PUBLIC_TREE = path.join(ROOT, "app/[locale]/(public)");

/** Strip comments — a page that *documents* the cookies() rule in prose must
 *  not trip the check that enforces it. */
function code(file: string): string {
  return fs
    .readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function routeOf(file: string): string {
  const rel = path.relative(PUBLIC_TREE, file).replace(/\\/g, "/");
  return "/" + rel.replace(/\/(page|layout)\.tsx$/, "").replace(/^\.$/, "");
}

function filesUnder(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && (e.name === "page.tsx" || e.name === "layout.tsx"))
    .map((e) => path.join(e.parentPath ?? dir, e.name));
}

/**
 * Routes in the public tree that still resolve the viewer on the SERVER, and so
 * are still rendered per request rather than prerendered.
 *
 * Two different reasons to be on this list:
 *
 *  • Genuinely per-user pages (/dashboard, /lists) — these must never be shared-
 *    cached, and never will be.
 *  • Detail pages that are 95% public but carry a personalised strip ("your
 *    progress", "your review"). These are the REMAINING MIGRATION TARGETS: the
 *    same treatment /home got (client island + private API) would let them
 *    prerender too. Until then they are correct but slow — they pay a function
 *    invocation per visit.
 *
 * Removing an entry here is the win. Adding one is a regression — it means a
 * page that used to be served from the CDN now runs a function for every
 * visitor.
 */
const SERVER_PERSONALISED = [
  "/dashboard",
  "/lists",
  "/profile",
  "/books/[slug]",
  "/books/[slug]/read",
  // The journal-article LISTING (subscribe badge) and the article detail
  // page (admin edit link, reviews). Journal and issue pages are NOT here:
  // they are prerendered, and SERVER_PERSONALISED_EXACT below keeps this
  // entry from exempting them by prefix.
  "/journals",
  "/journals/articles/[slug]",
  // /theses/[slug] left this list in the record redesign: its access panel
  // and staff Edit link read /api/theses/[id]/download-status in the
  // browser, so the page is the same for every visitor.
  "/posts/[slug]",
  "/paths/[slug]",
];

/**
 * Entries above that exempt ONLY their own route, not every route under it.
 * `/journals` reads the session for its subscribe badge, but /journals/<j>,
 * its issue list and its issues are shared-cached pages that must never read
 * one — a prefix match on `/journals` would have waved them through.
 */
const SERVER_PERSONALISED_EXACT = new Set(["/journals"]);

/**
 * Routes that read request HEADERS on the server — and nothing about the
 * viewer. /search renders the first page of results for the query in its own
 * address (Phase 9.3, docs/UNIFIED-DISCOVERY.md), so it is per-request by its
 * URL and was never going to be shared-cached with results in it. It reads
 * headers() for two things that say nothing about who is asking: the client
 * address its rate limit meters, and Sec-Fetch-Dest (a document load or the
 * router's fetch). Every other read stays forbidden — an answer to a query is
 * the same for everyone, and a session read here would make it personal.
 */
const SERVER_METERED: Record<string, readonly string[]> = {
  "/search": ["headers()"],
};

/**
 * Dynamic-segment pages that export `revalidate` but DO NOT opt into runtime
 * ISR, so they are rendered on every request despite reading nothing personal.
 *
 * In Next 16 `revalidate` alone does not cache a `[param]` path. The page must
 * also return a list (an empty one builds nothing and caches each path on its
 * first visit) from generateStaticParams, or set dynamic = "force-static".
 * See node_modules/next/dist/docs/01-app/03-api-reference/04-functions/
 * generate-static-params.md, "All paths at runtime".
 *
 * Measured against production on 2026-09-30: these answer
 * `Cache-Control: private, no-store`. /theses/[slug] was on this list and left
 * it when it gained generateStaticParams.
 *
 * Removing an entry is the win. Adding one is a regression.
 */
const REVALIDATE_WITHOUT_RUNTIME_ISR = [
  "/authors/[slug]",
  "/catalogs/[slug]",
  "/journals/[slug]",
  "/journals/[slug]/issues",
  "/journals/[slug]/issues/[issue]",
  "/subjects/[slug]",
];

const RUNTIME_ISR_OPT_IN = /export (async )?function generateStaticParams\b|export const dynamic\s*=\s*["']force-static["']/;

const AUTH_READS = [
  ["cookies()", /\bcookies\s*\(\s*\)/],
  ["headers()", /\bheaders\s*\(\s*\)/],
  ["getSessionUser", /\bgetSessionUser\b/],
  ["hasSessionCookie", /\bhasSessionCookie\b/],
  ["supabase.auth.getUser", /auth\s*\.\s*getUser\s*\(/],
] as const;

describe("public cache safety", () => {
  const all = filesUnder(PUBLIC_TREE);
  const sharedCached = all.filter(
    (f) =>
      !SERVER_PERSONALISED.some(
        (r) =>
          routeOf(f) === r ||
          (!SERVER_PERSONALISED_EXACT.has(r) && routeOf(f).startsWith(`${r}/`)),
      ),
  );

  it("finds the public tree", () => {
    expect(sharedCached.length).toBeGreaterThan(10);
  });

  // THE core invariant. A shared-cached page's HTML is handed byte-for-byte to
  // every visitor, so nothing user-specific may shape it. Reading the auth
  // cookie is both how private data would get in AND (today) what forces the
  // route dynamic — so one rule protects privacy and performance at once.
  it.each(sharedCached.map((f) => path.relative(ROOT, f)))(
    "%s reads no per-request auth state",
    (rel) => {
      const src = code(path.join(ROOT, rel));
      const allowed = SERVER_METERED[routeOf(path.join(ROOT, rel))] ?? [];
      for (const [name, re] of AUTH_READS) {
        if (allowed.includes(name)) continue;
        expect(
          re.test(src),
          `${rel} uses ${name}. This page is prerendered and shared-cached: its ` +
            `HTML goes to every visitor, so per-user state must not shape it — and ` +
            `the read would silently drop the page back to per-request rendering. ` +
            `Move the personalised part to a client island fed by <SessionProvider> ` +
            `(see components/ui/home/ContinueReadingSwap.tsx and SignedOutOnly.tsx) ` +
            `backed by a private no-store route (app/api/me/*).`,
        ).toBe(false);
      }
    },
  );

  // Reading no session is necessary but not sufficient: a `[param]` page is
  // only cached if it also opts into runtime ISR. /theses/[slug] shipped with
  // `revalidate = 3600`, read nothing personal, and still answered
  // `private, no-store` in production for exactly this reason.
  const isrClaims = sharedCached.filter(
    (f) => f.endsWith("page.tsx") && routeOf(f).includes("[") && /^export const revalidate\s*=/m.test(code(f)),
  );

  it("finds the dynamic-segment pages that claim revalidation", () => {
    expect(isrClaims.map(routeOf)).toContain("/theses/[slug]");
  });

  it.each(isrClaims.map((f) => routeOf(f)))("%s opts into runtime ISR, or is listed as not yet doing so", (route) => {
    const optedIn = RUNTIME_ISR_OPT_IN.test(code(path.join(PUBLIC_TREE, route, "page.tsx")));
    if (REVALIDATE_WITHOUT_RUNTIME_ISR.includes(route)) {
      expect(optedIn, `${route} now opts into runtime ISR: remove it from REVALIDATE_WITHOUT_RUNTIME_ISR.`).toBe(false);
    } else {
      expect(
        optedIn,
        `${route} exports revalidate but neither generateStaticParams nor dynamic = "force-static", so ` +
          `Next renders it on every request. Add \`export function generateStaticParams() { return []; }\`.`,
      ).toBe(true);
    }
  });

  it("the thesis record is cached at runtime", () => {
    const src = code(path.join(PUBLIC_TREE, "theses/[slug]", "page.tsx"));
    expect(src).toMatch(/export function generateStaticParams\(\)\s*\{\s*return \[\];\s*\}/);
    expect(REVALIDATE_WITHOUT_RUNTIME_ISR).not.toContain("/theses/[slug]");
  });

  // A metered route is exempt from ONE read because it is dynamic by its own
  // address anyway. If it ever stopped reading searchParams, the headers()
  // read would be the only thing keeping it off the CDN — the exemption would
  // then be costing a prerender, which is exactly what it may not do.
  it.each(Object.keys(SERVER_METERED))("%s is dynamic by its own URL, not by the headers it reads", (route) => {
    const src = code(path.join(PUBLIC_TREE, route, "page.tsx"));
    expect(src).toMatch(/searchParams/);
    expect(src).toMatch(/\bheaders\s*\(\s*\)/);
  });

  // The other half of the same invariant: the pages that DO read the viewer
  // server-side must stay out of the shared cache.
  it.each(SERVER_PERSONALISED)("%s is never prerendered", (route) => {
    const dir = path.join(PUBLIC_TREE, route);
    if (!fs.existsSync(dir)) return; // /profile has no page today

    const page = path.join(dir, "page.tsx");
    if (!fs.existsSync(page)) return;

    const src = code(page);
    const forcedDynamic = /export const dynamic\s*=\s*["']force-dynamic["']/.test(src);
    const readsAuth = AUTH_READS.some(([, re]) => re.test(src));
    const readsSearchParams = /searchParams/.test(src);

    // Any of these keeps Next from prerendering it. If a page ever appears here
    // with none of them, it would be prerendered *with someone's session baked
    // in* — the exact leak this suite exists to prevent.
    expect(
      forcedDynamic || readsAuth || readsSearchParams,
      `${route} is listed as server-personalised but nothing keeps it dynamic.`,
    ).toBe(true);
  });

  it("private API routes are force-dynamic, no-store, and session-scoped", () => {
    for (const rel of ["app/api/me/route.ts", "app/api/me/continue-reading/route.ts"]) {
      const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
      expect(src, rel).toContain('export const dynamic = "force-dynamic"');
      expect(src, rel).toContain("private, no-store");
      // The user id must come from the verified session, never from caller input
      // — otherwise one user could request another's profile or history.
      expect(src, rel).toContain("getSessionUser");
      expect(code(path.join(ROOT, rel)), rel).not.toMatch(/searchParams/);
    }
  });
});
