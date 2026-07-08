import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { logSecurityEvent } from "@/lib/security-log";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/publish-scheduled
 *
 * Flips posts from `status = 'scheduled'` to `'published'` once their
 * `scheduled_at` has passed. The `posts_sync_publish_status` trigger
 * (migration 0073) then cascades `is_published`/`published_at` automatically.
 *
 * ── Setup ─────────────────────────────────────────────────────────────────
 * Same CRON_SECRET pattern as /api/cron/cleanup — add to vercel.json:
 *   { "crons": [{ "path": "/api/cron/publish-scheduled", "schedule": "*\/15 * * * *" }] }
 * (Vercel Hobby plans only allow once-daily crons; on Hobby, use an external
 * pinger — e.g. cron-job.org — hitting this URL every few minutes instead,
 * with the same `Authorization: Bearer $CRON_SECRET` header.)
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[/api/cron/publish-scheduled] CRON_SECRET is not configured");
    return NextResponse.json({ error: "Cron not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    logSecurityEvent({ type: "cron_auth_failed", where: "/api/cron/publish-scheduled" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServiceClient();
  const { data, error } = await db
    .from("posts")
    .update({ status: "published" })
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .select("id, slug");

  if (error) {
    console.error("[/api/cron/publish-scheduled] update failed:", error.message);
    return NextResponse.json({ error: "Publish sweep failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, published: (data ?? []).length, slugs: (data ?? []).map((p) => p.slug) });
}
