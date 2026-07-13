import { NextResponse, type NextRequest } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy } from "@/lib/rate-limit-policy";
import { logSecurityEvent } from "@/lib/security-log";
import { zimaFetch } from "@/lib/zima";
import { isFreelyAccessible } from "@/lib/seo/publication-seo";
import { doiUrl } from "@/lib/seo/identifiers";

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
  const ip =
    request.headers.get("x-real-ip")?.trim() ??
    request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ??
    "unknown";
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
  const { data: publication, error } = await supabase
    .from("publications")
    .select("id, title, pdf_url, doi, publisher, license")
    .eq("slug", slug)
    .eq("is_published", true)
    .single();

  if (error || !publication?.pdf_url) {
    return new NextResponse("Not found", { status: 404 });
  }

  // ── Full-text redistribution gate ────────────────────────────────────────
  // A third-party © article with no verified redistributable license is
  // citation-only: the bibliographic landing page + DOI stay public, but we do
  // NOT hand out the hosted PDF as a download. An authorized admin can override
  // per record by setting fulltext_redistributable=true (column from 0092;
  // the read is best-effort so this works before the migration lands).
  if (download) {
    let redistributable = isFreelyAccessible({
      slug,
      title: publication.title,
      publisher: publication.publisher,
      license: publication.license,
    });
    const { data: rights } = await supabase
      .from("publications")
      .select("fulltext_redistributable")
      .eq("id", publication.id)
      .maybeSingle();
    if (rights?.fulltext_redistributable === true) redistributable = true;

    if (!redistributable) {
      const link = doiUrl(publication.doi);
      logSecurityEvent({ type: "rights_blocked", where: "/api/publications/[slug]/file?download", ip });
      return NextResponse.json(
        {
          error: "This publication is a citation-only bibliographic record. Full-text redistribution is not authorized.",
          ...(link ? { doi: link } : {}),
        },
        { status: 403 },
      );
    }
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
  const key = r2ObjectKey(fileUrl);
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
  });
  const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 60 });

  const fetchHeaders: HeadersInit = {};
  if (rangeHeader) fetchHeaders["Range"] = rangeHeader;

  const r2Res = await fetch(presignedUrl, { headers: fetchHeaders });
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
