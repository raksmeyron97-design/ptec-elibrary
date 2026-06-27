"use server";

import { S3Client, PutObjectCommand, DeleteObjectCommand, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireAdmin } from "@/lib/auth/requireAdmin";

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  // AWS SDK v3 ≥ 3.600 calculates checksums by default, which adds
  // x-amz-checksum-* query params to presigned URLs. The browser's fetch()
  // cannot satisfy those headers, causing the PUT to fail. Setting both to
  // WHEN_REQUIRED restores the pre-3.600 behaviour for presigned uploads.
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

// Configure CORS once per server instance so browser PUT uploads work.
// R2 requires explicit CORS rules or the browser preflight (OPTIONS) is rejected.
let corsConfigured = false;

async function ensureCorsConfigured() {
  if (corsConfigured) return;
  const corsRules = [
    {
      AllowedOrigins: ["*"],
      AllowedMethods: ["GET", "PUT", "HEAD"] as ("GET" | "PUT" | "HEAD")[],
      AllowedHeaders: ["*"],
      MaxAgeSeconds: 3600,
    },
  ];
  const buckets = [
    process.env.R2_BUCKET_NAME,
    process.env.R2_PUBLIC_BUCKET_NAME,
  ].filter(Boolean) as string[];

  try {
    await Promise.all(
      buckets.map((bucket) =>
        s3Client.send(
          new PutBucketCorsCommand({
            Bucket: bucket,
            CORSConfiguration: { CORSRules: corsRules },
          })
        )
      )
    );
    corsConfigured = true;
  } catch (err) {
    // Non-fatal: if the R2 token lacks bucket-management permissions the PUT
    // still works when CORS is already configured in the Cloudflare dashboard.
    console.warn("Could not auto-configure R2 CORS (may already be set):", err);
    corsConfigured = true; // don't retry on every call
  }
}

const ALLOWED_KEY_PREFIXES = ["books/", "posts/", "research/", "reports/", "team/"];

function validateR2Key(key: string): void {
  if (key.startsWith("/") || key.startsWith("\\")) throw new Error("Invalid file path");
  if (key.includes("..") || key.includes("\\")) throw new Error("Invalid file path");
  if (!ALLOWED_KEY_PREFIXES.some((p) => key.startsWith(p))) {
    throw new Error("File path must start with books/, posts/, research/, reports/, or team/");
  }
}

/**
 * Returns a presigned PUT URL for an R2 upload.
 *
 * target = "private" (default) → private PDF bucket (R2_BUCKET_NAME).
 *   publicUrl is the **bare object key** so the download route can sign a GET
 *   without ever exposing a permanent URL.
 *
 * target = "public" → public covers bucket (R2_PUBLIC_BUCKET_NAME).
 *   publicUrl is the full CDN URL (NEXT_PUBLIC_R2_COVERS_URL/key) suitable
 *   for storing in cover_url and serving directly in <img>.
 */
export async function getPresignedUrl(
  filePath: string,
  contentType: string,
  target: "private" | "public" = "private",
) {
  try {
    await requireAdmin();

    validateR2Key(filePath);

    const bucketName =
      target === "public"
        ? process.env.R2_PUBLIC_BUCKET_NAME
        : process.env.R2_BUCKET_NAME;

    if (!bucketName) throw new Error("Missing R2 bucket config");

    // Ensure CORS is configured so the browser can PUT directly to R2
    await ensureCorsConfigured();

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: filePath,
      ContentType: contentType,
    });

    // Presigned PUT valid for 5 minutes (accommodates large PDFs on slow connections)
    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    // For public covers: full CDN URL stored in cover_url columns.
    // For private PDFs: bare key stored in book_files.file_url — the download
    // route signs a fresh GET URL at request time.
    const publicUrl =
      target === "public"
        ? `${(process.env.NEXT_PUBLIC_R2_COVERS_URL ?? "").replace(/\/$/, "")}/${filePath}`
        : filePath;

    return { presignedUrl, publicUrl };
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    return { error: error instanceof Error ? error.message : "Failed to generate presigned URL" };
  }
}

export async function deleteR2File(
  filePath: string,
  target: "private" | "public" = "private",
) {
  await requireAdmin();

  try {
    const bucketName =
      target === "public"
        ? process.env.R2_PUBLIC_BUCKET_NAME
        : process.env.R2_BUCKET_NAME;

    if (!bucketName) throw new Error("Missing R2 bucket name");

    await s3Client.send(
      new DeleteObjectCommand({ Bucket: bucketName, Key: filePath }),
    );
  } catch (err) {
    console.error("Failed to delete from R2:", err);
  }
}
