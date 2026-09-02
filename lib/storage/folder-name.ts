// lib/storage/folder-name.ts — the ONE builder for Zima Storage path segments.
//
// Pure (no server-only imports) on purpose: the admin upload forms are client
// components and must be able to compute — and pre-validate — a destination
// folder before a byte leaves the browser, while the API routes and Server
// Actions re-check the same rule server-side.
//
// ── The rule, taken from the storage server, not guessed ─────────────────────
//
// Zima validates every `/`-separated segment of the `x-folder` header (and of
// the folder part of an upload key) with, verbatim from its `lib/safeFiles.js`
// → `isValidFolderPath()`:
//
//     /^[a-zA-Z0-9_\- ក-៿]{1,80}$/
//
// A segment that fails is answered `400 {"error":"Invalid target folder"}` by
// the multer `destination` callback — i.e. the whole upload is refused before
// any byte is written. Three consequences drive everything in this file:
//
//  1. **80 is a per-segment cap on CHARACTERS** — not bytes, and not a budget
//     for the whole path. A JS regex quantifier counts UTF-16 code units, and
//     every Khmer code point (U+1780–U+17FF) is a single BMP unit, so a Khmer
//     segment is capped at 80 characters exactly like an English one. Path
//     depth and total path length are unconstrained by the server.
//
//  2. **Non-ASCII cannot travel in that header at all.** HTTP header values are
//     ByteStrings, so `zimaUpload()` percent-encodes a non-ASCII folder; the
//     server then matches the RAW header value, and `%` is not in the charset.
//     A Khmer segment is therefore rejected even though the server's own
//     charset would accept it. Storage segments stay ASCII here — the `uid`
//     carries uniqueness, so a Khmer-only title just gets a plain folder name.
//
//  3. **`.` is not in the charset**, so a dot anywhere in a FOLDER segment is
//     rejected. File names are validated separately by the server and keep
//     their extension; only folders are governed by this module.
//
// The budget below is deliberately well under 80: the cap is a hard 400, and a
// name that lands one character short of it is a name that breaks the next
// time anything is appended to it.

import { asciiSlug } from "@/lib/slug";

/** Zima's hard per-segment limit. Exceeding it is a 400, never a truncation. */
export const ZIMA_SEGMENT_MAX = 80;

/** What we actually aim for. Leaves headroom under {@link ZIMA_SEGMENT_MAX}. */
export const STORAGE_SEGMENT_BUDGET = 64;

/** The server's charset, mirrored exactly so validation cannot drift from it. */
const SERVER_SEGMENT_RE = /^[a-zA-Z0-9_\- ក-៿]+$/;

/** What the builder itself may emit: the ASCII half of the charset above. */
const ASCII_SEGMENT_RE = /^[a-zA-Z0-9_-]+$/;

export type SegmentIssue = "empty" | "too-long" | "non-ascii" | "bad-chars";

/**
 * Cut `slug` down to `room` characters at a word boundary.
 *
 * Prefers the last `-` so the name still reads as words, but never gives up
 * more than a quarter of the budget chasing one — a title whose first "word"
 * is longer than the budget (a long transliteration, a run-on compound) would
 * otherwise truncate to nothing at all.
 */
function truncateSlug(slug: string, room: number): string {
  if (slug.length <= room) return slug.replace(/-+$/, "");
  const cut = slug.slice(0, room);
  const lastDash = cut.lastIndexOf("-");
  const atBoundary = lastDash >= Math.floor(room * 0.75) ? cut.slice(0, lastDash) : cut;
  return atBoundary.replace(/-+$/, "");
}

/**
 * Build one storage folder segment: `<slug-of-title>-<uid>`, guaranteed to fit
 * the budget and to be accepted by Zima.
 *
 * The `uid` is reserved FIRST and always survives intact — it is the only thing
 * keeping two books apart once their titles have been truncated to a common
 * prefix. The `fallback` is used when the title has no ASCII content at all
 * (a Khmer-only title), which is what produces the historical `book-<uid>`.
 */
