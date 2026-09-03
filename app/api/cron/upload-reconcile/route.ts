import { NextRequest, NextResponse } from "next/server";

import { logSecurityEvent } from "@/lib/security-log";
import { verifyBearer } from "@/lib/security/bearer";
import { reconcileUploads } from "@/lib/uploads/reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/cron/upload-reconcile
 *
 * Closes the loop on chunked uploads: releases sessions whose request died
 * mid-transition, adopts files whose database row exists but whose session
 * never heard about it, marks genuinely unreferenced files as orphans, and
 * reclaims staging disk. See lib/uploads/reconcile.ts for what it will and will
 * not delete.
 *
 * Scheduled by .github/workflows/cron.yml alongside the other cron routes —
 * the self-hosted container schedules nothing itself. Same
 * `Authorization: Bearer $CRON_SECRET` contract as /api/cron/cleanup.
 *
 * `?purge=1` additionally DELETES storage objects that have been orphaned for
 * more than a week and are still unreferenced at the moment of deletion. It is
 * off by default and stays off on the schedule: the report is what an operator
 * needs, and an automatic deleter that is wrong once is worse than a disk that
 * is 2 GB fuller than it needs to be.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[/api/cron/upload-reconcile] CRON_SECRET is not configured");
    return NextResponse.json({ error: "Cron not configured" }, { status: 500 });
  }
  if (!verifyBearer(request.headers.get("authorization"), secret)) {
    logSecurityEvent({ type: "cron_auth_failed", where: "/api/cron/upload-reconcile" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const purge = request.nextUrl.searchParams.get("purge") === "1";
  try {
    const report = await reconcileUploads({ purge });
    return NextResponse.json({ ok: true, purge, ...report });
  } catch (err) {
    console.error("[/api/cron/upload-reconcile]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Reconciliation failed" },
      { status: 500 },
    );
  }
}
