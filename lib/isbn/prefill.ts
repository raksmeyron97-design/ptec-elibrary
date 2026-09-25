/**
 * A chosen candidate → the Add form's starting values. Nothing is saved: the
 * librarian reviews and edits these on the ordinary form, whose own validation
 * and save path are unchanged.
 *
 * What is deliberately NOT filled: category, department, DDC and shelf. A
 * provider's subjects ("Computers", "Java (Computer program language)") are
 * not PTEC's taxonomy, and a plausible-looking wrong category is worse than an
 * empty one the librarian notices. Subjects become keyword suggestions.
 */
import { MAX_TEXT } from "@/lib/catalog";
import { resolveRowLanguage, type CatalogLanguage } from "@/lib/catalog-import";
import { isAllowedCoverSource } from "./cover-source";
import type { IsbnCandidate } from "./types";

export type CatalogPrefill = {
  title: string;
  author: string;
  isbn: string;
  publisher: string;
  year: string;
  language: CatalogLanguage;
  keywords: string[];
  description: string;
  /** A found cover to fetch and store on Save — never shown or stored as-is. */
  coverImportUrl: string | null;
};

/**
 * Several authors, joined with "; " — the byline splitter's unambiguous
 * delimiter (a comma is also how ONE name is inverted). Whole names only:
 * names that would overflow the field are left for the librarian to add.
 */
export function joinAuthors(names: string[], max = MAX_TEXT.author): string {
  let out = "";
  for (const n of names.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean)) {
    const next = out ? `${out}; ${n}` : n;
    if (next.length > max) break;
    out = next;
  }
  return out;
}

export function candidateToPrefill(c: IsbnCandidate): CatalogPrefill {
  const withSubtitle = c.subtitle ? `${c.title}: ${c.subtitle}` : c.title;
  const title = withSubtitle.length <= MAX_TEXT.title ? withSubtitle : c.title.slice(0, MAX_TEXT.title);
  return {
    title,
    author: joinAuthors(c.authors),
    isbn: c.isbn13,
    publisher: (c.publisher ?? "").slice(0, MAX_TEXT.publisher),
    year: c.year ? String(c.year) : "",
    // The provider's stated language wins; otherwise the title's script — the
    // importer's rule, so both ways into the catalogue agree.
    language: resolveRowLanguage(c.language, title).value,
    keywords: [...new Set(c.subjects.map((s) => s.trim()).filter(Boolean))].slice(0, 10),
    description: (c.description ?? "").slice(0, MAX_TEXT.description),
    coverImportUrl: isAllowedCoverSource(c.coverSource) ? c.coverSource : null,
  };
}
