/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

// NOTE: this limiter is in-memory and resets on every cold start. On Vercel
// serverless that means the window can reset between requests on different
// instances. Migrate to Upstash Redis or Vercel KV for true distributed
// rate limiting in production.
const DOWNLOAD_LIMIT = 5;
const DOWNLOAD_WINDOW_MS = 60 * 1000; // 1 minute

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Require authentication
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Rate-limit per user: 5 downloads / minute
  const rl = rateLimit(user.id, DOWNLOAD_LIMIT, DOWNLOAD_WINDOW_MS);
  if (!rl.success) {
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)),
        "X-RateLimit-Limit": String(DOWNLOAD_LIMIT),
        "X-RateLimit-Remaining": "0",
      },
    });
  }

  const supabase = createServiceClient();

  // Resolve book + file
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

  // Fire log + counter in parallel — neither result gates the presigned URL
  await Promise.all([
    supabase.from("download_logs").insert({
      user_id: user.id,
      book_file_id: pdfFile.id,
    }),
    supabase.rpc("increment_download_count", { book_id: book.id }),
  ]);

  // Derive the R2 object key from the stored URL.
  const publicBase = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/$/, "");
  let objectKey = pdfFile.file_url as string;
  if (publicBase && objectKey.startsWith(publicBase + "/")) {
    objectKey = objectKey.slice(publicBase.length + 1);
  } else if (objectKey.startsWith("https://")) {
    try {
      objectKey = new URL(objectKey).pathname.replace(/^\//, "");
    } catch {
      return new NextResponse("Invalid file URL", { status: 500 });
    }
  }

  // Issue a short-lived presigned GET URL (5 minutes)
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: objectKey,
    ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(book.title + ".pdf")}`,
  });

  const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

  return NextResponse.redirect(presignedUrl, 302);
}
