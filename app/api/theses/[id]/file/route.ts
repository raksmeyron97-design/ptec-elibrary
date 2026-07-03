import { NextResponse, type NextRequest } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { zimaFetch } from "@/lib/zima";

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
  { params }: { params: Promise<{ id: string }> }
) {
  const ip =
    request.headers.get("x-real-ip")?.trim() ??
    request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ??
    "unknown";
  const rl = await rateLimit(`thesis-file:${ip}`, 30, 60_000);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const download = searchParams.get("download") === "1";

  const supabase = createServiceClient();
  const { data: report, error } = await supabase
    .from("research_reports")
    .select("title, file_url")
    .eq("id", id)
    .eq("is_published", true)
    .single();

  if (error || !report?.file_url) {
    return new NextResponse("Not found", { status: 404 });
  }

  const fileUrl = report.file_url as string;
  const safeTitle = encodeURIComponent(`${report.title}.pdf`);
  const disposition = download
    ? `attachment; filename="${safeTitle}"; filename*=UTF-8''${safeTitle}`
    : `inline; filename="${safeTitle}"; filename*=UTF-8''${safeTitle}`;

  // ── Zima CDN or any full HTTP(S) URL — fetch & proxy server-side ─
  if (fileUrl.startsWith("https://") || fileUrl.startsWith("http://")) {
    const upstream = await zimaFetch(fileUrl);
    if (!upstream.ok) {
      return new NextResponse("File not found in storage", { status: 404 });
    }
    const headers = new Headers();
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Disposition", disposition);
    headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);
    return new NextResponse(upstream.body, { headers });
  }

  // ── Legacy: bare R2 object key ─────────────────────────────────
  const key = r2ObjectKey(fileUrl);
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
  });
  const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 60 });

  const r2Res = await fetch(presignedUrl);
  if (!r2Res.ok) {
    return new NextResponse("File not found in storage", { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", disposition);
  headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  const contentLength = r2Res.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);

  return new NextResponse(r2Res.body, { headers });
}
