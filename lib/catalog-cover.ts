// lib/catalog-cover.ts
// Server-side pipeline for physical-catalog cover images: parse the form
// intent, validate + re-encode the file, upload it to Zima Storage, and
// (guardedly) delete replaced covers. Consumed by
// app/(admin)/admin/(protected)/catalogs/actions.ts — never import client-side
// (pulls in sharp + storage credentials via lib/zima).

import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { optimizeImage, BOOK_COVER_OPTS } from "@/lib/image-optimize";
import { zimaUpload, zimaDelete, isZimaUrl, zimaRelativePath } from "@/lib/zima";
import { catalogSlugify } from "@/lib/catalog";
import {
  COVER_MAX_BYTES,
  COVER_MIN_WIDTH,
  COVER_MIN_HEIGHT,
  CATALOG_COVER_FOLDER,
  COVER_MODES,
  sniffImageType,
  type CoverMode,
  type CoverSource,
} from "@/lib/catalog-cover-shared";

// ── Source derivation ─────────────────────────────────────────────────────────

/** Derive how a stored cover_url should be treated. No DB column needed. */
export function coverSourceFromUrl(coverUrl: string | null | undefined): CoverSource {
  if (!coverUrl) return "generated";
  return isCatalogStorageCover(coverUrl) ? "storage" : "external";
}

/**
 * True only for covers this feature owns: Zima URLs whose object key lives
 * under catalog-covers/. Deletion never touches anything else (books/, posts/,
 * legacy R2 keys, external hosts…).
 */
export function isCatalogStorageCover(coverUrl: string | null | undefined): boolean {
  if (!coverUrl || !isZimaUrl(coverUrl)) return false;
  const key = zimaRelativePath(coverUrl);
  return !!key && key.startsWith(`${CATALOG_COVER_FOLDER}/`);
}

// ── Filename ──────────────────────────────────────────────────────────────────

/**
 * Server-generated storage filename: sanitized title slug + random suffix +
 * fixed .webp extension. The original filename never reaches storage, so path
 * traversal / double extensions / unicode tricks are moot. Zima additionally
 * appends its own UUID server-side.
 */
export function buildCatalogCoverFilename(title: string, random?: string): string {
  const slug = catalogSlugify(title).slice(0, 60) || "cover";
  const suffix = random ?? randomBytes(4).toString("hex");
  return `${slug}-${suffix}.webp`;
}

// ── Form intent ───────────────────────────────────────────────────────────────

export type CoverInput =
  | { mode: "keep" }
  | { mode: "generated" }
  | { mode: "external"; url: string }
  | { mode: "upload"; file: File }
  | { mode: "invalid"; error: string };

/**
 * Read the cover intent from the wizard form.
 * Falls back to the legacy `cover_url` contract (blank = keep/none,
 * "__remove__" = clear) when no cover_mode field is present, so older
 * clients and tests keep working.
 */
export function parseCoverInput(formData: FormData): CoverInput {
  const rawMode = formData.get("cover_mode")?.toString();

  if (!rawMode) {
    // Legacy contract (pre cover-mode forms).
    const raw = formData.get("cover_url")?.toString().trim();
    if (!raw) return { mode: "keep" };
    if (raw === "__remove__") return { mode: "generated" };
    const url = validateExternalCoverUrl(raw);
    return url ? { mode: "external", url } : { mode: "keep" };
  }

  if (!COVER_MODES.includes(rawMode as CoverMode)) {
    return { mode: "invalid", error: "Unknown cover option." };
  }
  const mode = rawMode as CoverMode;

  if (mode === "keep" || mode === "generated") return { mode };

  if (mode === "external") {
    const raw = formData.get("cover_url")?.toString().trim() ?? "";
    if (!raw) return { mode: "invalid", error: "Enter an image URL, or choose another cover option." };
    const url = validateExternalCoverUrl(raw);
    if (!url) return { mode: "invalid", error: "The cover URL must be a valid https:// image address." };
    return { mode: "external", url };
  }

  // upload
  const file = formData.get("cover_file");
  if (!(file instanceof File) || file.size === 0) {
    return { mode: "invalid", error: "Choose a cover image to upload, or pick another cover option." };
  }
  return { mode: "upload", file };
}

