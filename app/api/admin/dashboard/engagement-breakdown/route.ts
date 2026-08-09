import { NextResponse, type NextRequest } from "next/server";
import { requireStaff, isAdminAuthError } from "@/lib/auth/requireAdmin";
import { rateLimit } from "@/lib/rate-limit";
import {
  ANALYTICS_LIMITS,
  parseEngagementBreakdownRequest,
} from "@/lib/admin/engagement-breakdown";
import {
  BreakdownScopeError,
  BreakdownTimeoutError,
  getEngagementBreakdown,
} from "@/lib/admin/engagement-breakdown.server";

export const dynamic = "force-dynamic";

/** Canonical, metric-aware point details for Engagement Analytics V2. */
export async function GET(request: NextRequest) {
  const startedAt = performance.now();
  try {
    const { userId } = await requireStaff();
    const { success } = await rateLimit(
      `dashboard-engagement-breakdown:${userId}`,
      ANALYTICS_LIMITS.rateLimitPerUserPerMinute,
      60_000,
    );
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Try again shortly.", code: "rate_limited" },
        { status: 429 },
      );
    }

    const parsed = parseEngagementBreakdownRequest(request.nextUrl.searchParams);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: "Invalid engagement breakdown request.", code: parsed.error },
        { status: 400 },
      );
    }

    const data = await getEngagementBreakdown(parsed.value, {
      deadlineAt: Date.now() + ANALYTICS_LIMITS.requestTimeoutMs,
    });
    const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;
    console.info("[engagement-breakdown]", {
      metric: data.metric,
      grain: data.grain,
      rowsScanned: data.rowsScanned,
      partial: data.partial,
      rankingStatus: data.ranking.status,
      durationMs,
    });
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "private, no-store",
        "Server-Timing": `engagement-breakdown;dur=${durationMs}`,
      },
    });
  } catch (error) {
    if (isAdminAuthError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof BreakdownScopeError) {
      return NextResponse.json(
        { error: error.message, code: "bucket_outside_range" },
        { status: 400 },
      );
    }
    if (error instanceof BreakdownTimeoutError) {
      console.warn("[engagement-breakdown] timeout", {
        durationMs: Math.round(performance.now() - startedAt),
      });
      return NextResponse.json(
        { error: "Engagement breakdown timed out.", code: "timeout" },
        { status: 504 },
      );
    }
    console.error("[engagement-breakdown] query_failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      durationMs: Math.round(performance.now() - startedAt),
    });
    return NextResponse.json(
      { error: "Could not load engagement breakdown.", code: "query_failed" },
      { status: 500 },
    );
  }
}
