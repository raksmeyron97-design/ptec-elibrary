import { createServerClient } from "@supabase/ssr";
import { AuthApiError } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Paths that require an active session on the main domain
const PROTECTED_PREFIXES = ["/dashboard", "/profile"];

export async function middleware(request: NextRequest) {
  const nonce = crypto.randomUUID();
  const nonceB64 = Buffer.from(nonce).toString('base64');
  
    const isDev = process.env.NODE_ENV === 'development';
    const cspHeader = `
      default-src 'self';
      script-src 'self' 'nonce-${nonceB64}'${isDev ? " 'unsafe-eval'" : ''} https://challenges.cloudflare.com https://cse.google.com https://www.google.com;
      style-src 'self' 'unsafe-inline' https://www.google.com https://cse.google.com https://fonts.googleapis.com;
      img-src 'self' data: blob: https://lh3.googleusercontent.com https://avatars.googleusercontent.com https://avatars.githubusercontent.com https://covers.openlibrary.org https://images-na.ssl-images-amazon.com https://*.r2.dev https://*.public.blob.vercel-storage.com https://*.supabase.co https://drive.google.com https://*.flagcounter.com https://*.gstatic.com https://www.google.com https://encrypted-tbn0.gstatic.com;
      font-src 'self' data: https://fonts.gstatic.com;
      connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.public.blob.vercel-storage.com https://*.r2.dev https://*.r2.cloudflarestorage.com https://accounts.google.com https://challenges.cloudflare.com https://api.storage-ptec.online https://cse.google.com https://www.googleapis.com https://customsearch.googleapis.com https://*.google.com https://clients1.google.com;
      frame-src https://challenges.cloudflare.com https://www.google.com https://cse.google.com;
      frame-ancestors 'none';
      object-src 'none';
      base-uri 'self';
      form-action 'self';
    `.replace(/\s{2,}/g, ' ').trim();

  request.headers.set('x-nonce', nonceB64);
  request.headers.set('Content-Security-Policy', cspHeader);

  let response = NextResponse.next({
    request: { headers: request.headers },
  });
  
  response.headers.set('Content-Security-Policy', cspHeader);
  response.headers.set('x-nonce', nonceB64);

  const { nextUrl: url } = request;

  // Fast-path redirect for main domain root to bypass Supabase network calls
  if (url.pathname === "/") {
    const res = NextResponse.redirect(new URL("/home", request.url));
    res.headers.set('Content-Security-Policy', cspHeader);
    res.headers.set('x-nonce', nonceB64);
    return res;
  }

  // ── Fast-path for public routes ──────────────────────────────
  // If the route doesn't need auth protection or redirection, return immediately
  // to avoid a blocking Supabase network request (getUser) on every public page load.
  const needsAuthCheck =
    url.pathname.startsWith("/admin") ||
    url.pathname.startsWith("/auth/login") ||
    PROTECTED_PREFIXES.some((p) => url.pathname.startsWith(p));

  if (!needsAuthCheck) {
    return response;
  }

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
      return res;
    }
    user = data?.user ?? null;
  } catch (err) {
    if (err instanceof AuthApiError && err.code === 'refresh_token_not_found') {
      await supabase.auth.signOut();
      const loginUrl = new URL('/auth/login', request.url);
      const res = NextResponse.redirect(loginUrl);
      response.cookies.getAll().forEach((c) => res.cookies.set(c));
      return res;
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
  if (url.pathname.startsWith("/admin")) {
    if (url.pathname !== "/admin/login" && url.pathname !== "/admin/auth/signout") {
      if (!user) {
        const res = NextResponse.redirect(new URL("/admin/login", request.url));
        return copyCookies(res);
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
        return copyCookies(res);
      }
    }
  }

  // ── Main Domain Logic ─────────────────────────────────────────

  // Redirect logged-in users away from login page
  if (url.pathname === "/auth/login" && user) {
    const res = NextResponse.redirect(new URL("/books", request.url));
    return copyCookies(res);
  }

  // Protect /dashboard/*, /profile/*, /api/books/*
  const isProtected = PROTECTED_PREFIXES.some((p) => url.pathname.startsWith(p));
  if (isProtected && !user) {
    const loginUrl = new URL("/auth/login", request.url);
    // Reject open-redirect attempts before setting callbackUrl
    const raw = url.pathname;
    if (raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\")) {
      loginUrl.searchParams.set("callbackUrl", raw);
    }
    return copyCookies(NextResponse.redirect(loginUrl));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|json)$).*)",
  ],
};
