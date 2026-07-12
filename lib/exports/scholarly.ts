// Standards-based metadata export formatters (roadmap Task 4). Pure and
// browser-safe: no Supabase, no server-only imports — unit-tested in
// scholarly.test.ts (including DC XML well-formedness via DOMParser and
// Khmer round-trips). The server-only fetch/gating half lives in
// lib/exports/works.ts; the HTTP surface in app/api/export/.
//
// Formats:
//   csl-json — Citation Style Language JSON (citeproc consumers: Zotero,
//              Pandoc, reference managers)
//   dc-json  — Dublin Core terms as a flat JSON object (dc: prefixed keys)
//   dc-xml   — Dublin Core in the oai_dc container schema (the same XML
//              shape our OAI-PMH endpoint emits, reusing the XSD-validated
//              builder conventions from lib/oai/xml.ts)
//   bibtex / ris — delegate to lib/citations (shared with "Cite this")
//
// We deliberately do NOT emit a "DataCite" format: DataCite metadata
// requires registered DOIs and mandatory fields most of the collection
// lacks — claiming compliance without validation would be false. CSL-JSON +
// Dublin Core cover aggregator and reference-manager needs.

import { escapeXml } from "@/lib/oai/xml";
import { bibtex, ris, type CitationWork } from "@/lib/citations";

export const EXPORT_SCHEMA_VERSION = "1.0";

export type ExportFormat = "csl-json" | "dc-json" | "dc-xml" | "bibtex" | "ris";

export const EXPORT_FORMATS: ExportFormat[] = ["csl-json", "dc-json", "dc-xml", "bibtex", "ris"];

export const EXPORT_CONTENT_TYPES: Record<ExportFormat, string> = {
  "csl-json": "application/vnd.citationstyles.csl+json; charset=utf-8",
  "dc-json": "application/json; charset=utf-8",
  "dc-xml": "application/xml; charset=utf-8",
  bibtex: "application/x-bibtex; charset=utf-8",
  ris: "application/x-research-info-systems; charset=utf-8",
};

export type ScholarlyWorkType = "book" | "thesis" | "publication";

/** Neutral export shape every content table is normalised into. */
export interface ScholarlyWork {
  type: ScholarlyWorkType;
  /** Stable public identifier (slug), also the landing-page path segment. */
  slug: string;
  title: string;
  creators: string[];
  /** Advisors and similar secondary contributors. */
  contributors: string[];
  institution: string | null;
  department: string | null;
  program: string | null;
  /** YYYY-MM-DD when known. */
  date: string | null;
  year: string | null;
  language: string | null;
  abstract: string | null;
  keywords: string[];
  /** Landing page — always exported; the authoritative identifier. */
  landingUrl: string;
  /** Access-controlled download proxy URL, when a public file exists. */
  fileUrl: string | null;
  format: string | null;
  doi: string | null;
  isbn: string | null;
  rights: string | null;
  journal: string | null;
  volume: string | null;
  issue: string | null;
  pageStart: string | null;
  pageEnd: string | null;
  /** ISO timestamp of last metadata change (feed consumers' freshness key). */
  modified: string | null;
  /** Librarian verification timestamp — gate for authoritative feeds. */
  verifiedAt: string | null;
}

const CSL_TYPES: Record<ScholarlyWorkType, string> = {
  book: "book",
  thesis: "thesis",
  publication: "article-journal",
};

function dateParts(work: ScholarlyWork): { "date-parts": number[][] } | undefined {
  if (work.date) {
    const [y, m, d] = work.date.split("-").map(Number);
    const parts = [y, m, d].filter((n) => Number.isFinite(n) && n > 0);
    if (parts.length) return { "date-parts": [parts] };
  }
  if (work.year) return { "date-parts": [[Number(work.year)]] };
  return undefined;
}

/** One CSL-JSON item. Names are emitted as `literal` — Khmer names have no
 *  meaningful family/given split, and literal round-trips them unmangled. */
export function toCslJson(work: ScholarlyWork): Record<string, unknown> {
  const item: Record<string, unknown> = {
    id: `${work.type}/${work.slug}`,
    type: CSL_TYPES[work.type],
    title: work.title,
    author: work.creators.map((name) => ({ literal: name })),
    URL: work.landingUrl,
  };
  const issued = dateParts(work);
  if (issued) item.issued = issued;
  if (work.contributors.length) item.contributor = work.contributors.map((name) => ({ literal: name }));
  if (work.abstract) item.abstract = work.abstract;
  if (work.language) item.language = work.language;
  if (work.doi) item.DOI = work.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
  if (work.isbn) item.ISBN = work.isbn;
  if (work.journal) item["container-title"] = work.journal;
  if (work.volume) item.volume = work.volume;
  if (work.issue) item.issue = work.issue;
  if (work.pageStart) item.page = work.pageEnd ? `${work.pageStart}-${work.pageEnd}` : work.pageStart;
  if (work.institution) item.publisher = work.institution;
  if (work.keywords.length) item.keyword = work.keywords.join(", ");
  if (work.type === "thesis") item.genre = "Thesis";
  return item;
}

