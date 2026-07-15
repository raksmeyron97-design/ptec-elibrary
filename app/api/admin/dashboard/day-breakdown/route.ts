import { NextResponse, type NextRequest } from "next/server";
import { requireStaff, isAdminAuthError } from "@/lib/auth/requireAdmin";
import { rateLimit } from "@/lib/rate-limit";
import { getDayBreakdown } from "@/lib/admin/intelligence";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/dashboard/day-breakdown?bucket=YYYY-MM-DD[THH:00]
 *
 * Per-bucket breakdown behind the engagement chart's point drill-down: the
 * top titles viewed in that day/hour, with staff traffic excluded exactly
 * like every other dashboard metric. Auth: staff+ (same gate as the
 * Overview view that hosts the chart); rate-limited per user.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireStaff();

    const { success } = await rateLimit(`dashboard-drill:${userId}`, 30, 60_000);
    if (!success) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }

    const bucket = request.nextUrl.searchParams.get("bucket") ?? "";
    const data = await getDayBreakdown(bucket);
    if (!data) {
      return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
    }

    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (isAdminAuthError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[/api/admin/dashboard/day-breakdown]", error);
    return NextResponse.json({ error: "Breakdown failed" }, { status: 500 });
  }
}
