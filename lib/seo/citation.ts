// Pure, testable builders for Google Scholar's Highwire Press `citation_*`
// meta tags. One function per content type; each takes the minimal row shape
// already fetched by the corresponding detail page's generateMetadata, so
// the pages stay thin call sites and this module stays unit-testable without
// a database. Browser-safe — no server-only imports.

import { scholarDateAtPrecision } from "@/lib/seo/dates";
import {
  resolveOrgIdentity,
  type OrgIdentity,
} from "@/lib/system-settings/org-identity";
import type { Publication } from "@/lib/publications";
import { authorList } from "@/lib/citations";
import { academicTextToPlainText } from "@/lib/publications/citations";
import { normalizeDoi, normalizeIssn } from "@/lib/seo/identifiers";
import { citationNames } from "@/lib/resources/contributor-identity";

export type ScholarMeta = Record<string, string | string[]>;

/**
 * First valid date among the candidates, in the Highwire form Google Scholar
 * reads, AT THE PRECISION THE LIBRARY KNOWS: "2023" for a date on 1 January
 * (books store a year as `YYYY-01-01`), "2023/05/12" otherwise, read in UTC
 * (lib/seo/dates.ts). Undefined when nothing parses: the old fallback to the
 * CURRENT year published an invented date, and a missing tag is honest.
 */
export function formatScholarDate(
  ...candidates: Array<string | null | undefined>
): string | undefined {
  return scholarDateAtPrecision(...candidates);
}

/**
 * "Sok San, Chan Dara" → ["Sok San", "Chan Dara"] — one `citation_author` tag
 * per name, which is what Google Scholar reads.
 *
 * The split is the library's ONE byline splitter (`citationNames`), not a
 * local `.split(",")`. A comma is also how a single name is inverted, so the
 * naive version published `citation_author: Smith` and `citation_author: John`
 * for one person named "Smith, John" — two authors Scholar would index who do
 * not exist. `citationNames()` splits only where every segment is a full name
 * and otherwise emits the byline as one tag, which is less granular and true.
 */
export function splitAuthorNames(authorNames: string | null | undefined): string[] {
  return citationNames(authorNames);
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
  /** The book's ACTUAL publisher — PTEC hosts most books but publishes almost
   *  none of them, so this is null for the majority. */
  publisher?: string | null;
  tags?: string[] | null;
  /** Library download policy (books.allow_download, migration 0131). Absent
   *  reads as "allowed", the column's default. */
  allow_download?: boolean | null;
  /** Authoritative file policy (books.file_access, migration 0151). Absent
   *  reads as "public". A catalogue-only record advertises no file at all. */
  file_access?: string | null;
}

/** No citation_pdf_url for a book (SEO Phase 3.7, D12). A book's PDF is
 * served only to a signed-in reader, from /api/books/[id]/file — a path
 * robots.txt disallows and that answers 401 anonymously — so the tag named a
 * URL Google Scholar could not fetch. Only a PUBLIC full text is named: an
 * open-access thesis or an openly licensed article (their own fulltext.pdf
 * routes). The rest of this note records why, even before, it was
 * OMITTED for a read-online-only book (0131) and for a catalogue-only
 * one (0151). The tag exists to tell a crawler "here is the file, take it",
 * and Scholar then hosts a cached copy of what it fetches — which is the one
 * thing both settings say not to do. The landing page, and every other
 * citation_* tag, stay exactly as they were, so the record remains fully
 * indexed as metadata.
 *
 * citation_publisher is emitted ONLY when the record names a real publisher.
 * PTEC is the providing library, not the publisher of these third-party
 * textbooks — asserting citation_publisher=PTEC to Google Scholar would be a
 * factual misattribution. */
export function bookScholarMeta(book: BookCitationRow, authors: string[]): ScholarMeta {
  const tags: ScholarMeta = { citation_title: book.title };
  const publisher = book.publisher?.trim();
  if (publisher) tags.citation_publisher = publisher;
  if (authors.length > 0) tags.citation_author = authors;
  const date = scholarDateAtPrecision(book.published_at);
  if (date) tags.citation_publication_date = date;
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
  /** 'km' | 'en' | 'km_en' — research_reports.language, set by a librarian. */
  language?: string | null;
  /** 'research_report' gets the technical-report tags; anything else is a thesis. */
  thesis_type?: string | null;
  /** 0163: the report's own number, for citation_technical_report_number. */
  report_number?: string | null;
}

/**
 * A credit that names a GROUP, not a person: the cohort label a byline
 * sometimes opens with ("គរុនិស្សិត ១២+៤ ជំនាន់ទី២" — student teachers,
 * 12+4, cohort 2 — was production's first `citation_author` on 2026-09-30).
 * Narrow on purpose: it looks for the words a cohort label is made of, so a
 * person's name is never dropped for resembling one.
 */
export function isCohortLabel(name: string): boolean {
  return /ជំនាន់|គរុនិស្សិត|\bcohort\b|\bbatch\b|\bclass of\b|\bgeneration\b/iu.test(name);
}

/**
 * The page locale a work's Scholar tags belong on (Phase 3.3): Google Scholar
 * should see ONE record per work, so `citation_*` go on the page in the work's
 * own language and nowhere else. Khmer — as a code ("km"), a name ("Khmer")
 * or bilingual ("km_en") — is the /km page; any other language is the English
 * page, the site's default; with no language recorded, the title's script
 * decides. One rule for theses, books and journal articles.
 */
