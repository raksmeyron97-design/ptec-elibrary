import type { Book } from "@/lib/book-utils";
import { REPOSITORY } from "@/lib/research/citation";

export type CiteFormat = "apa" | "bibtex" | "ris";

export function bookUrl(slug: string): string {
  const base = REPOSITORY.baseUrl.replace(/\/$/, "");
  return `${base}/books/${slug}`;
}

function bibKey(book: Book): string {
  const a = (book.author || "unknown").split(/[\s,]+/)[0] || "book";
  const y = book.year || "nd";
  const t = (book.title || "untitled").split(/\s+/)[0] || "book";
  return `${a}${y}${t}`.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

export function toAPA(book: Book): string {
  const author = book.author || "Unknown Author";
  const year = book.year || "n.d.";
  const title = book.title.trim();
  const isbn = book.isbn && book.isbn !== "N/A" ? ` ISBN: ${book.isbn}.` : "";
  const url = bookUrl(book.slug);
  return `${author} (${year}). ${title}.${isbn} ${REPOSITORY.name}. ${url}`;
}

export function toBibTeX(book: Book): string {
  const fields: Array<[string, string | number | null | undefined]> = [
    ["author",    book.author],
    ["title",     book.title.trim()],
    ["year",      book.year],
    ["isbn",      book.isbn !== "N/A" ? book.isbn : null],
    ["language",  book.language],
    ["pages",     book.pages > 0 ? book.pages : null],
    ["publisher", REPOSITORY.name],
    ["url",       bookUrl(book.slug)],
  ];
  const body = fields
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `  ${k} = {${String(v).replace(/[{}]/g, "")}}`)
    .join(",\n");
  return `@book{${bibKey(book)},\n${body}\n}`;
}

export function toRIS(book: Book): string {
  const lines: Array<[string, string | number | null | undefined]> = [
    ["TY", "BOOK"],
    ["TI", book.title.trim()],
    ["AU", book.author],
    ["PY", book.year],
    ["PB", REPOSITORY.name],
    ["SN", book.isbn !== "N/A" ? book.isbn : null],
    ["LA", book.language],
    ["UR", bookUrl(book.slug)],
    ["ER", ""],
  ];
  return lines
    .filter(([tag, v]) => tag === "ER" || (v != null && v !== ""))
    .map(([tag, v]) => `${tag}  - ${v ?? ""}`)
    .join("\n");
}

export function buildBookCitation(format: CiteFormat, book: Book): string {
  if (format === "bibtex") return toBibTeX(book);
  if (format === "ris") return toRIS(book);
  return toAPA(book);
}

export function bookCitationFile(format: CiteFormat, book: Book): { name: string; mime: string } {
  const slug = bibKey(book) || "citation";
  if (format === "bibtex") return { name: `${slug}.bib`, mime: "application/x-bibtex" };
  if (format === "ris")    return { name: `${slug}.ris`, mime: "application/x-research-info-systems" };
  return { name: `${slug}.txt`, mime: "text/plain" };
}
