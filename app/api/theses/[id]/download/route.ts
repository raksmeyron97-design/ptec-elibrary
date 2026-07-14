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

  // 2. Per-user rate limit.
  const { limit, windowMs } = ratePolicy("download");
  const rl = await rateLimit(`thesis-download:${user.id}`, limit, windowMs);
  if (!rl.success) {
    logSecurityEvent({ type: "rate_limited", where: "/api/theses/[id]/download", userId: user.id });
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

  if (error || !report) return deny("THESIS_UNPUBLISHED", 404);

  // 4–8. Centralized, server-side permission decision (re-evaluated now).
  const decision = await evaluateThesisDownload({ service, report: report as ThesisPolicyRow, userId: user.id });

  if (!decision.allowed) {
    if (decision.reason === "THESIS_UNPUBLISHED") return deny(decision.reason, 404);
    if (decision.reason === "FILE_UNAVAILABLE") return deny(decision.reason, 404);
    // TOP_TEN_RESTRICTED / ADMIN_BLOCKED / PROFILE_INCOMPLETE → 403.
    logSecurityEvent({ type: "auth_forbidden", where: "/api/theses/[id]/download", userId: user.id });
    return deny(decision.reason, 403);
  }

  const fileUrl = report.file_url as string;

  // 9. Record the successful download exactly once. Idempotency window: skip
  //    the counter + event if the same reader downloaded this thesis in the
  //    last 30s (double-click, retry, StrictMode remount, reconnect). The file
  //    is still served — only the analytics write is de-duplicated.
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

  // 10–12. Stream the file (never expose the storage URL); private no-store.
  const safeTitle = encodeURIComponent(`${report.title}.pdf`);
  const disposition = `attachment; filename="${safeTitle}"; filename*=UTF-8''${safeTitle}`;

  if (fileUrl.startsWith("https://") || fileUrl.startsWith("http://")) {
    const upstream = await zimaFetch(fileUrl, null);
    if (!upstream.ok && upstream.status !== 206) {
      return deny("FILE_UNAVAILABLE", 404);
    }
    const headers = new Headers();
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Disposition", disposition);
    headers.set("Cache-Control", NO_STORE);
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);
    return new NextResponse(upstream.body, { headers, status: 200 });
  }

  // Legacy bare R2 key — short-lived (60s) presigned GET, streamed server-side.
  const key = fileUrl.startsWith("https://")
    ? new URL(fileUrl).pathname.replace(/^\//, "")
    : fileUrl;
  const presignedUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key }),
    { expiresIn: 60 },
  );
  const r2Res = await fetch(presignedUrl);
  if (!r2Res.ok) return deny("FILE_UNAVAILABLE", 404);

  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", disposition);
  headers.set("Cache-Control", NO_STORE);
  const contentLength = r2Res.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);
  return new NextResponse(r2Res.body, { headers, status: 200 });
}
