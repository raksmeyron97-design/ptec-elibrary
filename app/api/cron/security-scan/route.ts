import { NextRequest, NextResponse } from "next/server";
import { logSecurityEvent } from "@/lib/security-log";
import { verifyBearer } from "@/lib/security/bearer";
import { runSecurityScan } from "@/lib/security/incidents";

export const dynamic = "force-dynamic";
// The pass reads up to SECURITY_DETECT_MAX_EVENTS rows and may send several
// notifications; 60 s is generous for PTEC's volume but bounded.
export const maxDuration = 60;

/**
 * GET /api/cron/security-scan
 *
 * The detection + incident + notification pass. Reads the security events
 * written by the request path, runs every detector, opens or updates
 * incidents, sends at most one notification per incident state change, and
 * recovers incidents that have gone quiet.
 *
 * ── Who calls this ────────────────────────────────────────────────────────
 * Platform-neutral, like the other cron routes: a GET carrying
 * `Authorization: Bearer $CRON_SECRET`. The scheduler of record is
 * .github/workflows/cron.yml, every 5 minutes. It runs off-box on purpose —
 * it keeps firing when the box or the college network is down, which is when
 * you most want to know.
 *
 * ── Why a cron pass rather than detection on the request path ─────────────
 * Detection is aggregation: "10 failures in 15 minutes" cannot be answered by
 * the request that produced the tenth failure without querying the other nine.
 * Doing that inline would put a range scan on every rate-limited request —
 * exactly the "expensive aggregation on every normal request" the design
 * forbids (brief §29). The request path writes one buffered row; this pass
 * does the thinking.
 *
 * The in-process spike detector in lib/security-log.ts remains the fast first
 * stage for a burst inside a single second; this is the durable second stage
 * that survives restarts.
 *
 * Idempotent: overlapping runs cannot double-open an incident (the partial
 * unique index in migration 0127 enforces one live incident per fingerprint)
 * and cannot double-notify (alert_count is incremented in the same pass that
 * sends).
 *
 * By hand:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     https://library.ptec.edu.kh/api/cron/security-scan
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[/api/cron/security-scan] CRON_SECRET is not configured");
    return NextResponse.json({ error: "Cron not configured" }, { status: 500 });
  }

  if (!verifyBearer(request.headers.get("authorization"), secret)) {
    logSecurityEvent({ type: "cron_auth_failed", where: "/api/cron/security-scan" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const summary = await runSecurityScan(startedAt);
    return NextResponse.json(
      { ok: true, durationMs: Date.now() - startedAt, ...summary },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    // A failed scan is an operational problem, not a security event: say so
    // plainly and let the scheduler's own failure alert carry it. Returning
    // 500 is what makes cron.yml notice.
    const message = e instanceof Error ? e.message : String(e);
    console.error("[/api/cron/security-scan] pass failed:", message);
    return NextResponse.json(
      { ok: false, error: "Security scan failed", durationMs: Date.now() - startedAt },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
