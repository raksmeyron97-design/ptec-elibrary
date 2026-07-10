// Book citations — a thin adapter over the generic formatters in
// lib/citations.ts. Browser-safe (imported from the CiteBook client component).

import type { Book } from "@/lib/book-utils";
import { REPOSITORY } from "@/lib/theses/citation";
import {
  apa,
  bibtex,
  ris,
  citationFileName,
  type CitationWork,
} from "@/lib/citations";

export type CiteFormat = "apa" | "bibtex" | "ris";

export function bookUrl(slug: string): string {
  const base = REPOSITORY.baseUrl.replace(/\/$/, "");
  return `${base}/books/${slug}`;
}

/** Normalise a Book into the neutral CitationWork shape. Placeholder values
 *  from mapRowToBook ("N/A" isbn, pages 1) are treated as missing. */
export function bookToCitationWork(book: Book): CitationWork {
  return {
    kind: "book",
    title: (book.title || "").trim(),
    authors: (book.author || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    year: book.year ? String(book.year) : null,
    publisher: book.publisher?.trim() || REPOSITORY.name,
    isbn: book.isbn && book.isbn !== "N/A" ? book.isbn : null,
    pageCount: book.pages > 1 ? book.pages : null,
    language: book.language || null,
    url: bookUrl(book.slug),
  };
}

export function toAPA(book: Book): string {
  return apa(bookToCitationWork(book));
}

export function toBibTeX(book: Book): string {
  return bibtex(bookToCitationWork(book));
}

export function toRIS(book: Book): string {
  return ris(bookToCitationWork(book));
}

export function buildBookCitation(format: CiteFormat, book: Book): string {
  if (format === "bibtex") return toBibTeX(book);
  if (format === "ris") return toRIS(book);
  return toAPA(book);
}

export function bookCitationFile(format: CiteFormat, book: Book): { name: string; mime: string } {
  return citationFileName(format, bookToCitationWork(book));
}
