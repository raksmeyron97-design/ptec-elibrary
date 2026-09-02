// lib/book-utils.ts
// ──────────────────────────────────────────────────────────────
// Pure, browser-safe utilities and types extracted from lib/books.ts.
// This file MUST NOT import node:fs, node:path, or any server-only module,
// so it can be safely imported from Client Components ("use client").
// ──────────────────────────────────────────────────────────────

import { unicodeSlug } from "@/lib/slug";
import { buildStorageFolderName, clampStorageSegment } from "@/lib/storage/folder-name";

export type Book = {
  slug: string;
  title: string;
  author: string;
  isbn: string;
  publisher?: string | null;
  department: string;
  category: string;
  language: string;
  year: number;
  format: "PDF" | "Print" | "Audio" | "Video";
  availability: "Available" | "Borrowed" | "Digital";
  rating: number;
  pages: number;
  summary: string;
  cover: string;
  pdfUrl?: string | null;
  /** The book's real publication date (books.published_at), NOT an upload
    *  timestamp. Named `uploadedAt` until V2, which is why the detail page's
    *  `publishedAt: book.uploadedAt` line read like the exact bug it was not
    *  (docs/SEO-V2-AUDIT.md F-9). It feeds `datePublished` in JSON-LD and
    *  `og:published_time`; undefined when the record has no date. */
  publicationDate?: string;
  tags: string[];
  coverUrl?: string | null;
  downloadCount?: number;
  viewCount?: number;
  dbId?: string | null;
  reviewCount?: number; // real number of reviews (0 = unrated → shows "New")
  createdAt?: string;   // ISO string from created_at column; used for NEW badge
  license?: string | null;
  verifiedAt?: string | null;
};



/**
 * Rights/license options for the admin upload & edit forms (migration 0062).
 * The blank "" option is the default and is deliberately omitted from the
 * insert/update payload (falls back to the DB default 'unknown') so the form
 * keeps working even before 0062 is applied.
 */
export const LICENSE_OPTIONS: { value: string; label: string }[] = [
  { value: "",                    label: "Not specified" },
  { value: "public_domain",       label: "Public Domain" },
  { value: "cc_by",               label: "CC BY (attribution)" },
  { value: "cc_by_nc",            label: "CC BY-NC (non-commercial)" },
  { value: "cc_by_nc_nd",         label: "CC BY-NC-ND (no derivatives)" },
  { value: "moeys_open",          label: "MoEYS Open (Cambodian education use)" },
  { value: "all_rights_reserved", label: "All Rights Reserved" },
];

export const departments = [
  "Primary Education",
  "Lower Secondary",
  "Pedagogy",
  "Science",
  "Technology",
  "Language",
  "Research",
];

export const coverColors = [
  "bg-[#0f766e]",
  "bg-[#2563eb]",
  "bg-[#7c3aed]",
  "bg-[#16a34a]",
  "bg-[#db2777]",
  "bg-[#0891b2]",
  "bg-[#ca8a04]",
  "bg-[#ea580c]",
];

export function slugify(value: string) {
  return unicodeSlug(value) || `book-${Date.now()}`;
}

// ──────────────────────────────────────────────────────────────
// R2 storage path helpers
// ──────────────────────────────────────────────────────────────
// Goal: a clean, predictable folder layout in Cloudflare R2 so every
// asset is easy to locate, group, and delete. One folder == one book.
//
//   books/{category-slug}/{book-slug}-{uid}/book.pdf
//   books/{category-slug}/{book-slug}-{uid}/cover.{ext}
//   posts/{post-slug}-{uid}/cover-{NN}.{ext}
//
// Because the {uid} lives on the *folder*, the file names inside can
// stay fixed ("book.pdf", "cover.jpg") — editing a cover overwrites the
// same key instead of leaving orphaned files scattered around.
// ──────────────────────────────────────────────────────────────

