import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { logSecurityEvent } from "@/lib/security-log";
import { verifyBearer } from "@/lib/security/bearer";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/cleanup
 *
 * Purges stale rows from the `rate_limit` table via the `cleanup_rate_limit()`
 * RPC (migration 0031). Rows idle for more than 24 h are deleted to prevent
 * table bloat — without this, sliding-window keys accumulate forever.
 *
 * ── Who calls this ────────────────────────────────────────────────────────
 * Nothing about this route is platform-specific: it is a GET carrying
 * `Authorization: Bearer $CRON_SECRET`, so any scheduler that can send a
 * header works. That matters because the self-hosted Docker container has no
 * built-in scheduler the way Vercel Cron was.
 *
 * The scheduler of record is .github/workflows/cron.yml, daily at 20:00 UTC
 * (= 03:00 Asia/Phnom_Penh, off-peak for the library). It runs off-box on
 * purpose: it still fires, and still alerts, when the box or the college's
 * network is down. docs/ZIMAOS-DEPLOYMENT.md documents an on-box cron
 * container as the alternative — run one or the other, not both.
 *
 * CRON_SECRET (a long random string, e.g. `openssl rand -hex 32`) must match
 * between the box's .env and the GitHub repo secret. By hand:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     https://library.ptec.edu.kh/api/cron/cleanup
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[/api/cron/cleanup] CRON_SECRET is not configured");
    return NextResponse.json({ error: "Cron not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (!verifyBearer(authHeader, secret)) {
    logSecurityEvent({ type: "cron_auth_failed", where: "/api/cron/cleanup" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServiceClient();
  const { error } = await db.rpc("cleanup_rate_limit");

  if (error) {
    console.error("[/api/cron/cleanup] cleanup_rate_limit failed:", error.message);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }

  // Retention purges (docs/DATA-GOVERNANCE.md): raw search analytics after
  // 365 days, content version snapshots after 400. Both RPCs ship with
  // migrations 0086/0087 — a missing-function error just means they aren't
  // applied yet, so the sweep skips them rather than failing the cron.
  const retention: Record<string, number | string> = {};
  for (const [fn, args] of [
    ["purge_search_analytics", { retain_days: 365 }],
    ["purge_content_versions", { retain_days: 400 }],
  ] as const) {
    const { data, error: purgeError } = await db.rpc(fn, args);
    if (purgeError) {
      if (!/could not find|does not exist/i.test(purgeError.message)) {
        console.error(`[/api/cron/cleanup] ${fn} failed:`, purgeError.message);
        retention[fn] = "error";
      }
    } else {
      retention[fn] = data ?? 0;
    }
  }

  return NextResponse.json({ ok: true, cleaned: "rate_limit", retention });
}
