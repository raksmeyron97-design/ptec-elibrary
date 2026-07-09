import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { logSecurityEvent } from "@/lib/security-log";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/publish-scheduled
 *
 * Flips posts and theses from `status = 'scheduled'` to `'published'` once
 * their `scheduled_at` has passed. The `posts_sync_publish_status` (0073)
 * and `research_reports_sync_publish_status` (0075) triggers then cascade
 * `is_published`/`published_at` automatically.
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
  const now = new Date().toISOString();

  const [posts, theses] = await Promise.all([
    db.from("posts").update({ status: "published" }).eq("status", "scheduled").lte("scheduled_at", now).select("id, slug"),
    db.from("research_reports").update({ status: "published" }).eq("status", "scheduled").lte("scheduled_at", now).select("id, slug"),
  ]);

  if (posts.error) console.error("[/api/cron/publish-scheduled] posts update failed:", posts.error.message);
  if (theses.error) console.error("[/api/cron/publish-scheduled] theses update failed:", theses.error.message);
  if (posts.error && theses.error) {
    return NextResponse.json({ error: "Publish sweep failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    published: (posts.data ?? []).length + (theses.data ?? []).length,
    postSlugs: (posts.data ?? []).map((p) => p.slug),
    thesisSlugs: (theses.data ?? []).map((t) => t.slug),
  });
}
