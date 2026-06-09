import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { get } from "@vercel/blob";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

function r2ObjectKey(fileUrl: string): string {
  // Bare key stored after bucket-split (e.g. "books/pdfs/file.pdf")
  if (!fileUrl.startsWith("https://")) return fileUrl;
  // Full public URL — strip the hostname to get the key
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

  // ── Vercel Blob ───────────────────────────────────────────────
  const isBlob =
    fileUrl.includes(".private.blob.vercel-storage.com") ||
    fileUrl.includes(".public.blob.vercel-storage.com");

  if (isBlob) {
    const access = fileUrl.includes(".private.") ? "private" : "public";
    const blobResult = await get(fileUrl, { access });
    if (!blobResult?.stream) {
      return new NextResponse("File not found in Blob storage", { status: 404 });
    }
    const headers = new Headers(blobResult.headers as any);
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Disposition", disposition);
    if (access === "private") {
      headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
    }
    return new NextResponse(blobResult.stream as any, { headers, status: blobResult.statusCode });
  }

  // ── Cloudflare R2 (private bucket — server-side proxy) ───────
  // We must NOT redirect to the presigned URL because react-pdf's fetch()
  // would be blocked by CORS. Instead, generate the presigned URL server-side,
  // fetch R2 privately, and stream the bytes back through this same-origin route.
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
  headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
  const contentLength = r2Res.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);

  return new NextResponse(r2Res.body, { headers });
}