export function buildStorageFolderName(
  title: string | null | undefined,
  uid: string,
  fallback = "item",
  budget = STORAGE_SEGMENT_BUDGET,
): string {
  const safeUid = asciiSlug(uid ?? "");
  const suffix = safeUid ? `-${safeUid}` : "";
  const room = Math.max(1, budget - suffix.length);

  let base = truncateSlug(asciiSlug(title ?? ""), room);
  if (!base) base = truncateSlug(asciiSlug(fallback) || "item", room);
  if (!base) base = "item";

  return `${base}${suffix}`;
}

/**
 * How `buildStorageFolderName` had to treat a title:
 *   exact     — the slug fit as-is
 *   truncated — the slug was cut to fit the budget
 *   fallback  — the title had no Latin content, so `book-<uid>` was used
 *
 * These are three different things to tell an operator, and conflating the last
 * two is what makes a Khmer book look like an over-long English one.
 */
export type FolderNameNote = "exact" | "truncated" | "fallback";

export function folderNameNote(
  title: string | null | undefined,
  uid: string,
  budget = STORAGE_SEGMENT_BUDGET,
): FolderNameNote {
  const slug = asciiSlug(title ?? "");
  if (!slug) return "fallback";
  const safeUid = asciiSlug(uid ?? "");
  const room = Math.max(1, budget - (safeUid ? safeUid.length + 1 : 0));
  return slug.length > room ? "truncated" : "exact";
}

/**
 * Clamp a fixed (non-uid-bearing) segment such as a category name. No uid to
 * protect here, so the whole budget goes to the slug.
 */
export function clampStorageSegment(
  value: string | null | undefined,
  fallback: string,
  budget = STORAGE_SEGMENT_BUDGET,
): string {
  const slug = truncateSlug(asciiSlug(value ?? ""), budget);
  if (slug) return slug;
  return truncateSlug(asciiSlug(fallback), budget) || "files";
}

/** True when this module produced (or could have produced) `segment`. */
export function isSafeStorageSegment(segment: string): boolean {
  return segment.length <= ZIMA_SEGMENT_MAX && ASCII_SEGMENT_RE.test(segment);
}

/** Why Zima would reject `segment`, or null if it would accept it. */
export function storageSegmentIssue(segment: string): SegmentIssue | null {
  if (segment.trim() === "") return "empty";
  if (segment.length > ZIMA_SEGMENT_MAX) return "too-long";
  // Checked before the charset test: a non-ASCII segment is percent-encoded
  // into the header and fails for a reason the charset message would hide.
  if (/[^\u0000-\u007f]/.test(segment)) return "non-ascii";
  if (!SERVER_SEGMENT_RE.test(segment)) return "bad-chars";
  return null;
}

/**
 * Explain, in words an operator can act on, why Zima will refuse this folder
 * path — or null when it will accept it. Every upload entry point calls this
 * before sending, so nobody has to decode `Invalid target folder` again.
 *
 * Pass the FOLDER part of a key (`books/x/y`), not the file name.
 */
export function describeStoragePathError(folderPath: string): string | null {
  const segments = folderPath.split("/");
  for (const segment of segments) {
    const issue = storageSegmentIssue(segment);
    if (!issue) continue;
    const shown = segment.length > 40 ? `${segment.slice(0, 40)}…` : segment;
    switch (issue) {
      case "empty":
        return `Storage folder path has an empty segment ("${folderPath}").`;
      case "too-long":
        return `Folder name too long (${segment.length}/${ZIMA_SEGMENT_MAX} chars): "${shown}" — shorten the title or let the system truncate it.`;
      case "non-ascii":
        return `Folder name "${shown}" contains non-Latin characters, which storage folder names cannot carry — the title itself is unaffected.`;
      case "bad-chars":
        return `Folder name "${shown}" contains characters storage rejects — only letters, digits, "-" and "_" are allowed.`;
    }
  }
  return null;
}

/**
 * The same check for a full object key (`books/cat/slug-uid/book.pdf`): only
 * the directory part is validated, since the server sanitizes file names
 * itself and file names legitimately carry a `.`.
 */
export function describeStorageKeyError(key: string): string | null {
  const lastSlash = key.lastIndexOf("/");
  if (lastSlash <= 0) return null;
  return describeStoragePathError(key.slice(0, lastSlash));
}
