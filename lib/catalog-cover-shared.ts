// lib/catalog-cover-shared.ts
// Catalog book-cover constants + pure helpers shared by the admin client UI
// (CatalogCoverField) and the server pipeline (lib/catalog-cover.ts).
// MUST stay free of server-only imports (sharp, zima, node:crypto).

/** Where a catalog record's cover comes from. Derived from cover_url — there is
 *  no dedicated DB column: null → "generated", a Zima catalog-covers URL →
 *  "storage", anything else → "external". */
export type CoverSource = "storage" | "external" | "generated";

/** What the admin form asks the server to do with the cover on save. */
export type CoverMode = "keep" | "upload" | "external" | "generated";

export const COVER_MODES: readonly CoverMode[] = ["keep", "upload", "external", "generated"];

/** Maximum accepted source file size (bytes). The stored file is far smaller —
 *  everything is re-encoded to WebP before upload. */
export const COVER_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/** Minimum source dimensions for an uploaded cover (readable on detail pages). */
export const COVER_MIN_WIDTH = 300;
export const COVER_MIN_HEIGHT = 450;

/** Formats accepted from the admin. SVG is deliberately excluded (script
 *  injection surface); everything is re-encoded server-side anyway. */
export const COVER_ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export type CoverMime = (typeof COVER_ACCEPTED_MIME)[number];

/** value for the file input's `accept` attribute. */
export const COVER_ACCEPT_ATTR = COVER_ACCEPTED_MIME.join(",");

/** Zima folder that catalog covers live in. The delete guard only ever touches
 *  keys under this prefix — files in books/, posts/, team/… are unreachable. */
export const CATALOG_COVER_FOLDER = "catalog-covers";

/**
 * Identify an image by its magic bytes (file signature), ignoring the
 * browser-declared MIME type and the filename extension entirely.
 * Returns null for anything that is not a JPEG / PNG / WebP.
 */
export function sniffImageType(bytes: Uint8Array): CoverMime | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "image/png";

  // WebP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "image/webp";

  return null;
}