const DC_TYPES: Record<ScholarlyWorkType, string> = {
  book: "Book",
  thesis: "Thesis",
  publication: "Journal Article",
};

/** Flat Dublin Core terms object (repeatable terms become arrays). */
export function toDublinCoreJson(work: ScholarlyWork): Record<string, unknown> {
  const dc: Record<string, unknown> = {
    "dc:title": work.title,
    "dc:creator": work.creators,
    "dc:type": DC_TYPES[work.type],
    "dc:identifier": [work.landingUrl, work.doi, work.isbn ? `ISBN:${work.isbn}` : null].filter(Boolean),
  };
  if (work.contributors.length) dc["dc:contributor"] = work.contributors;
  if (work.date ?? work.year) dc["dc:date"] = work.date ?? work.year;
  if (work.language) dc["dc:language"] = work.language;
  if (work.abstract) dc["dc:description"] = work.abstract;
  if (work.keywords.length || work.department) {
    dc["dc:subject"] = [...work.keywords, ...(work.department ? [work.department] : [])];
  }
  if (work.institution) dc["dc:publisher"] = work.institution;
  if (work.rights) dc["dc:rights"] = work.rights;
  if (work.format) dc["dc:format"] = work.format;
  if (work.journal) dc["dc:source"] = work.journal;
  if (work.fileUrl) dc["dc:relation"] = work.fileUrl;
  return dc;
}

function dcElement(tag: string, value: string | null | undefined): string {
  const clean = value?.trim();
  return clean ? `<${tag}>${escapeXml(clean)}</${tag}>` : "";
}

/** One record in the oai_dc container schema (same shape our OAI endpoint
 *  serves, so a validating harvester accepts either source identically). */
export function toDublinCoreXml(work: ScholarlyWork): string {
  const dc = toDublinCoreJson(work);
  const elements: string[] = [];
  for (const [key, raw] of Object.entries(dc)) {
    const tag = key.replace("dc:", "dc:");
    const values = Array.isArray(raw) ? raw : [raw];
    for (const v of values) elements.push(dcElement(tag, String(v)));
  }
  return (
    '<oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/oai_dc/ http://www.openarchives.org/OAI/2.0/oai_dc.xsd">' +
    elements.join("") +
    "</oai_dc:dc>"
  );
}

function toCitationWork(work: ScholarlyWork): CitationWork {
  return {
    kind: work.type === "publication" ? "article" : work.type,
    title: work.title,
    authors: work.creators,
    year: work.year,
    publisher: work.institution,
    journal: work.journal,
    volume: work.volume,
    issue: work.issue,
    pageStart: work.pageStart,
    pageEnd: work.pageEnd,
    isbn: work.isbn,
    doi: work.doi,
    url: work.landingUrl,
    language: work.language,
    keywords: work.keywords,
    abstract: work.abstract,
    noteType: work.type === "thesis" ? "Thesis" : null,
    department: work.department,
  };
}

export function toBibtex(work: ScholarlyWork): string {
  return bibtex(toCitationWork(work));
}

export function toRis(work: ScholarlyWork): string {
  return ris(toCitationWork(work));
}

// ── Feed envelopes ───────────────────────────────────────────────────────

export interface FeedMeta {
  type: ScholarlyWorkType;
  page: number;
  pageSize: number;
  total: number;
  generatedAt: string;
}

/** JSON feed envelope shared by csl-json and dc-json bulk exports. */
export function buildJsonFeed(
  works: ScholarlyWork[],
  meta: FeedMeta,
  format: "csl-json" | "dc-json",
): string {
  const items = works.map((w) => (format === "csl-json" ? toCslJson(w) : toDublinCoreJson(w)));
  return JSON.stringify(
    {
      schemaVersion: EXPORT_SCHEMA_VERSION,
      format,
      resourceType: meta.type,
      generatedAt: meta.generatedAt,
      page: meta.page,
      pageSize: meta.pageSize,
      total: meta.total,
      hasMore: meta.page * meta.pageSize < meta.total,
      items,
    },
    null,
    2,
  );
}

export function buildDcXmlFeed(works: ScholarlyWork[], meta: FeedMeta): string {
  const records = works
    .map((w) => `<record><identifier>${escapeXml(w.landingUrl)}</identifier>${toDublinCoreXml(w)}</record>`)
    .join("");
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<export schemaVersion="${EXPORT_SCHEMA_VERSION}" resourceType="${meta.type}" ` +
    `generatedAt="${escapeXml(meta.generatedAt)}" page="${meta.page}" pageSize="${meta.pageSize}" total="${meta.total}">` +
    records +
    "</export>"
  );
}

export function buildTextFeed(works: ScholarlyWork[], format: "bibtex" | "ris"): string {
  const body = works.map((w) => (format === "bibtex" ? toBibtex(w) : toRis(w)));
  return body.join("\n\n") + "\n";
}

export function parseExportFormat(raw: string | null): ExportFormat | null {
  if (!raw) return "csl-json";
  return EXPORT_FORMATS.includes(raw as ExportFormat) ? (raw as ExportFormat) : null;
}
