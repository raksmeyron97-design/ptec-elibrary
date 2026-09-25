/**
 * GET /api/admin/catalogs/cover-preview?src=<Open Library cover URL>
 *
 * Lets the Add-by-ISBN screens SHOW a found cover without the browser ever
 * loading it from the provider: Open Library redirects to archive.org, which
 * the CSP does not allow, and a same-origin image is always allowed. The
 * server fetches through the same guarded path it uses on save
 * (lib/isbn/cover-source.ts — one URL shape, hand-followed redirects on an
 * allow-list, a size cap, a magic-byte check) and returns the bytes with their
 * SNIFFED type and `nosniff`, so they can only ever be read as that image.
 * (Middleware sets this path's CSP; a route-level CSP header would be replaced.)
 *
 * Catalogue editors only, rate-limited per librarian. Nothing is stored.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requirePermission, isAdminAuthError } from "@/lib/auth/requireAdmin";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy } from "@/lib/rate-limit-policy";
import { fetchCoverSource, isAllowedCoverSource } from "@/lib/isbn/cover-source";
import { sniffImageType } from "@/lib/catalog-cover-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await requirePermission("catalog", "write");

    const policy = ratePolicy("coverPreview");
    const { success } = await rateLimit(`cover-preview:${userId}`, policy.limit, policy.windowMs);
    if (!success) return NextResponse.json({ error: "Too many previews. Try again shortly." }, { status: 429 });

    const src = request.nextUrl.searchParams.get("src");
    if (!isAllowedCoverSource(src)) return NextResponse.json({ error: "Not an allowed cover source." }, { status: 400 });

    const fetched = await fetchCoverSource(src, { fetch: (u, i) => fetch(u, i) });
    if (!fetched.ok) return NextResponse.json({ error: fetched.reason }, { status: 502 });

    return new Response(fetched.bytes, {
      headers: {
        // The sniffed type, never the provider's claim.
        "Content-Type": sniffImageType(new Uint8Array(fetched.bytes))!,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (isAdminAuthError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[/api/admin/catalogs/cover-preview]", error);
    return NextResponse.json({ error: "Preview failed" }, { status: 500 });
  }
}
