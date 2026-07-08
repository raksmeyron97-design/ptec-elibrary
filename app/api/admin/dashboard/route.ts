import { NextResponse, type NextRequest } from "next/server";
import { requireStaff, isAdminAuthError } from "@/lib/auth/requireAdmin";
import { rateLimit } from "@/lib/rate-limit";
import { getDashboardData, parseDashboardSpec, DASHBOARD_RANGES } from "@/lib/admin/dashboard";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/dashboard?range=30d
 *
 * Single aggregated payload for the admin dashboard (summary, trends,
 * comparisons, top lists, departments, attention items, recent activity).
 * The dashboard page itself renders server-side from the same
 * getDashboardData() call; this route exists for client refreshes and
 * programmatic access.
 *
 * Auth: any admin-panel role (staff+), MFA-verified — same gate as the
 * dashboard page. Rate-limited per user.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireStaff();

    const { success } = await rateLimit(`admin-dashboard:${userId}`, 30, 60_000);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Try again shortly." },
        { status: 429 },
      );
    }

    const params = request.nextUrl.searchParams;
    const rangeParam = params.get("range") ?? "30d";
    if (!DASHBOARD_RANGES.includes(rangeParam as (typeof DASHBOARD_RANGES)[number])) {
      return NextResponse.json(
        { error: `Invalid range. Use one of: ${DASHBOARD_RANGES.join(", ")}` },
        { status: 400 },
      );
    }

    // parseDashboardSpec validates custom from/to (format, order, ≤365 days)
    // and falls back to 30d rather than erroring on bad input.
    const spec = parseDashboardSpec({
      range: rangeParam,
      from: params.get("from"),
      to: params.get("to"),
    });

    const data = await getDashboardData(spec);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, max-age=30" },
    });
  } catch (error) {
    if (isAdminAuthError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[api/admin/dashboard]", error);
    return NextResponse.json(
      { error: "Could not load dashboard data." },
      { status: 500 },
    );
  }
}
