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
  "/publications",
  "/publications/[slug]",
  "/theses/[slug]",
  "/posts/[slug]",
  "/paths/[slug]",
];

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
    (f) => !SERVER_PERSONALISED.some((r) => routeOf(f) === r || routeOf(f).startsWith(`${r}/`)),
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
      for (const [name, re] of AUTH_READS) {
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
