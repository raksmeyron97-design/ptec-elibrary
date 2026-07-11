// Pure citation formatters — the single engine behind "Cite this" for books,
// theses, and publications. Framework-free and browser-safe: no server-only
// imports, no external deps, unit-tested in lib/citations.test.ts.
//
// Layout:
//   1. CitationWork — the neutral shape every domain type is adapted into
//      (bookToCitationWork / thesisToCitationWork live next to their domain
//      types in lib/books/citation.ts and lib/theses/citation.ts;
//      publicationToCitationWork lives here with the Publication helpers).
//   2. apa() / bibtex() / ris() — pure formatters over CitationWork, with
//      BibTeX special-character escaping and single-line RIS values.
//   3. Publication-specific builders (toAPA, toMLA, …) kept for existing
//      call sites; apa/bibtex/ris variants delegate to the generic core.

import { SITE_URL } from "@/lib/seo/site";
import type { Publication } from "@/lib/publications";
import { academicTextToPlainText } from "@/lib/publications/citations";

export type CiteFormat = "apa" | "mla" | "chicago" | "ieee" | "bibtex" | "ris";

// ── 1. The neutral work shape ────────────────────────────────────────────────
    
export type CitationWork = {
  kind: "book" | "thesis" | "article";
  title: string;
  /** Display names in byline order; joined with ", " (APA) or " and " (BibTeX). */
  authors: string[];
  year: string | null;
  /** Book publisher / thesis institution. Ignored for @article BibTeX fields. */
  publisher?: string | null;
  journal?: string | null;
  volume?: string | null;
  issue?: string | null;
  pageStart?: string | null;
  pageEnd?: string | null;
  /** Total page count (books). Only emitted when > 1 — "pages = {1}" is noise. */
  pageCount?: number | null;
  isbn?: string | null;
  doi?: string | null;
  url: string;
  language?: string | null;
  keywords?: string[];
  abstract?: string | null;
  /** APA bracket note + BibTeX `type`, e.g. "Thesis" or "Research Report". */
  noteType?: string | null;
  /** Thesis department/faculty — BibTeX `address`. */
  department?: string | null;
  /** Thesis report number, e.g. "Cohort 12" — BibTeX `number`. */
  number?: string | null;
};

// ── Escaping helpers ─────────────────────────────────────────────────────────

/** Collapse a value to one trimmed line (APA and RIS values must not wrap). */
function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * LaTeX-escape a BibTeX field value. Input braces are dropped first — classic
 * BibTeX counts even backslash-escaped braces toward balance, so `\{` could
 * still corrupt the entry. Backslashes are place-held so the replacements
 * (which introduce their own balanced braces) aren't double-escaped.
 */
