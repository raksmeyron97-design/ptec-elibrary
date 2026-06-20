import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { isAdminAuthError, requireAdmin } from "@/lib/auth/requireAdmin";

export const runtime = "nodejs";
export const maxDuration = 300;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const ALLOWED_PREFIXES = ["books/", "posts/", "research/", "reports/"];

// Cap upload size so a single huge request can't exhaust the function's memory
// (the body is buffered before being sent to R2).
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const key = request.headers.get("x-file-path")?.trim() ?? "";
    const target = request.headers.get("x-target") === "public" ? "public" : "private";
    const contentType = request.headers.get("x-content-type") ?? "application/octet-stream";

    if (!key || key.startsWith("/") || key.startsWith("\\") || key.includes("..") || key.includes("\\")) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }
    if (!ALLOWED_PREFIXES.some((p) => key.startsWith(p))) {
      return NextResponse.json({ error: "File path must start with books/, posts/, research/, or reports/" }, { status: 400 });
    }

    // Reject oversized uploads before buffering the body into memory.
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File too large (max 100 MB)." }, { status: 413 });
    }

    const bucket = target === "public"
      ? process.env.R2_PUBLIC_BUCKET_NAME
      : process.env.R2_BUCKET_NAME;
    if (!bucket) return NextResponse.json({ error: "Missing R2 bucket config" }, { status: 500 });

    // Read as raw binary — no FormData parsing, handles large files
    const body = await request.arrayBuffer();
    if (body.byteLength === 0) return NextResponse.json({ error: "Empty file" }, { status: 400 });
    if (body.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File too large (max 100 MB)." }, { status: 413 });
    }

    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: Buffer.from(body),
      ContentType: contentType,
    }));

    const url = target === "public"
      ? `${(process.env.NEXT_PUBLIC_R2_COVERS_URL ?? "").replace(/\/$/, "")}/${key}`
      : key;

    return NextResponse.json({ url });
  } catch (err) {
    if (isAdminAuthError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    console.error("[bulk-upload]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    );
  }
}
