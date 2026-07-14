/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy } from "@/lib/rate-limit-policy";
import { logSecurityEvent } from "@/lib/security-log";
import { zimaFetch } from "@/lib/zima";
import { getViewerContext, logAppEvent, logDownloadAttempt } from "@/lib/analytics/events";

// Legacy R2 client — kept for backward compat with bare-key records in the DB.
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

// Rate limit comes from ratePolicy("download") — RL_DOWNLOAD_PER_MIN to override.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { limit: downloadLimit, windowMs } = ratePolicy("download");
  const rl = await rateLimit(user.id, downloadLimit, windowMs);
  if (!rl.success) {
    logSecurityEvent({ type: "rate_limited", where: "/api/books/[slug]/download", userId: user.id });
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)),
        "X-RateLimit-Limit": String(downloadLimit),
        "X-RateLimit-Remaining": "0",
      },
    });
  }

  const supabase = createServiceClient();

  const { data: book, error } = await supabase
    .from("books")
    .select("id, title, book_files(id, file_url, format)")
    .eq("slug", slug)
    .eq("is_published", true)
    .single();

  if (error || !book) {
    return new NextResponse("Not found", { status: 404 });
  }

  const files = Array.isArray(book.book_files) ? book.book_files : [book.book_files];
  const pdfFile = files.find((f: any) => f?.format === "pdf") ?? files[0];

  if (!pdfFile?.file_url) {
    return new NextResponse("File not found", { status: 404 });
  }

  // Log download + increment counter (non-blocking). session_hash column is
  // nullable pre-0090; on unknown-column errors, retry with the legacy shape.
  const viewer = await getViewerContext();
  const dlRow: Record<string, unknown> = {
    user_id: user.id,
    book_file_id: pdfFile.id,
    session_hash: viewer.sessionHash,
  };
  const [dlRes] = await Promise.all([
    supabase.from("download_logs").insert(dlRow),
    supabase.rpc("increment_download_count", { book_id: book.id }),
  ]);
  if (dlRes.error && (dlRes.error.code === "42703" || dlRes.error.code === "PGRST204")) {
    delete dlRow.session_hash;
    await supabase.from("download_logs").insert(dlRow);
  }

  const fileUrl = pdfFile.file_url as string;
  const safeTitle = encodeURIComponent(`${book.title}.pdf`);
  const disposition = `attachment; filename="${safeTitle}"; filename*=UTF-8''${safeTitle}`;

  // ── Zima CDN or any full HTTP(S) URL — proxy download server-side ─
  if (fileUrl.startsWith("https://") || fileUrl.startsWith("http://")) {
    const started = Date.now();
    const upstream = await zimaFetch(fileUrl);
    logAppEvent({
      kind: "storage_operation",
      status: upstream.ok ? "ok" : "error",
      route: "/api/books/[slug]/download",
      latencyMs: Date.now() - started,
      detail: { backend: "zima", op: "download", httpStatus: upstream.status },
    });
    if (!upstream.ok) {
      await logDownloadAttempt({
        status: "failed", resourceType: "book", resourceId: book.id, userId: user.id,
        reason: "STORAGE_ERROR",
        idempotencyKey: `dl-fail:${user.id}:${book.id}:${Math.floor(Date.now() / 60_000)}`,
      });
      return new NextResponse("File not found in storage", { status: 404 });
    }
    const headers = new Headers();
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Disposition", disposition);
    headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);
    return new NextResponse(upstream.body, { headers });
  }

  // ── Legacy: bare R2 object key (private bucket) — presigned redirect ──
  const publicBase = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/$/, "");
  let objectKey = fileUrl;
  if (publicBase && objectKey.startsWith(publicBase + "/")) {
    objectKey = objectKey.slice(publicBase.length + 1);
  }

  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: objectKey,
    ResponseContentDisposition: disposition,
  });

  const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
  logAppEvent({
    kind: "storage_operation",
    status: "fallback",
    route: "/api/books/[slug]/download",
    detail: { backend: "r2", op: "presign" },
  });
  return NextResponse.redirect(presignedUrl, 302);
}
