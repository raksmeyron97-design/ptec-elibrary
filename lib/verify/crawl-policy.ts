// lib/verify/crawl-policy.ts
//
// Which URLs a crawl audit may follow, and what key it files them under. PURE
// — no fetch, no fs — so the one decision that turned out to be easy to get
// wrong is testable offline.
//
// ── The mistake this pins ────────────────────────────────────────────────────
//
// A private-path list containing "/auth", matched with startsWith, swallows
// "/authors". robots.txt once carried exactly that (`Disallow: /auth`) and hid
// all 157 author pages from every crawler; the first draft of
// scripts/audit-crawl-depth.ts reproduced it in its own skip list and silently
// dropped every /authors/* URL from the audit — 158 of 508 sitemap URLs,
// discovered only because the sitemap count came out 350. Two rules follow:
//
//   * OUR skip list matches on a path-segment boundary. "/auth" excludes
//     "/auth" and "/auth/login", never "/authors".
//   * robots.txt rules are matched as the file MEANS them — a raw prefix, plus
//     the `$` end-anchor Google honours — because the audit's job is to see
//     what Googlebot sees, not to correct the file.
//
// ── Query strings ────────────────────────────────────────────────────────────
//
// Everything but `page=N` is dropped. Filtered listings (`?lang=km`,
// `?subject=…`) are `noindex, follow` and canonicalise to their base, so
// following them measures nothing and costs a fetch each. `page=1` is the base
// page and is folded into it, so the listing is one node, not two.

export const PRIVATE_PREFIXES: readonly string[] = [
  "/api", "/admin", "/auth", "/dashboard", "/profile", "/lists", "/offline-books",
  "/offline-reader", "/~offline", "/search", "/_next", "/pdf", "/hero", "/pwa", "/cdn-cgi",
];

export const ASSET_RE = /\.(png|jpe?g|gif|webp|svg|ico|pdf|xml|txt|js|css|json|woff2?|ttf|mp4|webm|zip)$/i;

/**
 * Segment-boundary match: `/auth` covers `/auth` and `/auth/…`, not `/authors`.
 * Locale-aware: the Khmer tree mirrors every private surface under /km, and
 * a list that only looked at the path start followed /km/auth/login. (The
 * live robots.txt happens to list the /km variants too; the audit must not
 * depend on that.)
 */
export function isPrivatePath(path: string, prefixes: readonly string[] = PRIVATE_PREFIXES): boolean {
  const unlocalised = path.replace(/^\/km(?=\/|$)/, "") || "/";
  return prefixes.some((p) => {
    const b = p.replace(/\/+$/, "");
    return [path, unlocalised].some((x) => x === b || x.startsWith(`${b}/`));
  });
}

/**
 * The `Disallow:` rules that apply to `User-agent: *`, in file order.
 * Groups are delimited by User-agent lines; only the `*` group is kept.
 */
export function parseRobotsDisallow(robotsTxt: string): string[] {
  const rules: string[] = [];
  let applies = false;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    if (/^user-agent:/i.test(line)) {
      applies = /^user-agent:\s*\*\s*$/i.test(line);
    } else if (applies && /^disallow:/i.test(line)) {
      const p = line.replace(/^disallow:\s*/i, "").trim();
      if (p) rules.push(p);
    }
  }
  return rules;
}

/**
 * Does a robots rule block `path`? Raw prefix, as the protocol defines it,
 * plus Google's `$` end-anchor. NOT a segment boundary — if a site writes
 * `Disallow: /auth`, Googlebot really does skip /authors, and so must we.
 */
export function isRobotsDisallowed(path: string, rules: readonly string[]): boolean {
  return rules.some((rule) => {
    if (!rule) return false;
    if (rule.endsWith("$")) return path === rule.slice(0, -1);
    return path.startsWith(rule);
  });
}

export type NormalizeOptions = {
  /** e.g. "https://library.ptec.edu.kh" — anything else is not followed. */
  origin: string;
  robotsDisallow?: readonly string[];
  privatePrefixes?: readonly string[];
};

/**
 * Crawl key for an href, or null when it must not be followed.
 *
 * Same origin only; fragment dropped; every query but `page=N` (N>1) dropped;
 * no trailing slash except the root; percent-decoded so a Khmer slug is one
 * node whichever way the page encoded it.
 */
export function normalizeCrawlUrl(href: string, from: string, opts: NormalizeOptions): string | null {
  if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) return null;
  let u: URL;
  try {
    u = new URL(href, from);
  } catch {
    return null;
  }
  if (u.origin !== opts.origin) return null;

  let path = u.pathname.replace(/\/+$/, "") || "/";
  try {
    path = decodeURI(path);
  } catch {
    /* an unencodable path stays as written */
  }

  if (ASSET_RE.test(path)) return null;
  if (isPrivatePath(path, opts.privatePrefixes ?? PRIVATE_PREFIXES)) return null;
  if (isRobotsDisallowed(path, opts.robotsDisallow ?? [])) return null;

  const page = u.searchParams.get("page");
  return page && /^\d+$/.test(page) && page !== "1" ? `${path}?page=${page}` : path;
}

/** The route family a URL belongs to, with the locale prefix removed. */
export function routeFamily(url: string): string {
  const p = url.replace(/^\/km(?=\/|$)/, "") || "/";
  const seg = p.split("?")[0].split("/")[1];
  return seg ? `/${seg}` : "/";
}
