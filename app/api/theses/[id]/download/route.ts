// Secure thesis PDF download. UNLIKE /api/theses/[id]/file (public inline
// preview / in-app reader), this route is the GATED action: it requires an
// authenticated reader with a complete Download Access Profile and enforces the
// Top-10 / admin-override policy SERVER-SIDE via the shared permission engine.
// The decision is re-evaluated here every time — a page that previously showed
// "Download" cannot be replayed to bypass a policy that has since changed.
//
// It streams the file through the server (never exposing the private storage
// URL) with `private, no-store`, and is NOT matched by FILE_ROUTE_RE, so the
// service worker treats it as private NetworkOnly (never cached) — see
// lib/sw-policy.ts.
import { NextResponse, type NextRequest } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy } from "@/lib/rate-limit-policy";
import { logSecurityEvent } from "@/lib/security-log";
import { logDownloadAttempt } from "@/lib/analytics/events";
import { zimaFetch } from "@/lib/zima";
import { evaluateThesisDownload, type ThesisPolicyRow } from "@/lib/theses/download-permission";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const NO_STORE = "private, no-cache, no-store, max-age=0, must-revalidate";

/** JSON error with private, no-store headers — never leaks internal detail. */
function deny(reason: string, status: number) {
  return NextResponse.json({ error: reason, reason }, { status, headers: { "Cache-Control": NO_STORE } });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // 1. Authentication — anonymous downloads are never allowed.
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return deny("AUTHENTICATION_REQUIRED", 401);

  // Idempotency key for denied/failed events: collapses double-clicks/retries
  // within the same minute so one accidental burst is a single recorded event.
  const denyIdem = (reason: string) =>
    `dl-deny:${user.id}:${id}:${reason}:${Math.floor(Date.now() / 60_000)}`;

  // 2. Per-user rate limit.
  const { limit, windowMs } = ratePolicy("download");
  const rl = await rateLimit(`thesis-download:${user.id}`, limit, windowMs);
  if (!rl.success) {
    logSecurityEvent({ type: "rate_limited", where: "/api/theses/[id]/download", userId: user.id });
    await logDownloadAttempt({
      status: "denied", resourceType: "thesis", resourceId: id, userId: user.id,
      reason: "RATE_LIMITED", idempotencyKey: denyIdem("RATE_LIMITED"),
    });
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: {
        "Cache-Control": NO_STORE,
        "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)),
      },
    });
  }

  const service = createServiceClient();

  // 3. Load the thesis (all policy inputs).
  // select("*") (not an explicit column list) so this route keeps working on a
  // database where migration 0093 hasn't been applied yet — download_override
  // is simply absent and the engine treats it as 'inherit' (automatic policy).
  const { data: report, error } = await service
    .from("research_reports")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !report) {
    await logDownloadAttempt({
      status: "denied", resourceType: "thesis", resourceId: id, userId: user.id,
      reason: "THESIS_UNPUBLISHED", idempotencyKey: denyIdem("THESIS_UNPUBLISHED"),
    });
    return deny("THESIS_UNPUBLISHED", 404);
  }

  // 4–8. Centralized, server-side permission decision (re-evaluated now).
  const decision = await evaluateThesisDownload({ service, report: report as ThesisPolicyRow, userId: user.id });

  if (!decision.allowed) {
    // Record the denial (with rank + policy source) so /admin/logs shows WHY —
    // and so it is counted as a denied attempt, never a successful download.
    await logDownloadAttempt({
      status: decision.reason === "FILE_UNAVAILABLE" ? "failed" : "denied",
      resourceType: "thesis", resourceId: report.id as string, userId: user.id,
      reason: decision.reason, permissionSource: decision.policySource,
      rankAtEvent: decision.rank, idempotencyKey: denyIdem(decision.reason),
    });
    if (decision.reason === "THESIS_UNPUBLISHED") return deny(decision.reason, 404);
    if (decision.reason === "FILE_UNAVAILABLE") return deny(decision.reason, 404);
    // TOP_TEN_RESTRICTED / ADMIN_BLOCKED / PROFILE_INCOMPLETE → 403.
    logSecurityEvent({ type: "auth_forbidden", where: "/api/theses/[id]/download", userId: user.id });
    return deny(decision.reason, 403);
  }

  const fileUrl = report.file_url as string;

  // 9. Verify the file is actually retrievable BEFORE counting. A "successful
  //    download" is only recorded once the server has an eligible file response
  //    in hand — storage/signing failures are recorded as `failed`, never as a
  //    successful download (they must not inflate the counter).
  let body: ReadableStream<Uint8Array> | null = null;
  let contentLength: string | null = null;

  if (fileUrl.startsWith("https://") || fileUrl.startsWith("http://")) {
    const upstream = await zimaFetch(fileUrl, null);
    if (!upstream.ok && upstream.status !== 206) {
      await logDownloadAttempt({
        status: "failed", resourceType: "thesis", resourceId: report.id as string, userId: user.id,
        reason: "STORAGE_ERROR", permissionSource: decision.policySource, rankAtEvent: decision.rank,
        idempotencyKey: denyIdem("STORAGE_ERROR"),
      });
      return deny("FILE_UNAVAILABLE", 404);
    }
    body = upstream.body;
    contentLength = upstream.headers.get("content-length");
  } else {
    // Legacy bare R2 key — short-lived (60s) presigned GET, streamed server-side.
    const key = fileUrl.startsWith("https://")
      ? new URL(fileUrl).pathname.replace(/^\//, "")
      : fileUrl;
    let r2Res: Response;
    try {
      const presignedUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key }),
        { expiresIn: 60 },
      );
      r2Res = await fetch(presignedUrl);
    } catch {
      await logDownloadAttempt({
        status: "failed", resourceType: "thesis", resourceId: report.id as string, userId: user.id,
        reason: "STORAGE_ERROR", permissionSource: decision.policySource, rankAtEvent: decision.rank,
        idempotencyKey: denyIdem("STORAGE_ERROR"),
      });
      return deny("FILE_UNAVAILABLE", 404);
    }
    if (!r2Res.ok) {
      await logDownloadAttempt({
        status: "failed", resourceType: "thesis", resourceId: report.id as string, userId: user.id,
        reason: "STORAGE_ERROR", permissionSource: decision.policySource, rankAtEvent: decision.rank,
        idempotencyKey: denyIdem("STORAGE_ERROR"),
      });
      return deny("FILE_UNAVAILABLE", 404);
    }
    body = r2Res.body;
    contentLength = r2Res.headers.get("content-length");
  }

  // 10. Record the authorized download exactly once. Idempotency window: skip
  //     the counter + event if the same reader downloaded this thesis in the
  //     last 30s (double-click, retry, StrictMode remount, reconnect). The file
  //     is still served — only the analytics write is de-duplicated.
  let alreadyCounted = false;
  {
    const since = new Date(Date.now() - 30_000).toISOString();
    const { data: recent } = await service
      .from("research_report_downloads")
      .select("id")
      .eq("report_id", report.id)
      .eq("user_id", user.id)
      .gte("downloaded_at", since)
      .limit(1);
    alreadyCounted = !!(recent && recent.length > 0);
  }

  if (!alreadyCounted) {
    // Minimal institutional snapshots only (never the full profile).
    const { data: prof } = await service
      .from("profiles")
      .select("role, institution_type, download_purpose")
      .eq("id", user.id)
      .maybeSingle();

    await Promise.all([
      service.from("research_report_downloads").insert({
        report_id: report.id,
        user_id: user.id,
        permission_source: decision.policySource,
        rank_at_download: decision.rank,
        institution_type_snapshot: prof?.institution_type ?? null,
        role_snapshot: prof?.role ?? null,
        purpose_snapshot: prof?.download_purpose ?? null,
      }),
      service.rpc("increment_research_download_count", { row_id: report.id }),
    ]);
  }

  // 11–12. Stream the file (never expose the storage URL); private no-store.
  const safeTitle = encodeURIComponent(`${report.title}.pdf`);
  const disposition = `attachment; filename="${safeTitle}"; filename*=UTF-8''${safeTitle}`;
  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", disposition);
  headers.set("Cache-Control", NO_STORE);
  if (contentLength) headers.set("Content-Length", contentLength);
  return new NextResponse(body, { headers, status: 200 });
}
