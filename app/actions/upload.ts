"use server";

import { requirePermission } from "@/lib/auth/requireAdmin";
import { zimaUpload, zimaDelete } from "@/lib/zima";
import { optimizeImage, BOOK_COVER_OPTS, POST_IMAGE_OPTS } from "@/lib/image-optimize";

const ALLOWED_FOLDERS = ["books", "posts", "research", "reports", "team", "avatars"];

function validateFolder(folder: string): void {
  const topLevel = folder.split("/")[0];
  if (!ALLOWED_FOLDERS.includes(topLevel ?? "")) {
    throw new Error(
      `Folder must start with one of: ${ALLOWED_FOLDERS.join(", ")}`,
    );
  }
}

/** Pick optimization preset based on the upload folder. */
function presetsForFolder(folder: string) {
  const top = folder.split("/")[0];
  if (top === "books") return BOOK_COVER_OPTS;
  if (top === "posts") return POST_IMAGE_OPTS;
  return {};
}

/**
 * Upload a file to Zima Storage via a Server Action.
 * The client packages the File into FormData under the "file" key and calls this action.
 * Returns { publicUrl } on success or { error } on failure.
 */
export async function uploadToZima(
  formData: FormData,
  folder: string,
): Promise<{ publicUrl: string } | { error: string }> {
  try {
    await requirePermission("books", "write");
    validateFolder(folder);

    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) throw new Error("No file provided");

    // Optimize image before upload
    const bytes = await file.arrayBuffer();
    const opts = presetsForFolder(folder);
    const optimized = await optimizeImage(bytes, file.name, file.type, opts);
    const optimizedFile = new File([optimized.buffer], optimized.filename, {
      type: optimized.contentType,
    });

    const publicUrl = await zimaUpload(optimizedFile, folder);
    return { publicUrl };
  } catch (error) {
    console.error("[upload] Zima upload error:", error);
    return { error: error instanceof Error ? error.message : "Upload failed" };
  }
}

/**
 * Delete a file from Zima Storage.
 * No-ops silently for non-Zima URLs (legacy R2 / Vercel Blob records).
 */
export async function deleteZimaFile(fileUrl: string): Promise<void> {
  await requirePermission("books", "write");
  await zimaDelete(fileUrl);
}
