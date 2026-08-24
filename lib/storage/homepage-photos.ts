/**
 * Zima Storage helpers for the homepage photo gallery (migration 0118).
 *
 * Why this does NOT go through `uploadToZima()` in app/actions/upload.ts:
 * that action returns only a URL, and this gallery needs three more things
 * from the same sharp pass — the stored file's intrinsic width/height (so
 * next/image can reserve space instead of shifting the layout as each photo
 * decodes) and a base64 LQIP for `blurDataURL`. Re-decoding the uploaded file
 * a second time just to read those would double the work on every upload.
 *
 * The security posture is identical: magic-byte content guard first (never the
 * spoofable declared type), then a full sharp re-encode, which is what strips
 * any payload embedded in the original container.
 */

import "server-only";

import sharp from "sharp";
import { zimaUpload, zimaDelete, zimaRelativePath } from "@/lib/zima";
import { guardUploadContent } from "@/lib/upload-content-guard";

/** Destination folder inside Zima Storage. Kept in one place so the delete
 *  path and /admin/storage's folder list cannot drift from the upload path. */
export const HOMEPAGE_PHOTO_FOLDER = "homepage";

/** Hero-scale: the mosaic's main photo can span ~60% of a 1400px container and
 *  is served at 2x on retina, so 1920 is the first width that is not visibly
 *  soft. Quality 85 is the spec'd value; WebP at 85 lands ~150–400 KB here. */
const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1440;
const QUALITY = 85;

/** LQIP size. 20px wide is enough to carry colour and rough composition and
 *  keeps the base64 string near 400 bytes — it is inlined into the homepage
 *  HTML once per photo, so it must stay tiny. */
const BLUR_WIDTH = 20;

export interface StoredPhoto {
  publicUrl: string;
  storageKey: string;
  width: number | null;
  height: number | null;
  blurDataUrl: string | null;
}

export type StoreResult = StoredPhoto | { error: string };

/** Filesystem-safe stem for the stored object, derived from the original name. */
function safeStem(originalName: string): string {
  const stem = originalName.replace(/\.[^.]+$/, "");
  const cleaned = stem
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 48);
  return cleaned || "photo";
}

/**
 * Validate, optimise and upload one photo.
 *
 * Returns `{ error }` rather than throwing so the calling Server Action can
 * surface the reason in the upload modal — a rejected file is a routine user
 * outcome here, not an exception.
 */
export async function storeHomepagePhoto(file: File): Promise<StoreResult> {
  if (!file || file.size === 0) return { error: "No file provided" };

  const bytes = await file.arrayBuffer();

  // Trust the bytes, never the declared type. The folder is not in
  // upload-content-guard's PDF_FOLDERS list, so this rejects everything that
  // is not a recognised raster image — including script-capable SVG/HTML.
  const guard = guardUploadContent(bytes, HOMEPAGE_PHOTO_FOLDER);
  if (!guard.ok) return { error: `Invalid file: ${guard.reason}.` };

  try {
    // One decode, three outputs. `.rotate()` bakes in the EXIF orientation so
    // a phone photo is not stored sideways; sharp's metadata is read AFTER the
    // resize so the recorded dimensions match the file that is actually stored.
    const pipeline = sharp(Buffer.from(new Uint8Array(bytes)))
      .rotate()
      .resize({
        width: MAX_WIDTH,
        height: MAX_HEIGHT,
        fit: "inside",
        withoutEnlargement: true,
      });

    const { data, info } = await pipeline
      .clone()
      .webp({ quality: QUALITY })
      .toBuffer({ resolveWithObject: true });

    const blurBuffer = await pipeline
      .clone()
      .resize({ width: BLUR_WIDTH })
      .webp({ quality: 40 })
      .toBuffer()
      .catch(() => null);

    const filename = `${Date.now().toString(36)}-${safeStem(file.name)}.webp`;
    const uploaded = new File([new Uint8Array(data)], filename, { type: "image/webp" });
    const publicUrl = await zimaUpload(uploaded, HOMEPAGE_PHOTO_FOLDER, filename);

    return {
      publicUrl,
      // Falls back to the folder-qualified name when the CDN URL is shaped
      // unexpectedly — the column is not-null and is only ever used to find
      // the object by eye in /admin/storage.
      storageKey: zimaRelativePath(publicUrl) ?? `${HOMEPAGE_PHOTO_FOLDER}/${filename}`,
      width: info.width ?? null,
      height: info.height ?? null,
      blurDataUrl: blurBuffer
        ? `data:image/webp;base64,${Buffer.from(blurBuffer).toString("base64")}`
        : null,
    };
  } catch (error) {
    console.error("[homepage-photos] upload failed:", error);
    return { error: error instanceof Error ? error.message : "Upload failed" };
  }
}

/**
 * Remove a photo's file from Zima Storage. No-ops for non-Zima URLs (so a row
 * whose URL was pasted in by hand cannot break a delete) and never throws —
 * the DB row is the source of truth for what the homepage shows, and failing
 * the whole delete because the CDN was briefly unreachable would leave the
 * photo visible.
 */
export async function removeHomepagePhotoFile(publicUrl: string): Promise<void> {
  await zimaDelete(publicUrl);
}