/** HTTPS-only, parseable, sane length. Returns the normalized URL or null. */
export function validateExternalCoverUrl(raw: string): string | null {
  if (raw.length > 2048) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

// ── Validate + process ────────────────────────────────────────────────────────

export type ProcessedCover = {
  buffer: Uint8Array<ArrayBuffer>;
  contentType: string;
  width: number;
  height: number;
};

export type CoverError = {
  code:
    | "FILE_TOO_LARGE"
    | "INVALID_FILE_TYPE"
    | "INVALID_IMAGE"
    | "IMAGE_TOO_SMALL";
  message: string;
};

/**
 * Full server-side validation of an uploaded cover, independent of anything
 * the browser claimed: size cap → magic-byte sniff → sharp decode (also
 * catches corrupt/polyglot files) → minimum dimensions → re-encode to WebP
 * (strips EXIF, auto-rotates, caps at 800×1200 via BOOK_COVER_OPTS).
 */
export async function processCatalogCover(
  bytes: ArrayBuffer,
  originalName: string,
): Promise<{ ok: true; cover: ProcessedCover } | { ok: false; error: CoverError }> {
  if (bytes.byteLength === 0) {
    return { ok: false, error: { code: "INVALID_IMAGE", message: "The file is empty." } };
  }
  if (bytes.byteLength > COVER_MAX_BYTES) {
    return {
      ok: false,
      error: {
        code: "FILE_TOO_LARGE",
        message: `Cover images must be ${Math.round(COVER_MAX_BYTES / 1024 / 1024)} MB or smaller.`,
      },
    };
  }

  const sniffed = sniffImageType(new Uint8Array(bytes));
  if (!sniffed) {
    return {
      ok: false,
      error: { code: "INVALID_FILE_TYPE", message: "Only JPEG, PNG or WebP images are accepted." },
    };
  }

  let width: number | undefined;
  let height: number | undefined;
  try {
    const meta = await sharp(Buffer.from(bytes)).metadata();
    // EXIF orientation 5-8 swaps the displayed axes.
    const swapped = (meta.orientation ?? 1) >= 5;
    width = swapped ? meta.height : meta.width;
    height = swapped ? meta.width : meta.height;
    if (!width || !height) throw new Error("no dimensions");
  } catch {
    return {
      ok: false,
      error: { code: "INVALID_IMAGE", message: "This image is corrupt or could not be read." },
    };
  }

  if (width < COVER_MIN_WIDTH || height < COVER_MIN_HEIGHT) {
    return {
      ok: false,
      error: {
        code: "IMAGE_TOO_SMALL",
        message: `Cover images must be at least ${COVER_MIN_WIDTH}×${COVER_MIN_HEIGHT} pixels (this one is ${width}×${height}).`,
      },
    };
  }

  let optimized;
  try {
    optimized = await optimizeImage(bytes, originalName, sniffed, BOOK_COVER_OPTS);
  } catch {
    return {
      ok: false,
      error: { code: "INVALID_IMAGE", message: "This image could not be processed." },
    };
  }

  return {
    ok: true,
    cover: {
      buffer: optimized.buffer,
      contentType: optimized.contentType,
      width,
      height,
    },
  };
}

// ── Storage operations ────────────────────────────────────────────────────────

/** Upload a processed cover to the catalog-covers folder. Returns the public URL. */
export async function uploadCatalogCover(cover: ProcessedCover, title: string): Promise<string> {
  const filename = buildCatalogCoverFilename(title);
  const file = new File([cover.buffer], filename, { type: cover.contentType });
  return zimaUpload(file, CATALOG_COVER_FOLDER, filename);
}

/**
 * Delete a cover from storage — but only if it is a catalog-covers object.
 * Never throws: a failed delete must not fail the save that triggered it.
 * Returns whether a delete was actually attempted (for audit metadata).
 */
export async function deleteCatalogCoverIfOwned(coverUrl: string | null | undefined): Promise<boolean> {
  if (!isCatalogStorageCover(coverUrl)) return false;
  try {
    await zimaDelete(coverUrl!);
    return true;
  } catch (err) {
    console.error("[catalog-cover] failed to delete replaced cover (kept for cleanup):", err);
    return false;
  }
}
