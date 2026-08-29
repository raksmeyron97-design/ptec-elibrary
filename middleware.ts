import { createServerClient } from "@supabase/ssr";
import { AuthApiError } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import { canonicalHostRedirect } from "@/lib/canonical-host";
import { gateBookSlug } from "@/lib/book-slug-gate";
import { gateResourceSlug, RESOURCE_GATES } from "@/lib/resource-slug-gate";
import {
  buildNonceCsp,
  buildPublicCsp,
  getThemeScriptHash,
  needsEval,
  usesNonceCsp,
} from "@/lib/csp";
import {
  isIndexableEnvironment,
  isPrivateSurfacePath,
  NOINDEX_HEADER_VALUE,
  PRIVATE_SURFACE_HEADER_VALUE,
} from "@/lib/seo/indexing";

// Paths that require an active session on the main domain
const PROTECTED_PREFIXES = ["/dashboard", "/profile"];

// Rewrite target for "this definitely does not exist, return a real 404".
//
// It MUST have two or more segments. A single segment (the old '/__not-found__')
// matches the top-level [locale] route — Next then renders the public tree with
// locale="__not-found__", which bails to app/[locale]/not-found.tsx, reads the
// locale cookie to translate it, and blows up with "Page changed from static to
// dynamic at runtime" — a 500 where a 404 was intended. Two segments match no
// route at all, so this lands on app/global-not-found.tsx, which is static and
// reads nothing.
const NOT_FOUND_PATH = "/_ptec/not-found";

// Legacy thesis detail URLs were /theses/<uuid>; they 301 to /theses/<slug>.
// (research_reports ids are uuids — there were never numeric thesis ids.)
const LEGACY_THESIS_RE =
  /^\/theses\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

