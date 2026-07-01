"use server";

import { requirePermission } from "@/lib/auth/requireAdmin";
import { zimaUpload, zimaDelete } from "@/lib/zima";

const ALLOWED_FOLDERS = ["books", "posts", "research", "reports", "team", "avatars"];

function validateFolder(folder: string): void {
  const topLevel = folder.split("/")[0];
  if (!ALLOWED_FOLDERS.includes(topLevel ?? "")) {
    throw new Error(
      `Folder must start with one of: ${ALLOWED_FOLDERS.join(", ")}`,
    );
  }
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

    const publicUrl = await zimaUpload(file, folder);
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
