import { NextRequest, NextResponse } from "next/server";

import { logSecurityEvent } from "@/lib/security-log";
import { verifyBearer } from "@/lib/security/bearer";
import { createServiceClient } from "@/lib/supabase/server";
import { reconcileIndex, DEFAULT_BATCH } from "@/lib/indexing/reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/index-reconcile
 *
 * Keeps the full-text retrieval index converging on the truth without anyone
 * watching it. Each run picks a BOUNDED batch of resources that need work —
 * never attempted, retry now due, indexed from a PDF that has since been
 * replaced, or holding a claim that went cold — and re-runs extraction.
 *
 * Why a cron at all: migrations 0133 and 0134 made indexing outcomes visible
 * and classifiable, but visible is not the same as fixed. A book whose first
 * attempt hit a storage blip stayed unsearchable until a human read a
 * dashboard, and the entire history of this subsystem is that nobody reads it
 * in time — the original defect ran five weeks in a `console.log`.
 *
 * Scheduled by .github/workflows/cron.yml alongside the other cron routes: the
 * self-hosted container schedules nothing itself. Same
 * `Authorization: Bearer $CRON_SECRET` contract as /api/cron/upload-reconcile;
 * there is deliberately no second authentication mechanism.
 *
 * Query parameters:
 *   ?limit=N    records this pass (default 10, hard-capped at 200 by the
 *               reconciler). The cap is not politeness — extraction is I/O and
 *               CPU over multi-megabyte PDFs, and a pass that runs long enough
 *               to overlap the next one is how a queue turns into a stampede.
 *   ?dry=1      report what would be processed and write nothing.
 *
 * Embedding is NOT chained here. Extraction is free and local; embedding
 * spends a metered quota with a per-day cap, and chaining them means one quota
 * stop aborts extraction work that would have succeeded. Embedding stays a
 * deliberate, separately scheduled sweep (`npm run backfill:index -- --embed`).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[/api/cron/index-reconcile] CRON_SECRET is not configured");
    return NextResponse.json({ error: "Cron not configured" }, { status: 500 });
  }
  if (!verifyBearer(request.headers.get("authorization"), secret)) {
    logSecurityEvent({ type: "cron_auth_failed", where: "/api/cron/index-reconcile" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const rawLimit = Number(params.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.trunc(rawLimit) : DEFAULT_BATCH;
  const dryRun = params.get("dry") === "1";

  try {
    const report = await reconcileIndex(createServiceClient(), {
      limit,
      dryRun,
      runnerId: `cron:${process.env.UPLOAD_INSTANCE_ID ?? process.pid}`,
    });

    /* One structured line per pass. Counts and ids only — never a storage URL,
       never a page of extracted text. An operator watching this should be able
       to see the backlog draining without the log becoming a copy of the
       library. */
    console.log(
      JSON.stringify({
        event: "index_reconcile",
        route: "/api/cron/index-reconcile",
        ts: new Date().toISOString(),
        dryRun,
        limit,
        ...report,
        items: undefined,
      }),
    );

    /* An environment mismatch is a 200 with a loud body, not a 500: the job
       did exactly the right thing by refusing to write verdicts it could not
       support, and paging someone at 3am for a correct refusal trains them to
       ignore the channel. It is still unmistakable in the response. */
    return NextResponse.json({ ok: true, dryRun, ...report });
  } catch (err) {
    console.error("[/api/cron/index-reconcile] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Reconciliation failed" },
      { status: 500 },
    );
  }
}
