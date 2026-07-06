// lib/book-utils.ts
// ──────────────────────────────────────────────────────────────
// Pure, browser-safe utilities and types extracted from lib/books.ts.
// This file MUST NOT import node:fs, node:path, or any server-only module,
// so it can be safely imported from Client Components ("use client").
// ──────────────────────────────────────────────────────────────

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
  uploadedAt?: string;
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
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `book-${Date.now()}`;
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

/** Short, URL-safe unique id (time-based, 6 chars). */
export function makeUid() {
  return Date.now().toString(36).slice(-6);
}

/** Lower-cased file extension (no dot). Falls back to a sensible default. */
function fileExt(name: string, fallback = "bin") {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext && ext !== name.toLowerCase() ? ext : fallback;
}

/** Per-book folder: `books/{category}/{title}-{uid}` (no trailing slash). */
export function bookFolder(category: string | null | undefined, title: string, uid: string) {
  const cat = slugify((category ?? "").trim() || "uncategorized");
  return `books/${cat}/${slugify(title)}-${uid}`;
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
  return `posts/${slugify(title)}-${uid}`;
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