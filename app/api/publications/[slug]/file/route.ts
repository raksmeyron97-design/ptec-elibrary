import { NextResponse, type NextRequest } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy } from "@/lib/rate-limit-policy";
import { logSecurityEvent } from "@/lib/security-log";
import { zimaFetch } from "@/lib/zima";
import { lockdownResponse } from "@/lib/security/lockdown";
import { resolveDownloadAccess } from "@/lib/publications/access";
import { doiUrl } from "@/lib/seo/identifiers";
import { clientIp } from "@/lib/client-ip";

// Legacy R2 client — kept for backward compat with bare-key records in the DB.
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

function r2ObjectKey(fileUrl: string): string {
  if (!fileUrl.startsWith("https://")) return fileUrl;
  try {
    return new URL(fileUrl).pathname.replace(/^\//, "");
  } catch {
    return fileUrl;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const locked = lockdownResponse("downloads", "/api/publications/[slug]/file");
  if (locked) return locked;

  const ip = clientIp(request.headers);
  const { limit, windowMs } = ratePolicy("fileRead");
  const rl = await rateLimit(`publication-file:${ip}`, limit, windowMs);
  if (!rl.success) {
    logSecurityEvent({ type: "rate_limited", where: "/api/publications/[slug]/file", ip });
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }

  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const download = searchParams.get("download") === "1";

  const supabase = createServiceClient();

  // `select *` rather than a column list so this keeps working whether or not
  // 0125 has been applied — resolveDownloadAccess() treats an absent
  // allow_download as "allowed", which is the column's default.
  const { data: publication, error } = await supabase
    .from("publications")
    .select("*")
    .eq("slug", slug)
    .eq("is_published", true)
    .single();

  if (error || !publication?.pdf_url) {
    return new NextResponse("Not found", { status: 404 });
  }

  // ── The access gate ──────────────────────────────────────────────────────
  //
  // THIS is the enforcement point. The detail page hides the Download button
  // when access is denied, but a hidden button is a courtesy, not a control:
  // this route is reachable by typing the URL, and it is what actually decides
  // whether the bytes leave the server.
  //
  // Two independent refusals, resolved by lib/publications/access.ts — the
  // same module the page reads, so the button and the route can never disagree:
  //   * "policy" — the library switched downloads off for this record (0125).
  //   * "rights" — no verified right to redistribute a third party's full text
  //     (0092 + the licence heuristic). The landing page and DOI stay public.
  //
  // Neither refusal touches inline reading: a read-online-only record is still
  // streamed to the in-page viewer below, which is the entire point of the
  // distinction.
  const access = resolveDownloadAccess({
    slug,
    title: publication.title,
    publisher: publication.publisher ?? null,
    license: publication.license ?? null,
    allow_download: publication.allow_download,
    download_disabled_reason: publication.download_disabled_reason,
    fulltext_redistributable: publication.fulltext_redistributable,
    pdf_url: publication.pdf_url,
  });

  if (download && !access.canDownload) {
    const link = doiUrl(publication.doi);
    logSecurityEvent({
      type: access.reason === "policy" ? "download_blocked" : "rights_blocked",
      where: "/api/publications/[slug]/file?download",
      ip,
    });
    return NextResponse.json(
      {
        error:
          access.reason === "policy"
            ? access.message ??
              "This publication is available for online reading only. Downloads are disabled for this record."
            : "This publication is a citation-only bibliographic record. Full-text redistribution is not authorized.",
        reason: access.reason,
        ...(link ? { doi: link } : {}),
      },
      { status: 403 },
    );
  }

  // Count explicit downloads (inline viewer reads are counted as views instead)
  if (download) {
    await supabase
      .rpc("increment_publication_download_count", { row_id: publication.id })
      .then(({ error: rpcError }: { error: { message: string } | null }) => {
        if (rpcError) console.error("[publications/file] download count failed:", rpcError.message);
      });
  }

  const fileUrl = publication.pdf_url as string;
  const safeTitle = encodeURIComponent(`${publication.title}.pdf`);
  const disposition = download
    ? `attachment; filename="${safeTitle}"; filename*=UTF-8''${safeTitle}`
    : `inline; filename="${safeTitle}"; filename*=UTF-8''${safeTitle}`;
  const rangeHeader = request.headers.get("range");

  // ── Zima CDN or any full HTTP(S) URL — fetch & proxy server-side ─
  if (fileUrl.startsWith("https://") || fileUrl.startsWith("http://")) {
    const upstream = await zimaFetch(fileUrl, rangeHeader);
    if (!upstream.ok && upstream.status !== 206) {
      return new NextResponse("File not found in storage", { status: 404 });
    }
    const headers = new Headers();
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Disposition", disposition);
    headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    headers.set("Accept-Ranges", "bytes");
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) headers.set("Content-Range", contentRange);
    return new NextResponse(upstream.body, { headers, status: upstream.status });
  }

  // ── Legacy: bare R2 object key ─────────────────────────────────
  //
  // R2 is the legacy fallback — Zima is primary — so a deployment can quite
  // reasonably have no R2 credentials at all. Presigning without them throws,
  // and the throw escaped as an unhandled 500 with a stack trace, which is
  // both an unhelpful answer and a worse one than the truth: this route cannot
  // produce the file. Everything below resolves to the same honest 404 the
  // Zima branch already returns when storage does not have the object.
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_BUCKET_NAME || !process.env.R2_ACCESS_KEY_ID) {
    console.warn(`[publications/file] legacy R2 key "${fileUrl}" but R2 is not configured`);
    return new NextResponse("File not found in storage", { status: 404 });
  }

  const fetchHeaders: HeadersInit = {};
  if (rangeHeader) fetchHeaders["Range"] = rangeHeader;

  let r2Res: Response;
  try {
    const key = r2ObjectKey(fileUrl);
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    });
    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 60 });
    r2Res = await fetch(presignedUrl, { headers: fetchHeaders });
  } catch (storageError) {
    console.error("[publications/file] legacy R2 read failed:", storageError);
    return new NextResponse("File not found in storage", { status: 404 });
  }

  if (!r2Res.ok && r2Res.status !== 206) {
    return new NextResponse("File not found in storage", { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", disposition);
  headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  headers.set("Accept-Ranges", "bytes");
  const contentLength = r2Res.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);
  const contentRange = r2Res.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);

  return new NextResponse(r2Res.body, { headers, status: r2Res.status });
}
