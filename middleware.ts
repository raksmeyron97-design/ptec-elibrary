import { createServerClient } from "@supabase/ssr";
import { AuthApiError } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Paths that require an active session on the main domain
const PROTECTED_PREFIXES = ["/dashboard", "/profile"];

// Legacy thesis detail URLs were /theses/<uuid>; they 301 to /theses/<slug>.
// (research_reports ids are uuids — there were never numeric thesis ids.)
const LEGACY_THESIS_RE =
  /^\/theses\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export async function middleware(request: NextRequest) {
  const nonce = crypto.randomUUID();
  const nonceB64 = Buffer.from(nonce).toString('base64');

    const cspHeader = `
      default-src 'self';
      script-src 'self' 'nonce-${nonceB64}' 'unsafe-eval' https://challenges.cloudflare.com https://va.vercel-scripts.com;
      style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
      img-src 'self' data: blob: https://lh3.googleusercontent.com https://avatars.googleusercontent.com https://avatars.githubusercontent.com https://covers.openlibrary.org https://images-na.ssl-images-amazon.com https://*.r2.dev https://*.public.blob.vercel-storage.com https://*.supabase.co https://drive.google.com https://*.gstatic.com https://encrypted-tbn0.gstatic.com https://*.storage-ptec.online https://storage-ptec.online;
      font-src 'self' data: https://fonts.gstatic.com;
      connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.public.blob.vercel-storage.com https://*.r2.dev https://*.r2.cloudflarestorage.com https://accounts.google.com https://challenges.cloudflare.com https://api.storage-ptec.online;
      frame-src https://challenges.cloudflare.com https://www.google.com;
      frame-ancestors 'none';
      object-src 'none';
      base-uri 'self';
      form-action 'self';
    `.replace(/\s{2,}/g, ' ').trim();

  request.headers.set('x-nonce', nonceB64);
  request.headers.set('Content-Security-Policy', cspHeader);

  // Attach the standard security headers to any response this middleware returns.
  const applySecurity = (res: NextResponse) => {
    res.headers.set('Content-Security-Policy', cspHeader);
    res.headers.set('x-nonce', nonceB64);
    return res;
  };

  const { nextUrl: url } = request;
  const pathname = url.pathname;

  // ── Admin / auth / API: entirely outside the locale-prefixed route tree ──
  // (admin) and (auth) route groups are not localized — no rewrite, no /km,
  // behavior here is unchanged from before locale routing was introduced.
  const isAdminOrAuthOrApi =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api");

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
      if (pathname !== "/admin/login" && pathname !== "/admin/auth/signout") {
        if (!user) {
          const res = NextResponse.redirect(new URL("/admin/login", request.url));
          return applySecurity(copyCookies(res));
        }

        // Check role — allow any admin-panel role
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        const adminPanelRoles = ['staff', 'librarian', 'admin', 'super_admin'];
        if (!adminPanelRoles.includes(profile?.role ?? '')) {
          const res = NextResponse.redirect(new URL("/home", request.url));
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
  const lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
  if (lastSegment.includes(".")) {
    return applySecurity(NextResponse.next({ request: { headers: request.headers } }));
  }

  // Explicit /en prefix is not canonical under "as-needed" — collapse to the
  // bare path in a single hop (redirects straight to /home if bare).
  if (pathname === "/en" || pathname.startsWith("/en/")) {
    const stripped = pathname === "/en" ? "/" : pathname.slice(3);
    const target = stripped === "/" ? "/home" : stripped;
    const res = NextResponse.redirect(new URL(target + url.search, request.url), 301);
    return applySecurity(res);
  }

  const isKm = pathname === "/km" || pathname.startsWith("/km/");
  const activeLocale: "en" | "km" = isKm ? "km" : "en";
  let pathWithoutLocale = isKm ? pathname.slice(3) : pathname;
  if (pathWithoutLocale === "") pathWithoutLocale = "/";
  const localePrefix = activeLocale === "km" ? "/km" : "";

  // Fast-path redirect for the domain/locale root to bypass Supabase network calls.
  // 308 (permanent) so search engines consolidate signals onto /home.
  if (pathWithoutLocale === "/") {
    const res = NextResponse.redirect(new URL(`${localePrefix}/home`, request.url), 308);
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
        const res = NextResponse.rewrite(new URL('/__not-found__', request.url));
        return applySecurity(res);
      }
    } catch {
      // Lookup failed — let the page route resolve or 404 the id itself.
    }
  }

  // Signal the resolved locale to i18n/request.ts (mirrors x-nonce above).
  request.headers.set('x-locale', activeLocale);

  // For the default locale, invisibly rewrite to the /en segment so the file
  // router matches app/[locale]/(public)/... — the browser URL and any
  // client-side usePathname() still see the clean, unprefixed path. For km,
  // the prefix is already real in the URL; no rewrite needed.
  const buildLocaleResponse = () => {
    if (activeLocale === "en") {
      const rewriteUrl = new URL('/en' + pathWithoutLocale + url.search, request.url);
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