// A bare UUID as a detail slug is a legacy id (handled by LEGACY_THESIS_RE
// above); the published-slug gate must never treat it as a content slug.
const UUID_SLUG_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function middleware(request: NextRequest) {
  // ── One host, always ───────────────────────────────────────────────────
  // The Cloudflare Tunnel publishes this same container on both the canonical
  // domain and the connector's fallback hostname. Collapse them here, before
  // anything reads cookies or builds a URL: session cookies are per-host, so
  // serving both is how a signed-in student ends up looking signed out. LAN
  // and container hostnames are deliberately exempt — see lib/canonical-host.ts.
  const canonicalHost = canonicalHostRedirect(request.headers.get("host"));
  if (canonicalHost) {
    const target = new URL(request.url);
    target.protocol = "https:";
    target.host = canonicalHost;
    // 308, not 307/302: the method must be preserved and the move is permanent.
    return NextResponse.redirect(target, 308);
  }

  // Correlation id for log lines: reuse the edge/CDN id when present
  // (Cloudflare cf-ray) so app logs join up with WAF logs, else mint one.
  // Propagated to route handlers via the request header and echoed on the
  // response so users can quote it in bug reports.
  const requestId =
    request.headers.get('cf-ray') ?? request.headers.get('x-request-id') ?? crypto.randomUUID();

  // ── Pick the CSP for this path ─────────────────────────────────────────
  // The nonce policy forces dynamic rendering (Next injects the nonce into its
  // inline RSC scripts at render time), so it is reserved for surfaces that are
  // dynamic anyway: /admin, /auth, /api, /dashboard, /profile, /lists. Public
  // catalogue pages get a nonce-free policy so they can be prerendered and
  // served from the CDN. See lib/csp.ts for the full rationale and the
  // "'unsafe-inline' is voided by any nonce/hash" trap.
  //
  // Locale prefix is stripped first so /km/books classifies the same as /books.
  const rawPath = request.nextUrl.pathname;
  const cspPath =
    rawPath === '/km' ? '/' : rawPath.startsWith('/km/') ? rawPath.slice(3) : rawPath;
  const wantsNonce = usesNonceCsp(cspPath);
  // React's development build uses eval() for debugging features (reconstructing
  // call stacks across environments) and logs "eval() is not supported in this
  // environment" without it. It never uses eval in production, so the public
  // policy still ships without 'unsafe-eval' where it counts — only the pdf.js
  // reader routes keep it (lib/csp.ts).
  const withEval = needsEval(cspPath) || process.env.NODE_ENV !== "production";

  let cspHeader: string;
  let cspReportOnly: string | null = null;
  let nonceB64: string | null = null;

  if (wantsNonce) {
    nonceB64 = Buffer.from(crypto.randomUUID()).toString('base64');
    const themeHash = await getThemeScriptHash();
    // 'unsafe-eval' is retained here only because dev tooling and the admin
    // panel's legacy bundles have historically needed it; the report-only twin
    // drops it to prove nothing depends on eval before we remove it for real —
    // staged plan in docs/SECURITY-HEADERS.md.
    cspHeader = buildNonceCsp(nonceB64, themeHash, { withEval: true });
    if (process.env.NODE_ENV === 'production') {
      cspReportOnly = `${buildNonceCsp(nonceB64, themeHash, { withEval: false })}; report-uri /api/csp-report; report-to csp-endpoint`;
    }
    request.headers.set('x-nonce', nonceB64);
    // Next reads this request header to nonce its own inline scripts. It must
    // NOT be set for public paths, or Next would nonce a response we intend to
    // prerender and cache.
    request.headers.set('Content-Security-Policy', cspHeader);
  } else {
    cspHeader = buildPublicCsp({ withEval });
  }

  request.headers.set('x-request-id', requestId);

  // ── Indexing safety (lib/seo/indexing.ts) ──────────────────────────────
  // Non-production deployments (previews, branch URLs, local, staging) get a
  // blanket noindex header; private surfaces (/admin, /auth, /api, account
  // pages — cspPath is already locale-stripped) get one in EVERY environment.
  // Metadata-level robots are the second layer; robots.txt is never the only
  // mechanism.
  const robotsTag = !isIndexableEnvironment()
    ? NOINDEX_HEADER_VALUE
    : isPrivateSurfacePath(cspPath)
      ? PRIVATE_SURFACE_HEADER_VALUE
      : null;

  // Attach the standard security headers to any response this middleware returns.
  const applySecurity = (res: NextResponse) => {
    res.headers.set('Content-Security-Policy', cspHeader);
    if (cspReportOnly) {
      res.headers.set('Content-Security-Policy-Report-Only', cspReportOnly);
      res.headers.set('Reporting-Endpoints', 'csp-endpoint="/api/csp-report"');
    }
    if (nonceB64) res.headers.set('x-nonce', nonceB64);
    if (robotsTag) res.headers.set('X-Robots-Tag', robotsTag);
    res.headers.set('x-request-id', requestId);
    return res;
  };

  const { nextUrl: url } = request;
  const pathname = url.pathname;

  // ── Admin / auth / API: entirely outside the locale-prefixed route tree ──
  // (admin) and (auth) route groups are not localized — no rewrite, no /km,
  // behavior here is unchanged from before locale routing was introduced.
  // Match on a whole path SEGMENT, not a bare string prefix. `startsWith("/auth")`
  // also swallowed /authors/<slug> — a public, locale-routed page — so English
  // requests for it skipped the /en rewrite below and 404'd at the file router
  // while /km/authors/<slug> worked. Same trap waits for /admin* and /api*.
  const isAdminOrAuthOrApi = ["/admin", "/auth", "/api"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isAdminOrAuthOrApi) {
    const needsAuthCheck =
      pathname.startsWith("/admin") || pathname.startsWith("/auth/login");

    if (!needsAuthCheck) {
      return applySecurity(NextResponse.next({ request: { headers: request.headers } }));
    }

    let response = NextResponse.next({
      request: { headers: request.headers },
    });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookieOptions: AUTH_COOKIE_OPTIONS,
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    // Refresh session — must run before any route check
    let user = null;
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error && error instanceof AuthApiError && error.code === 'refresh_token_not_found') {
        // Stale / revoked refresh token — sign out and redirect to login
        await supabase.auth.signOut();
        const loginUrl = new URL('/auth/login', request.url);
        const res = NextResponse.redirect(loginUrl);
        // Copy any cookie changes (the signOut clears them)
        response.cookies.getAll().forEach((c) => res.cookies.set(c));
        return applySecurity(res);
      }
      user = data?.user ?? null;
    } catch (err) {
      if (err instanceof AuthApiError && err.code === 'refresh_token_not_found') {
        await supabase.auth.signOut();
        const loginUrl = new URL('/auth/login', request.url);
        const res = NextResponse.redirect(loginUrl);
        response.cookies.getAll().forEach((c) => res.cookies.set(c));
        return applySecurity(res);
      }
      // Other auth errors — proceed with user = null
    }

    // Helper to copy cookies from the refreshed response to a new response
    const copyCookies = (newRes: NextResponse) => {
      response.cookies.getAll().forEach((c) => {
        newRes.cookies.set(c);
      });
      return newRes;
    };

    // ── Admin Path Logic ─────────────────────────────────────────
    if (pathname.startsWith("/admin")) {
      const adminPanelRoles = ['staff', 'librarian', 'admin', 'super_admin'];

      if (pathname !== "/admin/login" && pathname !== "/admin/auth/signout") {
        if (!user) {
          const res = NextResponse.redirect(new URL("/admin/login", request.url));
          return applySecurity(copyCookies(res));
        }

        // Check role — allow any admin-panel role, or the legacy
        // is_super_admin flag (same acceptance rule as lib/auth-guards.ts)
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, is_super_admin')
          .eq('id', user.id)
          .single();

        if (
          !adminPanelRoles.includes(profile?.role ?? '') &&
          !profile?.is_super_admin
        ) {
          const res = NextResponse.redirect(new URL("/", request.url));
          return applySecurity(copyCookies(res));
        }
      }

      // Already-authenticated admin-panel users skip the login page
      if (pathname === "/admin/login" && user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, is_super_admin')
          .eq('id', user.id)
          .single();

        if (
          adminPanelRoles.includes(profile?.role ?? '') ||
          profile?.is_super_admin
        ) {
          const res = NextResponse.redirect(new URL("/admin", request.url));
          return applySecurity(copyCookies(res));
        }
      }
    }

    // Redirect logged-in users away from login page
    if (pathname === "/auth/login" && user) {
      const res = NextResponse.redirect(new URL("/books", request.url));
      return applySecurity(copyCookies(res));
    }

    return applySecurity(copyCookies(response));
  }

  // ── Public routes: locale-prefixed ("as-needed" — en unprefixed, km /km) ──

  // Static assets served straight from /public (pdf.js worker/cmaps/fonts,
  // hero images, favicons, manifest, etc.) are never App Router pages — never
  // rewrite/redirect them into the locale scheme. The matcher's extension
  // denylist below can't enumerate every asset type (that's exactly how the
  // /pdf/pdf.worker.min.mjs and /hero/*.avif rewrite bug happened), so bail
  // out here for any request whose last path segment looks like a filename.
  // /pdf/* contains extensionless files (LICENSE, LICENSE_FOXIT, …) that the
  // dot check below misses; they're precached by the service worker, and a
  // locale rewrite turns them into 404s that fail the whole SW install.
  //
  // /~offline is in the same category. It is a real page, but it lives at
  // app/~offline/ — OUTSIDE the [locale] segment, because the service worker
  // serves it with no way to know the reader's locale. Sending it through the
  // default-locale rewrite below asked the router for /en/~offline, which does
  // not exist, so the PWA's document fallback answered 404: going offline got
  // the browser's own error page instead of the branded offline screen.
  const lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
  if (
    lastSegment.includes(".") ||
    pathname.startsWith("/pdf/") ||
    pathname === "/~offline"
  ) {
    return applySecurity(NextResponse.next({ request: { headers: request.headers } }));
  }

  // Explicit /en prefix is not canonical under "as-needed" — collapse to the
  // bare path in a single hop (/en → /, /en/home → / — never via /home).
  if (pathname === "/en" || pathname.startsWith("/en/")) {
    let stripped = pathname === "/en" ? "/" : pathname.slice(3);
    if (stripped === "/home") stripped = "/";
    const res = NextResponse.redirect(new URL(stripped + url.search, request.url), 301);
    return applySecurity(res);
  }

  const isKm = pathname === "/km" || pathname.startsWith("/km/");
  const activeLocale: "en" | "km" = isKm ? "km" : "en";
  let pathWithoutLocale = isKm ? pathname.slice(3) : pathname;
  if (pathWithoutLocale === "") pathWithoutLocale = "/";
  const localePrefix = activeLocale === "km" ? "/km" : "";

  // The canonical homepage is the locale root (/ and /km). The legacy /home
  // URLs 308 onto it so search engines consolidate every homepage signal on
  // one URL. (Until 2026-07 the redirect ran the OTHER way — / → /home; the
  // sitemap, nav links, and canonicals all moved to / in the same change.)
  if (pathWithoutLocale === "/home") {
    const res = NextResponse.redirect(
      new URL(`${localePrefix || "/"}${url.search}`, request.url),
      308,
    );
    return applySecurity(res);
  }

  // ── Legacy thesis URLs: 301 /theses/<uuid> → /theses/<slug> ──
  // A single anonymous PostgREST lookup (no cookies, RLS-scoped to published
  // rows). Unknown ids fall through to the page route, which renders the 404.
  // The redirect target keeps whatever locale prefix the request came in with.
  const legacyThesis = pathWithoutLocale.match(LEGACY_THESIS_RE);
  if (legacyThesis) {
    try {
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const lookup = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/research_reports?id=eq.${legacyThesis[1]}&is_published=eq.true&select=slug&limit=1`,
        { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } },
      );
      if (lookup.ok) {
        const rows: { slug: string | null }[] = await lookup.json();
        const slug = rows[0]?.slug;
        if (slug) {
          const res = NextResponse.redirect(new URL(`${localePrefix}/theses/${slug}`, request.url), 301);
          return applySecurity(res);
        }
        // Id is definitively not in the DB (or unpublished). Rewriting to an
        // unrouted path renders the global not-found page with a real HTTP
        // 404 status — inside the route tree the (public) loading boundary
        // would stream a 200 shell before notFound() could set the status.
        const res = NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url));
        return applySecurity(res);
      }
    } catch {
      // Lookup failed — let the page route resolve or 404 the id itself.
    }
  }

  // ── Book detail slugs: real 301s for retired duplicates, real 404s ──
  // The (public) loading boundary streams a 200 shell before the page can
  // notFound(), so unknown slugs were soft-404s. The gate is an in-memory
  // published-slug snapshot per edge isolate (zero added latency on the hot
  // path; one confirming lookup on misses) and FAILS OPEN if Supabase is
  // unreachable. See lib/book-slug-gate.ts.
  const bookDetail = pathWithoutLocale.match(/^\/books\/([^/]+)$/);
  if (bookDetail) {
    let bookSlug: string | null = null;
    try {
      bookSlug = decodeURIComponent(bookDetail[1]);
    } catch {
      bookSlug = null; // malformed escape — let the route 404 it
    }
    if (bookSlug) {
      const verdict = await gateBookSlug(bookSlug, {
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      });
      if (verdict?.kind === "redirect") {
        const res = NextResponse.redirect(
          new URL(`${localePrefix}/books/${encodeURIComponent(verdict.slug)}`, request.url),
          301,
        );
        return applySecurity(res);
      }
      if (verdict?.kind === "not-found") {
        const res = NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url));
        return applySecurity(res);
      }
      // ok / null → fall through to the page unchanged.
    }
  }

  // ── Thesis / publication / catalog / post detail slugs: real 404s ──
  // Same soft-404 problem as books (the loading boundary streams a 200 shell
  // before the page can notFound()), but these types have no retired-slug
  // redirect map, so the gate only decides ok vs not-found. Legacy
  // /theses/<uuid> URLs are already resolved above, so the theses branch here
  // only ever sees non-UUID slugs. FAILS OPEN if Supabase is unreachable.
  //
  // Zero-network hint that the viewer is signed in. This is a plain read of
  // the request's own cookies — NOT a getUser() round-trip — so public paths
  // keep the fast path they are required to keep. Only the posts gate below
  // consults it; see why there.
  const hasSessionCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));

  for (const [segment, cfg] of [
    ["theses", RESOURCE_GATES.theses],
    ["publications", RESOURCE_GATES.publications],
    ["catalogs", RESOURCE_GATES.catalogs],
    ["posts", RESOURCE_GATES.posts],
    // Two-segment prefix — the regex below is built from the segment string,
    // so /about/team/<slug> matches while /about/team itself does not.
    ["about/team", RESOURCE_GATES["about/team"]],
    ["authors", RESOURCE_GATES.authors],
  ] as const) {
    const match = pathWithoutLocale.match(
      new RegExp(`^/${segment}/([^/]+)$`),
    );
    if (!match) continue;
    // Posts are the only gated type with a signed-in read path on the PUBLIC
    // route: /posts/[slug] renders drafts (is_published = false) and
    // admin_only posts for admins, complete with a "Draft preview" badge and
    // an edit link. The gate's snapshot comes from the anon key, so neither
    // is in it, and gating a signed-in request would 404 the preview at the
    // edge. Hand those requests to the page, which already does the real
    // authorization; anonymous traffic — crawlers, which is who the soft-404
    // fix is for — still gets a true 404.
    if (segment === "posts" && hasSessionCookie) break;
    let slug: string | null = null;
    try {
      slug = decodeURIComponent(match[1]);
    } catch {
      slug = null; // malformed escape — let the route 404 it
    }
    // A UUID here is a legacy thesis id already handled above; never gate it.
    if (!slug || UUID_SLUG_RE.test(slug)) break;
    const verdict = await gateResourceSlug(cfg, slug, {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    });
    if (verdict?.kind === "not-found") {
      const res = NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url));
      return applySecurity(res);
    }
    // A retired slug (currently only catalogs, whose slug is editable) gets a
    // real 301 to the record's current URL, keeping the locale prefix and the
    // query string so a shared link survives the rename intact.
    if (verdict?.kind === "redirect") {
      const prefix = activeLocale === "en" ? "" : `/${activeLocale}`;
      const target = new URL(
        `${prefix}/${segment}/${encodeURIComponent(verdict.slug)}${url.search}`,
        request.url,
      );
      return applySecurity(NextResponse.redirect(target, 301));
    }
    break; // ok / null → fall through to the page unchanged.
  }

  // Signal the resolved locale to i18n/request.ts (mirrors x-nonce above).
  request.headers.set('x-locale', activeLocale);

  // For the default locale, invisibly rewrite to the /en segment so the file
  // router matches app/[locale]/(public)/... — the browser URL and any
  // client-side usePathname() still see the clean, unprefixed path. For km,
  // the prefix is already real in the URL; no rewrite needed.
  const buildLocaleResponse = () => {
    if (activeLocale === "en") {
      // "/" must rewrite to exactly "/en" (not "/en/") to match the root page.
      const rewritePath = pathWithoutLocale === "/" ? "/en" : "/en" + pathWithoutLocale;
      const rewriteUrl = new URL(rewritePath + url.search, request.url);
      return NextResponse.rewrite(rewriteUrl, { request: { headers: request.headers } });
    }
    return NextResponse.next({ request: { headers: request.headers } });
  };

  // ── Fast path: most public routes need no Supabase call ──────
  const isProtected = PROTECTED_PREFIXES.some((p) => pathWithoutLocale.startsWith(p));
  if (!isProtected) {
    return applySecurity(buildLocaleResponse());
  }

  // ── /dashboard, /profile require an active session ───────────
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let user = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error && error instanceof AuthApiError && error.code === 'refresh_token_not_found') {
      await supabase.auth.signOut();
      const loginUrl = new URL('/auth/login', request.url);
      const res = NextResponse.redirect(loginUrl);
      response.cookies.getAll().forEach((c) => res.cookies.set(c));
      return applySecurity(res);
    }
    user = data?.user ?? null;
  } catch (err) {
    if (err instanceof AuthApiError && err.code === 'refresh_token_not_found') {
      await supabase.auth.signOut();
      const loginUrl = new URL('/auth/login', request.url);
      const res = NextResponse.redirect(loginUrl);
      response.cookies.getAll().forEach((c) => res.cookies.set(c));
      return applySecurity(res);
    }
    // Other auth errors — proceed with user = null
  }

  const copyCookies = (newRes: NextResponse) => {
    response.cookies.getAll().forEach((c) => newRes.cookies.set(c));
    return newRes;
  };

  if (!user) {
    const loginUrl = new URL("/auth/login", request.url);
    // Reject open-redirect attempts before setting callbackUrl. Preserve the
    // original (locale-prefixed) path so post-login lands back on the right locale.
    const raw = pathname;
    if (raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\")) {
      loginUrl.searchParams.set("callbackUrl", raw);
    }
    return applySecurity(copyCookies(NextResponse.redirect(loginUrl)));
  }

  return applySecurity(copyCookies(buildLocaleResponse()));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|json)$).*)",
  ],
};
