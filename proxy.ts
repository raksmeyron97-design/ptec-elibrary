// proxy.ts  (root of project — Next.js 16 uses "proxy" instead of "middleware")
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Paths that require an active session on the main domain
const PROTECTED_PREFIXES = ["/dashboard", "/profile"];

export async function proxy(request: NextRequest) {
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
