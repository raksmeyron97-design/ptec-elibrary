/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  type Book,
  departments,
  coverColors,
  slugify,
} from "./book-utils";

export { departments, coverColors, slugify };
export type { Book };

// license/verified_at (migration 0062) are deliberately NOT included here —
// this shared select is used by the homepage trending section and
// recommendations, and an unknown-column error on those call sites would
// silently empty the result (no per-call fallback like the book detail page
// has). Badges only need the dedicated selects on the detail pages.
export const BOOK_SELECT = `id, title, slug, description, cover_color, cover_url, language,
   published_at, created_at, department, pages, isbn, publisher, rating, download_count, view_count,
   authors(name), categories(name), departments(name), book_files(format, file_url, file_size_kb), reviews(rating)`;

export function mapRowToBook(row: any): Book & { reviewCount: number } {
  const files = Array.isArray(row.book_files) ? row.book_files : [];
  const pdfFile = files.find((f: any) => f.format === "pdf") ?? files[0] ?? null;

  // ── Real review stats ──────────────────────────────────────────────
  // Supports BOTH data shapes:
  //  (A) the `books_with_stats` view  → row.review_count / row.avg_rating
  //  (B) an embedded select            → row.reviews = [{ rating }, ...]
  // We deliberately IGNORE row.rating (books.rating DEFAULT 5.0) so that
  // unrated books no longer show a fake 5.0.
  const embeddedReviews = Array.isArray(row.reviews) ? row.reviews : [];

  const reviewCount =
    typeof row.review_count === "number"
      ? row.review_count
      : embeddedReviews.length;

  const avgFromEmbedded = embeddedReviews.length
    ? embeddedReviews.reduce(
        (sum: number, r: any) => sum + Number(r.rating || 0),
        0,
      ) / embeddedReviews.length
    : null;

  const realRating =
    row.avg_rating != null ? Number(row.avg_rating) : avgFromEmbedded;
  // ────────────────────────────────────────────────────────────────────

  return {
    slug:          row.slug,
    title:         row.title,
    author:        row.authors?.name     ?? "Unknown",
    isbn:          row.isbn              ?? "N/A",
    publisher:     row.publisher         ?? null,
    department:    row.departments?.name ?? row.department ?? "General",
    category:      row.categories?.name  ?? "General",
    language:      row.language          ?? "English",
    // 0 = unknown (books imported without a real publication date keep
    // published_at NULL). Never default to the current year — that fabricates
    // a publication year in displays and citations.
    year:          row.published_at
                     ? new Date(row.published_at).getFullYear()
                     : 0,
    format:        "PDF",
    availability:  "Digital",
    // Real average (rounded to 1 decimal). Only shown when reviewCount > 0,
    // so the exact value here is irrelevant for unrated books.
    rating:        realRating != null ? Math.round(realRating * 10) / 10 : 0,
    reviewCount,
    pages:         row.pages             ?? 1,
    summary:       row.description       ?? "",
    cover:         row.cover_color       ?? "bg-[#0a1629]",
    coverUrl:      row.cover_url         ?? null,
    pdfUrl:        pdfFile?.file_url     ?? null,
    uploadedAt:    row.published_at      ?? undefined,
    createdAt:     row.created_at        ?? undefined,
    downloadCount: row.download_count    ?? 0,
    viewCount:     row.view_count        ?? 0,
    dbId:          row.id                ?? null,
    tags:          row.tags              ?? [],
    license:       row.license           ?? null,
    verifiedAt:    row.verified_at       ?? null,
  };
}