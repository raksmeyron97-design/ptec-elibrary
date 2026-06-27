import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { isAdminAuthError, requireAdmin } from "@/lib/auth/requireAdmin";
import { validateMimeType } from "@/lib/mime-validation";

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

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const key = (formData.get("key") as string | null)?.trim();
    const target = (formData.get("target") as string) === "public" ? "public" : "private";

    if (!file || file.size === 0) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File too large (max 100 MB)." }, { status: 413 });
    }
    if (!key) return NextResponse.json({ error: "No key provided" }, { status: 400 });

    if (key.startsWith("/") || key.startsWith("\\") || key.includes("..") || key.includes("\\")) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }
    if (!ALLOWED_PREFIXES.some((p) => key.startsWith(p))) {
      return NextResponse.json({ error: "File path must start with books/, posts/, research/, or reports/" }, { status: 400 });
    }

    const bucket = target === "public"
      ? process.env.R2_PUBLIC_BUCKET_NAME
      : process.env.R2_BUCKET_NAME;
    if (!bucket) return NextResponse.json({ error: "Missing R2 bucket config" }, { status: 500 });

    const bytes = await file.arrayBuffer();

    // Server-side MIME validation — verify magic bytes match declared type
    if (!validateMimeType(bytes, file.type)) {
      return NextResponse.json(
        { error: `Invalid file: content does not match declared type (${file.type}). Only PDF, JPEG, PNG, WebP, and AVIF are allowed.` },
        { status: 400 }
      );
    }

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: Buffer.from(bytes),
        ContentType: file.type || "application/octet-stream",
      })
    );

    const url =
      target === "public"
        ? `${(process.env.NEXT_PUBLIC_R2_COVERS_URL ?? "").replace(/\/$/, "")}/${key}`
        : key;

    return NextResponse.json({ url });
  } catch (err) {
    if (isAdminAuthError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    console.error("[admin/upload]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
