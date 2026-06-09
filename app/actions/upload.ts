"use server";

import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@/lib/supabase/server";

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const ALLOWED_KEY_PREFIXES = ["books/", "posts/", "research/", "reports/"];

function validateR2Key(key: string): void {
  if (key.startsWith("/") || key.startsWith("\\")) throw new Error("Invalid file path");
  if (key.includes("..") || key.includes("\\")) throw new Error("Invalid file path");
  if (!ALLOWED_KEY_PREFIXES.some((p) => key.startsWith(p))) {
    throw new Error("File path must start with books/, posts/, research/, or reports/");
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
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") throw new Error("Forbidden");

    validateR2Key(filePath);

    const bucketName =
      target === "public"
        ? process.env.R2_PUBLIC_BUCKET_NAME
        : process.env.R2_BUCKET_NAME;

    if (!bucketName) throw new Error("Missing R2 bucket config");

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: filePath,
      ContentType: contentType,
    });

    // Presigned PUT valid for 60 seconds
    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });

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
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") throw new Error("Forbidden");

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
