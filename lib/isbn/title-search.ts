/**
 * Open Library search by title and author — for a book whose ISBN the
 * librarian does not have (docs/CATALOG-REVIEW.md, Slice 7: the Khmer
 * fallbacks; no AI, no OCR, by PTEC decision 2026-10-05). Pure.
 *
 * A search result is a SUGGESTION OF AN ISBN, never a source of record data:
 * choosing one only puts its ISBN in the field, and the details then come
 * through Fetch by ISBN — exact ISBN identity, the title-mismatch check and the
 * preview. Fuzzy title matching never fills a field.
 */
import { normalizeIsbn, validateIsbn } from "@/lib/books/duplicate-detection/normalize";
import { isObj, str, strArr } from "./providers/fetch-json";

export const TITLE_SEARCH_LIMIT = 5;
export const TITLE_MAX = 200;
export const AUTHOR_MAX = 120;

export type TitleSearchResult = {
  /** Open Library work key, e.g. "/works/OL123W". */
  key: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  year: number | null;
  publishers: string[];
  languages: string[];
  /** Valid ISBNs, as ISBN-13, deduplicated; at most five. */
  isbn13s: string[];
};

const FIELDS = "key,title,subtitle,author_name,first_publish_year,publisher,language,isbn";

export function titleSearchUrl(title: string, author?: string | null): string | null {
  const t = title.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
  if (t.length < 2) return null;
  const params = new URLSearchParams({ title: t, limit: String(TITLE_SEARCH_LIMIT), fields: FIELDS });
  const a = (author ?? "").normalize("NFC").replace(/\s+/g, " ").trim().slice(0, AUTHOR_MAX);
  if (a) params.set("author", a);
  return `https://openlibrary.org/search.json?${params}`;
}

export function parseTitleSearch(body: unknown): TitleSearchResult[] {
  if (!isObj(body) || !Array.isArray(body.docs)) return [];
  const out: TitleSearchResult[] = [];
  for (const doc of body.docs.slice(0, TITLE_SEARCH_LIMIT)) {
    if (!isObj(doc)) continue;
    const key = str(doc.key);
    const title = str(doc.title);
    if (!key || !title) continue;
    const isbn13s: string[] = [];
    for (const raw of strArr(doc.isbn)) {
      if (validateIsbn(raw).status !== "valid") continue;
      const canonical = normalizeIsbn(raw);
      if (canonical && !isbn13s.includes(canonical)) isbn13s.push(canonical);
      if (isbn13s.length >= 5) break;
    }
    const year = typeof doc.first_publish_year === "number" && doc.first_publish_year > 0 ? doc.first_publish_year : null;
    out.push({
      key,
      title,
      subtitle: str(doc.subtitle),
      authors: strArr(doc.author_name).slice(0, 5),
      year,
      publishers: strArr(doc.publisher).slice(0, 3),
      languages: strArr(doc.language).slice(0, 5),
      isbn13s,
    });
  }
  return out;
}
