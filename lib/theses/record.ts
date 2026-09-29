// lib/theses/record.ts
//
// The thesis record page's view model, built once from the row.
//
// The page used to derive its labels in five places — the route, the hero, two
// metadata components and the download button — and three of them disagreed:
// the published date was printed three times, the language three times,
// verification and the DOI twice each, and a department fallback printed the
// faculty CODE beside the faculty's name. Here every fact is placed exactly
// once and every label is resolved in one pure function, so the rules are
// unit-testable offline and the components only render.
//
// Where each fact lives on the page:
//   title page   type · degree, title, Khmer title, lead, authors, advisors,
//                institution · faculty · cohort · academic year, rank
//   facts grid   published, defended, submitted, language, department,
//                licence, DOI
//   record card  verification, views, downloads
//
// Pure and server-safe: translations come in as functions, the download
// engine's decision comes in as data, and nothing here reads a database.

import {
  formatPublicationDate,
  getCoAdvisor,
  getDefenseDate,
  getDoi,
  getKeywords,
  getLanguageKey,
  getReferences,
  getSubmittedDate,
  getThesisTypeKey,
  type ResearchReport,
} from "@/lib/theses/report-fields";
import { thesisLicense } from "@/lib/theses/license";
import { sanitizeContents, type ContentsEntry } from "@/lib/theses/contents";
import { resolveThesisAccess, TOP_N_PROTECTED, type ThesisAccess } from "@/lib/theses/access";
import { buildCitation, citationFile, type CiteFormat } from "@/lib/theses/citation";
import type { ThesisDownloadDecision } from "@/lib/theses/download-permission";
import { scriptOf } from "@/lib/theses/script";

export { scriptOf };

export type RecordLocale = "en" | "km";

/** A bound translator — next-intl's `t` for one namespace, or a test fake. */
export type Translate = (key: string, values?: Record<string, string | number>) => string;

/** A program or faculty row, as the taxonomy tables hold it. */
export interface TaxonomyRow {
  code: string;
  program_code?: string | null;
  name_en?: string | null;
  name_km?: string | null;
}

export type FactId = "published" | "defended" | "submitted" | "language" | "department" | "licence" | "doi";

export interface Fact {
  id: FactId;
  label: string;
  value: string;
  /** Present when the value is a link (licence deed, DOI resolver). */
  href?: string;
  /** Set in the mono face — an identifier, not prose. */
  mono?: boolean;
}

export type SectionId = "abstract" | "contents" | "full-text" | "references";

export interface RecordSection {
  id: SectionId;
  label: string;
  count?: number;
}

export interface CitationEntry {
  format: CiteFormat;
  /** "APA", "BibTeX" — format names, the same in both locales. */
  label: string;
  text: string;
  /** BibTeX and RIS are code for a reference manager; the rest are prose. */
  code: boolean;
  file: { name: string; mime: string };
}

export interface ThesisRecord {
  id: string;
  slug: string;
  /** This record's path in the page's locale — sign-in and profile return here. */
  path: string;
  /** The canonical, shareable URL. */
  permalink: string;

  title: { text: string; lang: RecordLocale };
  /** The parallel Khmer title (0160), or null when absent or a repeat. */
  titleKm: string | null;
  typeLabel: string;
  /** The program the degree was earned in, in the page's language. */
  degree: string | null;
  /** The download rank, only while it is inside the protected Top N. */
  rank: number | null;
  lead: string | null;

  abstract: string;
  abstractKm: string | null;
  keywords: string[];

  authors: string[];
  advisor: string | null;
  coAdvisor: string | null;
  institution: {
    name: string;
    faculty: string | null;
    cohort: string | null;
    academicYear: string | null;
  };

  facts: Fact[];
  contents: ContentsEntry[];
  references: string[];

  hasFile: boolean;
  /** Access for an anonymous reader. The viewer's half is resolved in the
   *  browser against /api/theses/[id]/download-status, so this page's HTML is
   *  the same for everyone and can be shared-cached. */
  access: ThesisAccess;

  verifiedAt: string | null;
  metrics: { views: number; downloads: number };
  sections: RecordSection[];
  /** Every format, rendered on the server. The browser receives these
   *  strings — never the row, whose `file_url` is a storage address. */
  citations: CitationEntry[];

  /** Where a reader asks the library for the full text. */
  contactHref: string;
  /** Where a reader reports a wrong detail. */
  reportHref: string;
  signInHref: string;
}

