/**
 * Shared upload content guard for the `uploadToZima` Server Action.
 *
 * The `/api/admin/upload` route already validates magic bytes, size, and type,
 * but the `uploadToZima` Server Action (team photos, post/announcement images,
 * avatars) historically only ran images through `sharp` and passed every other
 * declared type through untouched. That let an authenticated staff/librarian
 * upload arbitrary content — most importantly an SVG or HTML file — into the
 * storage backend by simply declaring a non-image MIME type. Even though those
 * files are served from the separate storage host, an `image/svg+xml` or
 * `text/html` object is script-capable in that origin.
 *
 * This guard closes that gap by trusting the sniffed magic bytes over the
 * spoofable declared type (see `lib/mime-validation.ts`) and rejecting anything
 * that is not a recognised raster image (or, where explicitly allowed, a PDF).
 *
 * Pure and dependency-light on purpose so it is unit-testable without the
 * Supabase/Zima/`requirePermission` machinery around the action.
 */

import { detectMimeType } from "@/lib/mime-validation";

/** Raster image types the storage module accepts. SVG is deliberately absent —
 *  it is an XML document that can carry `<script>`/`onload`, not a safe raster. */
export const UPLOAD_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

/** Hard ceiling for Server-Action image uploads (covers, avatars, post art).
 *  The dedicated bulk/PDF path (`/api/admin/upload`) keeps its own 100 MB cap. */
export const MAX_IMAGE_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

export type UploadGuardResult =
  | { ok: true; effectiveType: string }
  | { ok: false; reason: string };

/** Top-level folders that legitimately receive PDFs through this action. */
const PDF_FOLDERS = new Set(["books", "research", "reports", "publications"]);

/**
 * Validate an upload's real content by magic bytes, ignoring the declared
 * (extension-derived, spoofable) type.
 *
 * @param buffer  Raw file bytes.
 * @param folder  Destination folder (its top segment decides PDF eligibility).
 * @returns `{ ok: true, effectiveType }` with the sniffed type to carry
 *          downstream, or `{ ok: false, reason }` for a rejection.
 */
export function guardUploadContent(
  buffer: ArrayBuffer,
  folder: string,
): UploadGuardResult {
  if (buffer.byteLength === 0) {
    return { ok: false, reason: "file is empty" };
  }
  if (buffer.byteLength > MAX_IMAGE_UPLOAD_BYTES) {
    return { ok: false, reason: "file too large (max 25 MB)" };
  }

  const detected = detectMimeType(buffer);
  if (detected && UPLOAD_IMAGE_MIMES.has(detected)) {
    return { ok: true, effectiveType: detected };
  }

  const top = folder.split("/")[0] ?? "";
  if (PDF_FOLDERS.has(top) && detected === "application/pdf") {
    return { ok: true, effectiveType: "application/pdf" };
  }

  return {
    ok: false,
    reason:
      "unsupported file content — only JPEG, PNG, WebP, or AVIF images are allowed",
  };
}
