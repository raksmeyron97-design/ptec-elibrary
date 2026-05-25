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
  downloadCount?: number; // ← NEW: from books.download_count column
};

// ── Shared Supabase row → Book mapper ─────────────────────────
// Used by both /books (list) and /books/[slug] (detail) pages
// so the mapping logic lives in one place only.
export function mapRowToBook(row: any): Book {
  const files = Array.isArray(row.book_files) ? row.book_files : [];
  const pdfFile = files.find((f: any) => f.format === "pdf") ?? files[0] ?? null;

  return {
    slug:          row.slug,
    title:         row.title,
    author:        row.authors?.name     ?? "Unknown",
    isbn:          row.isbn              ?? "N/A",
    department:    row.department        ?? "General",
    category:      row.categories?.name  ?? "General",
    language:      row.language          ?? "English",
    year:          row.published_at
                     ? new Date(row.published_at).getFullYear()
                     : new Date().getFullYear(),
    format:        "PDF",
    availability:  "Digital",
    rating:        Number(row.rating)    || 5,
    pages:         row.pages             ?? 1,
    summary:       row.description       ?? "",
    cover:         row.cover_color       ?? "bg-[#0a1629]",
    coverUrl:      row.cover_url         ?? null,
    pdfUrl:        pdfFile?.file_url     ?? null,
    uploadedAt:    row.published_at      ?? undefined,
    downloadCount: row.download_count    ?? 0,
    tags:          Array.isArray(row.tags)
                     ? row.tags
                     : [row.department, row.categories?.name, row.language, row.authors?.name]
                         .filter(Boolean)
                         .map((t: string) => t.toLowerCase()),
  };
}

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