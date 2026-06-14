// proxy.ts  (root of project — Next.js 16 uses "proxy" instead of "middleware")
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Paths that require an active session on the main domain
const PROTECTED_PREFIXES = ["/dashboard", "/profile"];

export async function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID();
  const nonceB64 = Buffer.from(nonce).toString('base64');
  
    const isDev = process.env.NODE_ENV === 'development';
    const cspHeader = `
      default-src 'self';
      script-src 'self' 'nonce-${nonceB64}'${isDev ? " 'unsafe-eval'" : ''} https://challenges.cloudflare.com;
      style-src 'self' 'unsafe-inline';
      img-src 'self' data: blob: https://lh3.googleusercontent.com https://avatars.googleusercontent.com https://avatars.githubusercontent.com https://covers.openlibrary.org https://images-na.ssl-images-amazon.com https://*.r2.dev https://*.public.blob.vercel-storage.com https://*.supabase.co https://drive.google.com https://*.flagcounter.com;
      font-src 'self' data:;
      connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.public.blob.vercel-storage.com https://*.r2.dev https://accounts.google.com https://challenges.cloudflare.com;
      frame-src https://challenges.cloudflare.com https://www.google.com;
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
  const { data: { user } } = await supabase.auth.getUser();

  const { nextUrl: url } = request;
  const host = request.headers.get("host") ?? "";
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const isAdminHost = host === `admin.${rootDomain}` || host.startsWith("admin.");

  // Helper to copy cookies from the refreshed response to a new response
  const copyCookies = (newRes: NextResponse) => {
    response.cookies.getAll().forEach((c) => {
      newRes.cookies.set(c);
    });
    return newRes;
  };

  // ── Admin Subdomain Logic ────────────────────────────────────
  if (isAdminHost) {
    const effectivePath = url.pathname.startsWith("/admin") ? url.pathname : `/admin${url.pathname}`;

    if (effectivePath.startsWith("/admin")) {
      if (effectivePath !== "/admin/login" && effectivePath !== "/admin/auth/signout") {
        if (!user) {
          const res = NextResponse.redirect(new URL("/admin/login", request.url));
          return copyCookies(res);
        }
      }
    }

    if (!url.pathname.startsWith("/admin")) {
      const rewriteUrl = new URL(`/admin${url.pathname}`, request.url);
      const res = NextResponse.rewrite(rewriteUrl);
      return copyCookies(res);
    }
    return response;
  }

  // ── Main Domain Logic ─────────────────────────────────────────

  // Prevent accessing /admin routes from the main domain
  if (!isAdminHost && url.pathname.startsWith("/admin")) {
    const res = NextResponse.rewrite(new URL("/404", request.url));
    return copyCookies(res);
  }

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
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