function escapeBibtex(value: string): string {
  return oneLine(
    value
      .replace(/[{}]/g, "")
      .replace(/\\/g, "\u0000")
      .replace(/([&%$#_])/g, "\\$1")
      .replace(/~/g, "\\textasciitilde{}")
      .replace(/\^/g, "\\textasciicircum{}")
      .replace(/\u0000/g, "\\textbackslash{}"),
  );
}

/** DOIs/URLs are copied verbatim by reference managers — never LaTeX-escape
 *  them, just remove characters that would break the entry itself. */
function verbatimBibtex(value: string): string {
  return value.replace(/[{}\s]/g, "");
}

function pageRangeOf(work: CitationWork): string | null {
  if (work.pageStart && work.pageEnd) return `${work.pageStart}–${work.pageEnd}`;
  return work.pageStart ?? null;
}

function doiOrUrlOf(work: CitationWork): string {
  if (work.doi) {
    return work.doi.startsWith("http") ? work.doi : `https://doi.org/${work.doi}`;
  }
  return work.url;
}

/** A stable, lowercase BibTeX key: firstauthorword + year + firsttitleword.
 *  When neither author nor title survives the alphanumeric strip (e.g. a
 *  fully-Khmer record), falls back to "citation" + year. */
export function bibtexKey(work: CitationWork): string {
  const alnum = (s: string) => s.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  const author = alnum((work.authors[0] ?? "").split(/\s+/)[0] ?? "");
  const title = alnum((work.title || "").split(/\s+/)[0] ?? "");
  if (!author && !title) return `citation${alnum(work.year ?? "")}`;
  return `${author || "work"}${alnum(work.year ?? "") || "nd"}${title || "untitled"}`;
}

// ── 2. The pure formatters ───────────────────────────────────────────────────

export function apa(work: CitationWork): string {
  const authors = work.authors.map(oneLine).filter(Boolean).join(", ") || "Unknown author";
  const year = work.year ?? "n.d.";
  const title = oneLine(work.title) || "Untitled";
  const note = work.noteType ? ` [${oneLine(work.noteType)}]` : "";
  const parts = [`${authors} (${year}). ${title}${note}.`];
  if (work.journal) {
    let venue = oneLine(work.journal);
    if (work.volume) {
      venue += `, ${work.volume}`;
      if (work.issue) venue += `(${work.issue})`;
    }
    const pages = pageRangeOf(work);
    if (pages) venue += `, ${pages}`;
    parts.push(`${venue}.`);
  } else if (work.publisher) {
    parts.push(`${oneLine(work.publisher)}.`);
  }
  parts.push(doiOrUrlOf(work));
  return parts.join(" ");
}

export function bibtex(work: CitationWork): string {
  const entryType =
    work.kind === "book" ? "book" : work.kind === "thesis" ? "techreport" : "article";
  // @article has no publisher field; theses cite their institution instead.
  const publisherField = work.kind === "thesis" ? "institution" : "publisher";

  const fields: Array<[string, string | null | undefined, "escape" | "verbatim"]> = [
    ["author", work.authors.filter(Boolean).join(" and "), "escape"],
    ["title", work.title, "escape"],
    ["journal", work.kind === "article" ? work.journal : null, "escape"],
    ["year", work.year, "escape"],
    ["volume", work.volume, "escape"],
    ["number", work.issue ?? work.number, "escape"],
    [
      "pages",
      pageRangeOf(work) ??
        (work.pageCount && work.pageCount > 1 ? String(work.pageCount) : null),
      "escape",
    ],
    [publisherField, work.kind === "article" ? null : work.publisher, "escape"],
    ["type", work.kind === "thesis" ? work.noteType : null, "escape"],
    ["address", work.kind === "thesis" ? work.department : null, "escape"],
    ["isbn", work.isbn, "escape"],
    ["language", work.language, "escape"],
    ["doi", work.doi, "verbatim"],
    ["url", work.url, "verbatim"],
  ];

  const body = fields
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([k, v, mode]) =>
      `  ${k} = {${mode === "verbatim" ? verbatimBibtex(String(v)) : escapeBibtex(String(v))}}`,
    )
    .join(",\n");

  return `@${entryType}{${bibtexKey(work)},\n${body}\n}`;
}

export function ris(work: CitationWork): string {
  const ty = work.kind === "book" ? "BOOK" : work.kind === "thesis" ? "THES" : "JOUR";
  const lines: Array<[string, string | null | undefined]> = [
    ["TY", ty],
    ["TI", work.title],
    ...work.authors.map((name): [string, string] => ["AU", name]),
    ["PY", work.year],
    ["JO", work.kind === "article" ? work.journal : null],
    ["PB", work.publisher],
    ["VL", work.volume],
    ["IS", work.issue],
    ["SP", work.pageStart],
    ["EP", work.pageEnd],
    ["SN", work.isbn],
    ["LA", work.language],
    ["AB", work.abstract],
    ...(work.keywords ?? []).map((kw): [string, string] => ["KW", kw]),
    ["DO", work.doi],
    ["UR", work.url],
    ["ER", ""],
  ];
  return lines
    .filter(([tag, v]) => tag === "ER" || (v != null && oneLine(String(v)) !== ""))
    .map(([tag, v]) => `${tag}  - ${oneLine(String(v ?? ""))}`)
    .join("\n");
}

/** Filename + mime for downloading a citation file. */
export function citationFileName(
  format: CiteFormat,
  work: CitationWork,
): { name: string; mime: string } {
  const base = bibtexKey(work);
  if (format === "bibtex") return { name: `${base}.bib`, mime: "application/x-bibtex" };
  if (format === "ris") return { name: `${base}.ris`, mime: "application/x-research-info-systems" };
  return { name: `${base}.txt`, mime: "text/plain" };
}

// ── 3. Publication (journal article) helpers ─────────────────────────────────

/** Public-facing link to an article (used inside citations when there is no DOI). */
export function publicationUrl(slug: string): string {
  return `${SITE_URL}/publications/${slug}`;
}

export function citationYear(pub: Publication): string | null {
  const raw = pub.publication_date ?? pub.published_at ?? pub.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : String(d.getFullYear());
}

/** ["Sok San", "Chan Dara"] from authorships or the comma-joined byline. */
export function authorList(pub: Publication): string[] {
  if (pub.authorships?.length) {
    return pub.authorships.map((a) => a.author.full_name).filter(Boolean);
  }
  if (pub.author_names) {
    return pub.author_names.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function pageRange(pub: Publication): string | null {
  if (pub.page_start && pub.page_end) return `${pub.page_start}–${pub.page_end}`;
  if (pub.page_start) return pub.page_start;
  if (pub.article_no) return pub.article_no;
  return null;
}

function doiUrl(pub: Publication): string | null {
  if (!pub.doi) return null;
  return pub.doi.startsWith("http") ? pub.doi : `https://doi.org/${pub.doi}`;
}

function doiOrUrl(pub: Publication): string {
  return doiUrl(pub) ?? publicationUrl(pub.slug);
}

export function publicationToCitationWork(pub: Publication): CitationWork {
  return {
    kind: "article",
    title: (pub.title || "").trim(),
    authors: authorList(pub),
    year: citationYear(pub),
    publisher: pub.publisher,
    journal: pub.journal_name,
    volume: pub.volume,
    issue: pub.issue_no,
    pageStart: pub.page_start ?? pub.article_no,
    pageEnd: pub.page_end,
    isbn: pub.isbn,
    doi: pub.doi,
    url: publicationUrl(pub.slug),
    language: pub.language,
    keywords: pub.keywords ?? [],
    abstract: academicTextToPlainText(pub.abstract, pub.references) || null,
  };
}

/** The header line shown under the title: "Journal 2026, 12 (3), 101–118". */
export function toCitationLine(pub: Publication): string {
  const parts: string[] = [];
  const year = citationYear(pub);
  if (pub.journal_name) {
    parts.push(year ? `${pub.journal_name} ${year}` : pub.journal_name);
  } else if (year) {
    parts.push(year);
  }
  if (pub.volume) {
    parts.push(pub.issue_no ? `${pub.volume} (${pub.issue_no})` : pub.volume);
  }
  const pages = pageRange(pub);
  if (pages) parts.push(pages);
  return parts.join(", ");
}

export function toAPA(pub: Publication): string {
  return apa(publicationToCitationWork(pub));
}

export function toMLA(pub: Publication): string {
  const authors = authorList(pub).join(", ") || "Unknown author";
  const year = citationYear(pub) ?? "n.d.";
  const title = (pub.title || "").trim();
  const segments = [`${authors}. "${title}."`];
  if (pub.journal_name) {
    let venue = pub.journal_name;
    if (pub.volume) venue += `, vol. ${pub.volume}`;
    if (pub.issue_no) venue += `, no. ${pub.issue_no}`;
    venue += `, ${year}`;
    const pages = pageRange(pub);
    if (pages) venue += `, pp. ${pages}`;
    segments.push(`${venue}.`);
  } else {
    segments.push(`${year}.`);
  }
  segments.push(doiOrUrl(pub) + ".");
  return segments.join(" ");
}

export function toChicago(pub: Publication): string {
  const authors = authorList(pub).join(", ") || "Unknown author";
  const year = citationYear(pub) ?? "n.d.";
  const title = (pub.title || "").trim();
  const segments = [`${authors}. ${year}. "${title}."`];
  if (pub.journal_name) {
    let venue = pub.journal_name;
    if (pub.volume) {
      venue += ` ${pub.volume}`;
      if (pub.issue_no) venue += ` (${pub.issue_no})`;
    }
    const pages = pageRange(pub);
    if (pages) venue += `: ${pages}`;
    segments.push(`${venue}.`);
  }
  segments.push(doiOrUrl(pub) + ".");
  return segments.join(" ");
}

export function toIEEE(pub: Publication): string {
  const authors = authorList(pub).join(", ") || "Unknown author";
  const year = citationYear(pub) ?? "n.d.";
  const title = (pub.title || "").trim();
  const segments = [`${authors}, "${title},"`];
  if (pub.journal_name) {
    let venue = pub.journal_name;
    if (pub.volume) venue += `, vol. ${pub.volume}`;
    if (pub.issue_no) venue += `, no. ${pub.issue_no}`;
    const pages = pageRange(pub);
    if (pages) venue += `, pp. ${pages}`;
    venue += `, ${year}`;
    segments.push(`${venue}.`);
  } else {
    segments.push(`${year}.`);
  }
  segments.push(`[Online]. Available: ${doiOrUrl(pub)}`);
  return segments.join(" ");
}

export function toBibTeX(pub: Publication): string {
  return bibtex(publicationToCitationWork(pub));
}

export function toRIS(pub: Publication): string {
  return ris(publicationToCitationWork(pub));
}

export function buildPublicationCitation(format: CiteFormat, pub: Publication): string {
  if (format === "mla") return toMLA(pub);
  if (format === "chicago") return toChicago(pub);
  if (format === "ieee") return toIEEE(pub);
  if (format === "bibtex") return toBibTeX(pub);
  if (format === "ris") return toRIS(pub);
  return toAPA(pub);
}

/** Filename + mime for downloading a citation file. */
export function publicationCitationFile(
  format: CiteFormat,
  pub: Publication,
): { name: string; mime: string } {
  return citationFileName(format, publicationToCitationWork(pub));
}
