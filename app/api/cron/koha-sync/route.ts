import { NextRequest, NextResponse } from "next/server";

import { logSecurityEvent } from "@/lib/security-log";
import { verifyBearer } from "@/lib/security/bearer";
import { startKohaSync } from "@/lib/koha/sync-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/koha-sync[?mode=full]
 *
 * Keeps the Physical Library in step with Koha (docs/KOHA-SYNC.md).
 * Scheduled by .github/workflows/cron.yml like every other cron route (the
 * self-hosted container schedules nothing itself), with the same
 * `Authorization: Bearer $CRON_SECRET` contract.
 *
 *   default      incremental: what Koha changed since the last run — loans,
 *                returns, new and edited records. Every 15 minutes.
 *   ?mode=full   everything, which is also the only way to see what Koha
 *                DELETED (an incremental read cannot prove an absence). Nightly.
 *
 * It only STARTS a run (in the background — a full read outlives a tunnelled
 * request) and answers 202. It starts nothing until a person has applied the
 * first full build from /admin/catalogs/koha-sync, and nothing while the
 * integration is off; both answer 409 with the reason, which is the normal
 * state before Koha is connected and not an error.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[/api/cron/koha-sync] CRON_SECRET is not configured");
    return NextResponse.json({ error: "Cron not configured" }, { status: 500 });
  }
  if (!verifyBearer(request.headers.get("authorization"), secret)) {
    logSecurityEvent({ type: "cron_auth_failed", where: "/api/cron/koha-sync" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mode = request.nextUrl.searchParams.get("mode") === "full" ? "full" : "incremental";
  try {
    // The scheduled job never runs a first build: that is a person's decision.
    const r = await startKohaSync({ mode, apply: true, actorId: null, trigger: "cron", requireInitialized: true });
    return r.started
      ? NextResponse.json({ started: true, mode }, { status: 202 })
      : NextResponse.json({ started: false, mode, reason: r.reason }, { status: 409 });
  } catch (e) {
    console.error("[/api/cron/koha-sync]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Koha sync could not start" }, { status: 500 });
  }
}
