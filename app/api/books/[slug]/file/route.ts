/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy } from "@/lib/rate-limit-policy";
import { logSecurityEvent } from "@/lib/security-log";
import { zimaFetch } from "@/lib/zima";
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
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const download = searchParams.get("download") === "1";

  const ip = clientIp(request.headers);
  const { limit, windowMs } = ratePolicy("fileRead");
  const rl = await rateLimit(`book-file:${ip}`, limit, windowMs);
  if (!rl.success) {
    logSecurityEvent({ type: "rate_limited", where: "/api/books/[slug]/file", ip });
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (download && !user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabaseAdmin = createServiceClient();
  const { data: book, error } = await supabaseAdmin
    .from("books")
    .select(`title, book_files ( file_url, format )`)
    .eq("id", slug)
    .eq("is_published", true)
    .single();

  if (error || !book) {
    return new NextResponse("Book not found", { status: 404 });
  }

  const files = Array.isArray(book.book_files) ? book.book_files : [book.book_files];
  const pdfFile = files.find((f: any) => f.format === "pdf") ?? files[0];

  if (!pdfFile?.file_url) {
    return new NextResponse("File not found", { status: 404 });
  }

  const fileUrl = pdfFile.file_url as string;
  const safeTitle = encodeURIComponent(`${book.title}.pdf`);
  const disposition = download
    ? `attachment; filename="${safeTitle}"; filename*=UTF-8''${safeTitle}`
    : `inline; filename="${safeTitle}"; filename*=UTF-8''${safeTitle}`;

  const rangeHeader = request.headers.get("range");

  // NOTE — there used to be a @vercel/blob branch here for records whose
  // file_url pointed at *.blob.vercel-storage.com. It is gone with the move to
  // self-hosting: that SDK reads a Vercel-issued token this deployment no
  // longer holds, so it could only ever have failed at runtime. Public blob
  // URLs still work, because the generic HTTP proxy below handles them like
  // any other absolute URL; a private one 404s with the same message as any
  // other unreachable object. Book files live in Zima Storage now.

  // ── Zima CDN or any full HTTP(S) URL — fetch & proxy server-side ─
  if (fileUrl.startsWith("https://") || fileUrl.startsWith("http://")) {
    const upstream = await zimaFetch(fileUrl, rangeHeader);
    if (!upstream.ok && upstream.status !== 206) {
      return new NextResponse("File not found in storage", { status: 404 });
    }
    const headers = new Headers();
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Disposition", disposition);
    headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
    headers.set("Accept-Ranges", "bytes");
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) headers.set("Content-Range", contentRange);
    return new NextResponse(upstream.body, { headers, status: upstream.status });
  }

  // ── Legacy: bare R2 object key (private bucket) ────────────────
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
  headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
  headers.set("Accept-Ranges", "bytes");

  const contentLength = r2Res.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);

  const contentRange = r2Res.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);

  return new NextResponse(r2Res.body, { headers, status: r2Res.status });
}
