// proxy.ts  (root of project — Next.js 16 uses "proxy" instead of "middleware")
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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
    // Determine the actual path (after potential rewrite)
    const effectivePath = url.pathname.startsWith("/admin") ? url.pathname : `/admin${url.pathname}`;
    
    // Auth Check for Admin
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

  // 2. Redirect logged-in users away from login page
  if (url.pathname === "/auth/login" && user) {
    const res = NextResponse.redirect(new URL("/books", request.url));
    return copyCookies(res);
  }

  // 3. Protect /dashboard/*
  if (url.pathname.startsWith("/dashboard") && !user) {
    const res = NextResponse.redirect(new URL("/auth/login", request.url));
    return copyCookies(res);
  }

  // 4. Protect /books/[slug]/download
  const bookDownloadRegex = /^\/books\/[^/]+\/download$/;
  if (bookDownloadRegex.test(url.pathname) && !user) {
    const res = NextResponse.redirect(new URL("/auth/login", request.url));
    return copyCookies(res);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};