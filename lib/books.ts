import {
  type Book,
  departments,
  coverColors,
  slugify,
} from "./book-utils";

export { departments, coverColors, slugify };
export type { Book };

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
    viewCount:     row.view_count        ?? 0,
    dbId:          row.id                ?? null,
    tags:          Array.isArray(row.tags)
                     ? row.tags
                     : [row.department, row.categories?.name, row.language, row.authors?.name]
                         .filter(Boolean)
                         .map((t: string) => t.toLowerCase()),
  };
}