export function citationLocale(language: string | null | undefined, title?: string | null): "km" | "en" {
  const value = language?.trim().toLowerCase() ?? "";
  if (value) return /^(km|khm|khmer)/.test(value) ? "km" : "en";
  return /[\u1780-\u17FF]/u.test(title ?? "") ? "km" : "en";
}

/** citationLocale for a thesis row. */
export function thesisCitationLocale(row: Pick<ThesisCitationRow, "language" | "title">): "km" | "en" {
  return citationLocale(row.language, row.title);
}

export type ThesisScholarOptions = {
  /** The page's locale. When given, tags are emitted only if it is the work's. */
  locale?: string;
  /** This page's canonical URL — citation_abstract_html_url. */
  abstractUrl?: string;
  /** The PUBLIC full text (lib/theses/open-access.ts), or null/absent: then
   *  no citation_pdf_url at all — a PDF behind a sign-in is not one Scholar
   *  can fetch, and pointing it at one teaches it the site's PDFs fail. */
  pdfUrl?: string | null;
};

export function thesisScholarMeta(
  report: ThesisCitationRow,
  orgArg?: OrgIdentity,
  options: ThesisScholarOptions = {},
): ScholarMeta {
  if (options.locale && options.locale !== thesisCitationLocale(report)) return {};
  const org = resolveOrgIdentity(orgArg);
  // Authors only: the caller passes author-role credits, and a cohort label
  // that rode in on the byline is still not a person.
  const authors = splitAuthorNames(report.author_names).filter((name) => !isCohortLabel(name));
  const keywords = normalizeKeywords(report.keywords);
  const tags: ScholarMeta = { citation_title: report.title };
  if (report.thesis_type === "research_report") {
    tags.citation_technical_report_institution = org.institutionName;
    const number = report.report_number?.trim();
    if (number) tags.citation_technical_report_number = number;
  } else {
    // The dissertation tag is the semantically correct Highwire tag for a
    // student thesis.
    tags.citation_dissertation_institution = org.institutionName;
  }
  const date = formatScholarDate(report.published_at, report.created_at);
  if (date) tags.citation_publication_date = date;
  if (authors.length > 0) tags.citation_author = authors;
  const language = report.language?.trim().toLowerCase();
  if (language === "km" || language === "en") tags.citation_language = language;
  else if (language === "km_en") tags.citation_language = "km";
  if (report.abstract) tags.citation_abstract = report.abstract;
  if (keywords.length > 0) tags.citation_keywords = keywords.join("; ");
  // Only a structurally-valid, non-placeholder DOI reaches Google Scholar.
  const doi = normalizeDoi(report.doi);
  if (doi) tags.citation_doi = doi;
  if (options.abstractUrl) tags.citation_abstract_html_url = options.abstractUrl;
  if (options.pdfUrl) tags.citation_pdf_url = options.pdfUrl;
  return tags;
}

// ── Publications (journal articles) ─────────────────────────────────────

/** citation_pdf_url names the article's PUBLIC full text,
 * /journals/articles/<slug>/fulltext.pdf, and only when its licence allows it
 * to be redistributed (`options.pdfUrl`, decided by the caller through
 * lib/publications/access.ts). It used to name /api/publications/<slug>/file
 * for every article — a robots-blocked path, emitted even with no PDF. */
export function publicationScholarMeta(pub: Publication, options: { pdfUrl?: string | null } = {}): ScholarMeta {
  const authors = authorList(pub);
  const tags: ScholarMeta = {
    citation_title: pub.title,
    citation_language: pub.language,
  };
  if (options.pdfUrl) tags.citation_pdf_url = options.pdfUrl;
  const date = formatScholarDate(pub.publication_date, pub.published_at, pub.created_at);
  if (date) tags.citation_publication_date = date;
  if (authors.length > 0) tags.citation_author = authors;
  if (pub.journal_name) tags.citation_journal_title = pub.journal_name;
  if (pub.volume) tags.citation_volume = pub.volume;
  if (pub.issue_no) tags.citation_issue = pub.issue_no;
  if (pub.page_start) tags.citation_firstpage = pub.page_start;
  if (pub.page_end) tags.citation_lastpage = pub.page_end;
  // Validate before publishing to Google Scholar — a placeholder DOI
  // (10.1234/eds) or bad ISSN checksum must never be asserted.
  const doi = normalizeDoi(pub.doi);
  if (doi) tags.citation_doi = doi;
  // A journal article's identifier is its ISSN, NOT the reviewed book's ISBN —
  // emitting citation_isbn from pub.isbn conflates the two, so we don't.
  const issn = normalizeIssn(pub.issn);
  if (issn) tags.citation_issn = issn;
  if (pub.publisher) tags.citation_publisher = pub.publisher;
  if (pub.abstract) tags.citation_abstract = academicTextToPlainText(pub.abstract, pub.references);
  const keywords = [...new Set([...(pub.keywords ?? []), ...(pub.subjects ?? [])])];
  if (keywords.length > 0) tags.citation_keywords = keywords.join("; ");
  return tags;
}