/** Why a related thesis is offered — each a relation the card states. */
export type RelatedReason = "advisor" | "cohort" | "faculty";

export interface RelatedThesis {
  slug: string;
  title: string;
  byline: string | null;
  academicYear: string | null;
  reason: RelatedReason;
}

export interface ThesisRecordInput {
  row: ResearchReport;
  locale: RecordLocale;
  /** Display authors: the canonical graph when it has credits, else the
   *  legacy byline as stored. */
  authors: string[];
  /** The canonical graph's authors, when it has any. They replace the legacy
   *  byline in the citations; empty leaves the row's own byline in place. */
  canonicalAuthors: string[];
  programs: TaxonomyRow[] | null;
  faculties: TaxonomyRow[] | null;
  /** The download engine's decision for an ANONYMOUS reader. */
  decision: Pick<ThesisDownloadDecision, "reason" | "effectivePolicy" | "rank">;
  /** The published institution name (getOrgIdentity). */
  institution: string;
  siteUrl: string;
  /** `thesisDetail` messages. */
  t: Translate;
  /** `trust` messages — the licence names. */
  tTrust: Translate;
}

const LEAD_MAX = 240;

/**
 * The title page's one-line lead: the librarian's SEO description when there
 * is one, otherwise the abstract's first sentence. Cut on a word boundary —
 * a space, or U+200B between Khmer words — never mid-word.
 */
export function leadFrom(seoDescription: unknown, abstract: unknown): string | null {
  const seo = typeof seoDescription === "string" ? seoDescription.replace(/\s+/g, " ").trim() : "";
  const text = typeof abstract === "string" ? abstract.replace(/\s+/g, " ").trim() : "";
  const source = seo || text.split(/(?<=[.!?។])\s/)[0] || "";
  if (!source) return null;
  if (source.length <= LEAD_MAX) return source;
  const cut = source.slice(0, LEAD_MAX);
  const boundary = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf("​"));
  return `${(boundary > LEAD_MAX / 2 ? cut.slice(0, boundary) : cut).replace(/[\s,;:–—-]+$/, "")}…`;
}

const trimmed = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

function localName(row: TaxonomyRow | undefined, locale: RecordLocale): string | null {
  if (!row) return null;
  const en = trimmed(row.name_en);
  return locale === "km" ? trimmed(row.name_km) ?? en : en;
}

function doiHref(doi: string): string {
  return doi.startsWith("http") ? doi : `https://doi.org/${doi}`;
}

const FORMATS: ReadonlyArray<{ format: CiteFormat; label: string; code: boolean }> = [
  { format: "apa", label: "APA", code: false },
  { format: "mla", label: "MLA", code: false },
  { format: "chicago", label: "Chicago", code: false },
  { format: "ieee", label: "IEEE", code: false },
  { format: "bibtex", label: "BibTeX", code: true },
  { format: "ris", label: "RIS", code: true },
];

