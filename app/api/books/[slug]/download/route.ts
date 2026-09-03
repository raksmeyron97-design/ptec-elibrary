/* eslint-disable @typescript-eslint/no-explicit-any */
// THE authoritative book-download gate. /api/books/[id]/file?download=1 no
// longer serves an attachment of its own — it redirects here — so this is the
// single place that decides whether a book's file leaves the server, and the
// only place that counts a download.
//
// The route parameter is a slug OR a book id: the file route is keyed by id
// and redirects into this one, and resolving both here is what keeps that a
// redirect rather than a second copy of this policy.
import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy } from "@/lib/rate-limit-policy";
import { logSecurityEvent } from "@/lib/security-log";
import { zimaFetch } from "@/lib/zima";
import { lockdownResponse } from "@/lib/security/lockdown";
import { getViewerContext, logAppEvent, logDownloadAttempt } from "@/lib/analytics/events";
import { resolveBookDownloadAccess } from "@/lib/books/access";
import { canOverrideBookDownloadPolicy } from "@/lib/books/download-authority";
import { logAdminAction } from "@/app/actions/audit";

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

const NO_STORE = "private, no-cache, no-store, max-age=0, must-revalidate";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const locked = lockdownResponse("downloads", "/api/books/[slug]/download");
  if (locked) return locked;

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

  // Accept either a slug or a book id. UUID_RE is the discriminator rather
  // than an `or(...)` filter so a slug can never be matched against a uuid
  // column and produce a 22P02 that reads as "not found".
  const idColumn = UUID_RE.test(slug) ? "id" : "slug";

  const BASE_COLUMNS = "id, slug, title, book_files(id, file_url, format)";
  const POLICY_COLUMNS = `${BASE_COLUMNS}, allow_download, download_disabled_reason`;

  async function loadBook(columns: string) {
    return supabase
      .from("books")
      .select(columns)
      .eq(idColumn, slug)
      .eq("is_published", true)
      .maybeSingle();
  }

  // Ask for the policy columns; fall back to the pre-0131 column list if the
  // migration has not reached this database yet. A missing column then means
  // "allowed" — the column's own default — rather than a 500 that would take
  // every download down.
  let { data: book, error } = await loadBook(POLICY_COLUMNS);
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    ({ data: book, error } = await loadBook(BASE_COLUMNS));
  }

  if (error || !book) {
    return new NextResponse("Not found", { status: 404 });
  }
  const row = book as any;

  const files = Array.isArray(row.book_files) ? row.book_files : [row.book_files];
  const pdfFile = files.find((f: any) => f?.format === "pdf") ?? files[0];

  // ── The access gate ────────────────────────────────────────────────────
  //
  // THIS is the enforcement point. The reader UI hides the download action for
  // a read-online-only book, but a hidden button is a courtesy, not a control:
  // this route is reachable by typing the URL, and it is what actually decides
  // whether the bytes leave the server. The decision is re-evaluated on every
  // request, so a page rendered while the book was downloadable cannot be
  // replayed after a librarian switches it off.
  //
  // Reading online is deliberately untouched: /api/books/[id]/file still
  // streams a restricted book to the in-app viewer, which is the entire point
  // of the distinction.
  const access = resolveBookDownloadAccess({
    allow_download: row.allow_download,
    download_disabled_reason: row.download_disabled_reason,
    fileUrl: pdfFile?.file_url ?? null,
  });

  if (access.reason === "no-file") {
    return new NextResponse("File not found", { status: 404 });
  }

  if (!access.canDownload) {
    // A librarian who can change this setting can still retrieve the file —
    // otherwise switching a book to read-online-only would lock the library
    // out of its own copy. The override is a books:write check (which carries
    // the admin panel's MFA requirement with it), it is audited, and it is the
    // only path past the refusal.
    const override = await canOverrideBookDownloadPolicy();
    if (!override.allowed) {
      logSecurityEvent({
        type: "download_blocked",
        where: "/api/books/[slug]/download",
        userId: user.id,
      });
      await logDownloadAttempt({
        status: "denied",
        resourceType: "book",
        resourceId: row.id as string,
        userId: user.id,
        reason: "DOWNLOAD_DISABLED",
        permissionSource: "library-policy",
        idempotencyKey: `dl-deny:${user.id}:${row.id}:policy:${Math.floor(Date.now() / 60_000)}`,
      });
      return NextResponse.json(
        {
          error:
            access.message ??
            "This book is available for online reading only. Downloads are disabled for this record.",
          reason: "policy",
          canReadOnline: true,
          readUrl: `/books/${row.slug}/read`,
        },
        { status: 403, headers: { "Cache-Control": NO_STORE } },
      );
    }
    await logAdminAction(user.id, "book.download_override", "books", row.id as string, {
      title: row.title,
      role: override.role,
    });
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
    supabase.rpc("increment_download_count", { book_id: row.id }),
  ]);
  if (dlRes.error && (dlRes.error.code === "42703" || dlRes.error.code === "PGRST204")) {
    delete dlRow.session_hash;
    await supabase.from("download_logs").insert(dlRow);
  }

  const fileUrl = pdfFile.file_url as string;
  const safeTitle = encodeURIComponent(`${row.title}.pdf`);
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
        status: "failed", resourceType: "book", resourceId: row.id as string, userId: user.id,
        reason: "STORAGE_ERROR",
        idempotencyKey: `dl-fail:${user.id}:${row.id}:${Math.floor(Date.now() / 60_000)}`,
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