/**
 * Short, URL-safe unique id (8 chars) — the part of a storage folder name that
 * keeps two books apart.
 *
 * Four time-derived characters keep folders roughly chronological, and four
 * random ones carry the uniqueness. The previous `Date.now().toString(36)`
 * alone gave every row built in the same millisecond the same id, and the bulk
 * importer builds all 86 jobs in one synchronous pass. That was survivable
 * while a folder name carried the whole title; it is not now that long titles
 * are truncated to a common prefix and the uid is the only thing left telling
 * two folders apart. Four base36 characters put a 500-row batch's collision
 * probability under 0.1%, against roughly 3 expected collisions with two.
 */
export function makeUid() {
  const time = Date.now().toString(36).slice(-4);
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  const bytes = new Uint8Array(4);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  let random = "";
  // 256 % 36 != 0, so a plain modulo is very slightly biased toward the first
  // four letters. Irrelevant for a collision-avoidance id, and not a secret.
  for (const b of bytes) random += alphabet[b % alphabet.length];
  return `${time}${random}`;
}

/** Lower-cased file extension (no dot). Falls back to a sensible default. */
function fileExt(name: string, fallback = "bin") {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext && ext !== name.toLowerCase() ? ext : fallback;
}

/**
 * Per-book folder: `books/{category}/{title}-{uid}` (no trailing slash).
 *
 * Both variable segments go through lib/storage/folder-name.ts, which keeps
 * them ASCII and inside Zima's 80-character-per-segment cap. Before that,
 * every academic title with a subtitle — "Interviewing as Qualitative
 * Research: A Guide for Researchers in Education and the Social Sciences (3rd
 * Edition)" is 116 characters slugified — produced a folder the storage server
 * refused with `400 {"error":"Invalid target folder"}`, so those books could
 * never be uploaded at all.
 */
export function bookFolder(category: string | null | undefined, title: string, uid: string) {
  const cat = clampStorageSegment((category ?? "").trim(), "uncategorized");
  return `books/${cat}/${buildStorageFolderName(title, uid, "book")}`;
}

/** The book's PDF key inside its folder. */
export function bookPdfPath(folder: string) {
  return `${folder}/book.pdf`;
}

/** The book's cover key inside its folder. */
export function bookCoverPath(folder: string, coverFileName: string) {
  return `${folder}/cover.${fileExt(coverFileName, "jpg")}`;
}

/** Per-post folder: `posts/{title}-{uid}` (no trailing slash). */
export function postFolder(title: string, uid: string) {
  return `posts/${buildStorageFolderName(title, uid, "post")}`;
}

/** Per-thesis folder: `reports/{title}-{uid}` (the DB table is research_reports). */
export function thesisFolder(title: string, uid: string) {
  return `reports/${buildStorageFolderName(title, uid, "thesis")}`;
}

/** Per-publication folder: `publications/{slug}-{uid}`. */
export function publicationFolder(slug: string, uid: string) {
  return `publications/${buildStorageFolderName(slug, uid, "publication")}`;
}

/** A numbered cover key inside a post folder, e.g. `.../cover-01.jpg`. */
export function postCoverPath(folder: string, index: number, coverFileName: string) {
  const seq = String(index + 1).padStart(2, "0");
  return `${folder}/cover-${seq}.${fileExt(coverFileName, "jpg")}`;
}

/**
 * Given a public cover URL, recover the per-book folder if it follows the
 * `books/{category}/{slug}-{uid}/...` layout. Returns `null` for legacy/flat
 * URLs so callers can fall back to creating a fresh folder.
 */
export function bookFolderFromCoverUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const fromKey = (key: string) => {
    const m = key.replace(/^\/+/, "").match(/^(books\/[^/]+\/[^/]+)\//);
    return m ? m[1] : null;
  };
  try {
    return fromKey(new URL(url).pathname);
  } catch {
    // Not an absolute URL — try treating the value itself as a key.
    return fromKey(url);
  }
}