export function buildThesisRecord(input: ThesisRecordInput): ThesisRecord {
  const { row, locale, t, tTrust } = input;
  const id = String(row.id);
  const slug = String(row.slug ?? row.id);
  const localePrefix = locale === "km" ? "/km" : "";
  const path = `${localePrefix}/theses/${slug}`;
  const title = String(row.title ?? "").trim();

  // ── Title page ──────────────────────────────────────────────────────────
  const titleKmRaw = trimmed(row.title_km);
  const titleKm = titleKmRaw && titleKmRaw !== title ? titleKmRaw : null;

  const program = input.programs?.find((p) => p.code === row.program);
  const degree = localName(program, locale) ?? trimmed(row.program);
  const faculty = localName(
    input.faculties?.find((f) => f.program_code === row.program && f.code === row.faculty),
    locale,
  );

  const hasFile = Boolean(row.file_url);
  const access = resolveThesisAccess({ decision: input.decision, hasFile, authenticated: false });
  const rank = access.rank != null && access.rank <= TOP_N_PROTECTED ? access.rank : null;

  const cohort = row.cohort ? t("cohortNumber", { number: String(row.cohort) }) : null;

  // ── Facts grid: what the title page does not already say ────────────────
  const languageKey = getLanguageKey(row);
  const licence = thesisLicense(row.license);
  const doi = getDoi(row);
  // Department only from its own table, and only when it is not the faculty
  // under another name. The old fallback printed the faculty CODE here.
  const departmentRaw = trimmed(row.departments?.name);
  const department =
    departmentRaw &&
    !(faculty && (faculty.toLowerCase() === departmentRaw.toLowerCase() ||
      faculty.toLowerCase().startsWith(departmentRaw.toLowerCase())))
      ? departmentRaw
      : null;

  const candidates: Array<Fact | null> = [
    fact("published", t("factPublished"), formatPublicationDate(row, locale)),
    fact("defended", t("factDefended"), getDefenseDate(row, locale)),
    fact("submitted", t("factSubmitted"), getSubmittedDate(row, locale)),
    fact("language", t("factLanguage"), languageKey ? t(`language.${languageKey}`) : null),
    fact("department", t("factDepartment"), department),
    licence
      ? { id: "licence", label: t("factLicence"), value: tTrust(`license.${licence.code}`), ...(licence.url ? { href: licence.url } : {}) }
      : null,
    doi
      ? { id: "doi", label: t("factDoi"), value: doi.replace(/^https?:\/\/doi\.org\//, ""), href: doiHref(doi), mono: true }
      : null,
  ];
  const facts = candidates.filter((f): f is Fact => f != null);

  // ── Reading card ────────────────────────────────────────────────────────
  const abstract = String(row.abstract ?? "");
  const abstractKm = trimmed(row.abstract_km);
  const keywords = getKeywords(row);
  const contents = sanitizeContents(row.table_of_contents) ?? [];
  const references = getReferences(row);

  // A section is listed only when it has something to show. The full text is
  // offered wherever a reader COULD be served it; a protected record and a
  // record with no PDF say why in the access panel instead of in an empty slot.
  const readable = hasFile && access.state !== "protected" && access.state !== "unavailable";
  const sections: RecordSection[] = [
    ...(abstract.trim() || abstractKm || keywords.length > 0
      ? [{ id: "abstract" as const, label: t("sectionAbstract") }]
      : []),
    ...(contents.length > 0
      ? [{ id: "contents" as const, label: t("sectionContents"), count: contents.length }]
      : []),
    ...(readable ? [{ id: "full-text" as const, label: t("sectionFullText") }] : []),
    ...(references.length > 0
      ? [{ id: "references" as const, label: t("sectionReferences"), count: references.length }]
      : []),
  ];

  // ── Citations, rendered here so the row never reaches the browser ───────
  const citationRow =
    input.canonicalAuthors.length > 0 ? { ...row, author_names: input.canonicalAuthors.join(", ") } : row;
  const citations: CitationEntry[] = FORMATS.map(({ format, label, code }) => ({
    format,
    label,
    code,
    text: buildCitation(format, citationRow, slug, input.institution),
    file: citationFile(format, citationRow),
  }));

  const contactHref = `${localePrefix}/contact?${new URLSearchParams({
    subject: `Thesis full-text access: ${title}`.slice(0, 200),
    category: "other",
  }).toString()}`;
  const reportHref = `${localePrefix}/contact?${new URLSearchParams({
    subject: `Incorrect record details: ${title || slug}`.slice(0, 200),
    category: "other",
  }).toString()}`;

  return {
    id,
    slug,
    path,
    permalink: `${input.siteUrl.replace(/\/$/, "")}/theses/${slug}`,
    title: { text: title, lang: scriptOf(title) },
    titleKm,
    typeLabel: t(`type.${getThesisTypeKey(row)}`),
    degree,
    rank,
    lead: leadFrom(row.seo_description, abstract),
    abstract,
    abstractKm,
    keywords,
    authors: input.authors,
    advisor: trimmed(row.advisor_name),
    coAdvisor: trimmed(getCoAdvisor(row)),
    institution: {
      name: input.institution,
      faculty,
      cohort,
      academicYear: trimmed(row.academic_year),
    },
    facts,
    contents,
    references,
    hasFile,
    access,
    verifiedAt: trimmed(row.verified_at),
    // The number shown is the number stored — the old page added one for the
    // view in progress, so the figure changed between two identical loads.
    metrics: { views: Number(row.view_count) || 0, downloads: Number(row.download_count) || 0 },
    sections,
    citations,
    contactHref,
    reportHref,
    signInHref: `/auth/login?callbackUrl=${encodeURIComponent(path)}`,
  };
}

function fact(id: FactId, label: string, value: string | null | undefined): Fact | null {
  return value ? { id, label, value } : null;
}
