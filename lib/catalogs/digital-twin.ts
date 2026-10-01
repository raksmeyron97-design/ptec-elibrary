// lib/catalogs/digital-twin.ts
//
// Which e-book, if any, is the same work as a print catalogue record (SEO
// Phase 2.7, finding F12). The two catalogues share no key (CLAUDE.md), so
// the match is made on the two things a librarian would check: the ISBN, or
// the title and the author together. PURE and browser-safe; the normalizers
// are the ingestion gate's own (lib/books/duplicate-detection/normalize.ts),
// so "the same title" means here what it means at upload.
//
// Conservative in one direction on purpose. A missing link costs a reader a
// search; a wrong one sends them to a different book and tells a crawler two
// works are one. So an ISBN must name exactly one e-book, a title needs an
// author as well, and anything that matches more than one e-book (editions,
// volumes) links nowhere.

import {
  isbnMatchKeys,
  isMeaningfulAuthor,
  normalizeTitle,
  personNameKey,
} from "@/lib/books/duplicate-detection/normalize";

export type TwinCandidate = {
  slug: string;
  title: string;
  isbn?: string | null;
  authors: readonly (string | null | undefined)[];
};

export type TwinIndex = {
  byIsbn: Map<string, Set<string>>;
  byTitleAuthor: Map<string, Set<string>>;
};

/**
 * Every key a byline can be matched on: one per person, as the SET of their
 * name parts. A catalogue byline may list several people ("A; B") and writes
 * names surname-first — "Martin, Ann M." and, from the PMB import, "Pallant
 * Julie" with no comma at all (measured on production 2026-09-30) — so word
 * order cannot be part of the key. Every part must still agree: "J. Smith"
 * is not "John Smith", the rule the author picker uses.
 */
export function authorKeys(byline: string | null | undefined): string[] {
  const keys = new Set<string>();
  for (const part of (byline ?? "").split(/\s*[;/]\s*|\s+&\s+|\s+and\s+/)) {
    if (!isMeaningfulAuthor(part)) continue;
    const key = personNameKey(part.replace(/,/g, " ")).split(" ").filter(Boolean).sort().join(" ");
    if (key) keys.add(key);
  }
  return [...keys];
}

const titleAuthorKey = (title: string, author: string) => `${title}\u0000${author}`;

function add(map: Map<string, Set<string>>, key: string, slug: string) {
  const set = map.get(key);
  if (set) set.add(slug);
  else map.set(key, new Set([slug]));
}

export function buildTwinIndex(books: readonly TwinCandidate[]): TwinIndex {
  const byIsbn = new Map<string, Set<string>>();
  const byTitleAuthor = new Map<string, Set<string>>();
  for (const book of books) {
    if (!book.slug) continue;
    for (const key of isbnMatchKeys(book.isbn)) add(byIsbn, key, book.slug);
    const title = normalizeTitle(book.title);
    if (!title) continue;
    for (const byline of book.authors) {
      for (const author of authorKeys(byline)) add(byTitleAuthor, titleAuthorKey(title, author), book.slug);
    }
  }
  return { byIsbn, byTitleAuthor };
}

/** The one e-book slug this record is, or null. */
export function findDigitalTwin(
  index: TwinIndex,
  record: { isbn?: string | null; title?: string | null; author?: string | null },
): string | null {
  const isbnHits = new Set<string>();
  for (const key of isbnMatchKeys(record.isbn)) for (const slug of index.byIsbn.get(key) ?? []) isbnHits.add(slug);
  if (isbnHits.size === 1) return [...isbnHits][0];
  if (isbnHits.size > 1) return null;

  const title = normalizeTitle(record.title);
  if (!title) return null;
  const hits = new Set<string>();
  for (const author of authorKeys(record.author)) {
    for (const slug of index.byTitleAuthor.get(titleAuthorKey(title, author)) ?? []) hits.add(slug);
  }
  return hits.size === 1 ? [...hits][0] : null;
}
