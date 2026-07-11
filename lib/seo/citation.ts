// Pure, testable builders for Google Scholar's Highwire Press `citation_*`
// meta tags. One function per content type; each takes the minimal row shape
// already fetched by the corresponding detail page's generateMetadata, so
// the pages stay thin call sites and this module stays unit-testable without
// a database. Browser-safe — no server-only imports.

import { SITE_URL, PTEC_NAME } from "@/lib/seo/site";
import type { Publication } from "@/lib/publications";
import { authorList } from "@/lib/citations";
import { academicTextToPlainText } from "@/lib/publications/citations";

export type ScholarMeta = Record<string, string | string[]>;

/**
 * First valid date among the candidates, formatted `YYYY/MM/DD` (the format
 * Highwire tags require). Falls back to the current year if none parse —
 * matches the pre-existing per-page behavior this replaces.
 */
export function formatScholarDate(
  ...candidates: Array<string | null | undefined>
): string {
  for (const raw of candidates) {
    if (!raw) continue;
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}/${mm}/${dd}`;
    }
  }
  return String(new Date().getFullYear());
}

/** "Sok San, Chan Dara" → ["Sok San", "Chan Dara"] */
export function splitAuthorNames(authorNames: string | null | undefined): string[] {
  if (!authorNames) return [];
  return authorNames
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Accepts either a text[] column or a legacy comma-joined string. */
export function normalizeKeywords(keywords: string[] | string | null | undefined): string[] {
  if (Array.isArray(keywords)) return keywords.filter(Boolean);
  if (typeof keywords === "string" && keywords) {
    return keywords.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

// ── Books ────────────────────────────────────────────────────────────────

export interface BookCitationRow {
  id: string;
  title: string;
  isbn?: string | null;
  language?: string | null;
  published_at?: string | null;
  tags?: string[] | null;
}

/** citation_pdf_url points at /api/books/[id]/file, which is anonymously
 * readable (auth is only enforced for ?download=1) and serves
 * Content-Type: application/pdf directly — no presigned-URL redirect. */
export function bookScholarMeta(book: BookCitationRow, authors: string[]): ScholarMeta {
  const tags: ScholarMeta = {
    citation_title: book.title,
    citation_publisher: PTEC_NAME,
    citation_pdf_url: `${SITE_URL}/api/books/${book.id}/file`,
  };
  if (authors.length > 0) tags.citation_author = authors;
  if (book.published_at) tags.citation_publication_date = book.published_at;
  if (book.isbn && book.isbn !== "N/A") tags.citation_isbn = book.isbn;
  if (book.language) tags.citation_language = book.language;
  const keywords = Array.isArray(book.tags) ? book.tags.filter(Boolean) : [];
  if (keywords.length > 0) tags.citation_keywords = keywords.join("; ");
  return tags;
}

// ── Theses (research_reports) ───────────────────────────────────────────

export interface ThesisCitationRow {
  id: string;
  title: string;
  abstract?: string | null;
  author_names?: string | null;
  keywords?: string[] | string | null;
  doi?: string | null;
  published_at?: string | null;
  created_at?: string | null;
}

/** citation_pdf_url points at /api/theses/[id]/file (NOT /file.pdf — that
 * route segment doesn't exist and 404s). Anonymously readable, serves
 * Content-Type: application/pdf directly. */
export function thesisScholarMeta(report: ThesisCitationRow): ScholarMeta {
  const authors = splitAuthorNames(report.author_names);
  const keywords = normalizeKeywords(report.keywords);
  const tags: ScholarMeta = {
    citation_title: report.title,
    citation_publication_date: formatScholarDate(report.published_at, report.created_at),
    // Dissertation tag (not citation_technical_report_institution) is the
    // semantically correct Highwire tag for a student thesis/dissertation.
    citation_dissertation_institution: PTEC_NAME,
    citation_pdf_url: `${SITE_URL}/api/theses/${report.id}/file`,
  };
  if (authors.length > 0) tags.citation_author = authors;
  if (report.abstract) tags.citation_abstract = report.abstract;
  if (keywords.length > 0) tags.citation_keywords = keywords.join("; ");
  if (report.doi) tags.citation_doi = report.doi;
  return tags;
}

// ── Publications (journal articles) ─────────────────────────────────────

/** citation_pdf_url points at /api/publications/[slug]/file, which is
 * anonymously readable and serves Content-Type: application/pdf directly. */
export function publicationScholarMeta(pub: Publication): ScholarMeta {
  const authors = authorList(pub);
  const tags: ScholarMeta = {
    citation_title: pub.title,
    citation_publication_date: formatScholarDate(pub.publication_date, pub.published_at, pub.created_at),
    citation_pdf_url: `${SITE_URL}/api/publications/${pub.slug}/file`,
    citation_language: pub.language,
  };
  if (authors.length > 0) tags.citation_author = authors;
  if (pub.journal_name) tags.citation_journal_title = pub.journal_name;
  if (pub.volume) tags.citation_volume = pub.volume;
  if (pub.issue_no) tags.citation_issue = pub.issue_no;
  if (pub.page_start) tags.citation_firstpage = pub.page_start;
  if (pub.page_end) tags.citation_lastpage = pub.page_end;
  if (pub.doi) tags.citation_doi = pub.doi;
  if (pub.isbn) tags.citation_isbn = pub.isbn;
  if (pub.publisher) tags.citation_publisher = pub.publisher;
  if (pub.abstract) tags.citation_abstract = academicTextToPlainText(pub.abstract, pub.references);
  const keywords = [...new Set([...(pub.keywords ?? []), ...(pub.subjects ?? [])])];
  if (keywords.length > 0) tags.citation_keywords = keywords.join("; ");
  return tags;
}
