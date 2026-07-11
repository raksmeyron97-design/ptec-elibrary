/**
 * Pure helpers for structured publication references and administrator review
 * workflows. This module deliberately performs no network or storage I/O.
 */

export const MAX_REFERENCE_FIELD_CHARS = 2_000;
export const MAX_REFERENCE_ENTRY_CHARS = 5_000;
export const MAX_PASTED_REFERENCE_LIST_CHARS = 100_000;
export const MAX_PARSED_REFERENCE_ENTRIES = 100;
export const MAX_REFERENCE_AUTHORS = 50;
export const MAX_DUPLICATE_COMPARISONS = 500;
export const MAX_WORD_COUNT_CHARS = 200_000;

export type ReferenceType =
  | "journal-article"
  | "book"
  | "book-chapter"
  | "thesis-dissertation"
  | "conference-paper"
  | "website"
  | "other";

export interface PersonReferenceAuthor {
  given?: string;
  family?: string;
  literal?: string;
  orcid?: string;
}

export type ReferenceAuthor = string | PersonReferenceAuthor;

export interface StructuredReferenceBase {
  type: ReferenceType;
  authors?: ReferenceAuthor[];
  organization?: string;
  title?: string;
  containerTitle?: string;
  year?: number | string;
  volume?: string;
  issue?: string;
  pageStart?: string;
  pageEnd?: string;
  articleNumber?: string;
  publisher?: string;
  edition?: string;
  doi?: string;
  url?: string;
  /** Original imported text is retained even when heuristics are uncertain. */
  originalText?: string;
  /** Explicit administrator-authored citation that takes precedence in output. */
  formattedCitationOverride?: string;
}

export interface JournalArticleReferenceMetadata extends StructuredReferenceBase {
  type: "journal-article";
}

export interface BookReferenceMetadata extends StructuredReferenceBase {
  type: "book";
}

export interface BookChapterReferenceMetadata extends StructuredReferenceBase {
  type: "book-chapter";
}

export interface ThesisDissertationReferenceMetadata extends StructuredReferenceBase {
  type: "thesis-dissertation";
  thesisKind?: "thesis" | "dissertation";
  institution?: string;
}

export interface ConferencePaperReferenceMetadata extends StructuredReferenceBase {
  type: "conference-paper";
  conferenceName?: string;
}

export interface WebsiteReferenceMetadata extends StructuredReferenceBase {
  type: "website";
  websiteName?: string;
  accessedDate?: string;
}

export interface OtherReferenceMetadata extends StructuredReferenceBase {
  type: "other";
}

export type StructuredReferenceMetadata =
  | JournalArticleReferenceMetadata
  | BookReferenceMetadata
  | BookChapterReferenceMetadata
  | ThesisDissertationReferenceMetadata
  | ConferencePaperReferenceMetadata
  | WebsiteReferenceMetadata
  | OtherReferenceMetadata;

export type ParseConfidence = "high" | "medium" | "low";
export type ParsedReferenceField = "author" | "title" | "year" | "doi" | "url";

export interface ReferenceReviewCandidate {
  originalInput: string;
  metadata: StructuredReferenceMetadata;
  confidence: ParseConfidence;
  /** A stable 0..1 score intended for review ordering, not publication gating. */
  confidenceScore: number;
  fieldConfidence: Partial<Record<ParsedReferenceField, ParseConfidence>>;
  warnings: string[];
}

export interface ReferenceListParseResult {
  candidates: ReferenceReviewCandidate[];
  truncated: boolean;
  ignoredEntryCount: number;
}

export interface ReferenceCardSummary {
  firstAuthor: string;
  year: string;
  title: string;
  shortCitation: string;
}

export interface ExistingReferenceLike {
  id?: string;
  type?: ReferenceType;
  authors?: ReferenceAuthor[];
  organization?: string;
  title?: string;
  year?: number | string;
  doi?: string;
  url?: string;
  text?: string;
  originalText?: string;
  formattedCitationOverride?: string;
}

export type DuplicateReason = "doi" | "url" | "formatted-text" | "title-year" | "title";

export interface LikelyDuplicateMatch {
  existingIndex: number;
  existingId?: string;
  reason: DuplicateReason;
  confidence: number;
}

export interface CandidateDuplicateResult {
  candidateIndex: number;
  matches: LikelyDuplicateMatch[];
}

export interface KhmerLanguageMismatchWarning {
  code: "likely-latin-content";
  severity: "warning";
  message: string;
  latinRatio: number;
  khmerRatio: number;
  letterCount: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedString(value: unknown, max = MAX_REFERENCE_FIELD_CHARS): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, max) : undefined;
}

function firstText(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = boundedString(item);
      if (text) return text;
    }
    return undefined;
  }
  return boundedString(value);
}

function cleanTrailingPunctuation(value: string): string {
  let result = value.trim().replace(/[.,;:]+$/g, "");
  while (result.endsWith(")")) {
    const opens = (result.match(/\(/g) ?? []).length;
    const closes = (result.match(/\)/g) ?? []).length;
    if (closes <= opens) break;
    result = result.slice(0, -1);
  }
  return result;
}

export function normalizeReferenceDoi(value: unknown): string | undefined {
  const raw = boundedString(value);
  if (!raw) return undefined;
  const normalized = cleanTrailingPunctuation(
    raw
      .replace(/^doi\s*:\s*/i, "")
      .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, ""),
  );
  return /^10\.\d{4,9}\/\S+$/i.test(normalized) && !/\s/.test(normalized)
    ? normalized
    : undefined;
}

export function normalizeReferenceHttpUrl(value: unknown): string | undefined {
  const raw = boundedString(value);
  if (!raw) return undefined;
  try {
    const parsed = new URL(cleanTrailingPunctuation(raw));
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function yearText(value: unknown): string | undefined {
  const raw = typeof value === "number" ? String(Math.trunc(value)) : boundedString(value, 20);
  if (!raw) return undefined;
  const match = raw.match(/\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/);
  return match?.[1];
}

function formatAuthor(author: ReferenceAuthor): string {
  if (typeof author === "string") return boundedString(author, 300) ?? "";
  const literal = boundedString(author.literal, 300);
  if (literal) return literal;
  const given = boundedString(author.given, 150);
  const family = boundedString(author.family, 150);
  if (family && given) return `${family}, ${given}`;
  return family ?? given ?? "";
}

function authorList(reference: StructuredReferenceMetadata): string[] {
  return (reference.authors ?? [])
    .slice(0, MAX_REFERENCE_AUTHORS)
    .map(formatAuthor)
    .filter(Boolean);
}

function readableAuthorList(reference: StructuredReferenceMetadata): string {
  const authors = authorList(reference);
  if (authors.length === 0) return boundedString(reference.organization, 300) ?? "";
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return `${authors[0]} & ${authors[1]}`;
  if (authors.length > 10) return `${authors.slice(0, 10).join(", ")}, et al.`;
  return `${authors.slice(0, -1).join(", ")}, & ${authors.at(-1)}`;
}

function withoutEndingPunctuation(value: string): string {
  return value.trim().replace(/[.!?;,]+$/g, "");
}

function sentence(value: string | undefined): string | null {
  const text = boundedString(value);
  return text ? `${withoutEndingPunctuation(text)}.` : null;
}

function pageLabel(reference: StructuredReferenceMetadata): string | null {
  const start = boundedString(reference.pageStart, 80);
  const end = boundedString(reference.pageEnd, 80);
  if (start && end) return `${start}–${end}`;
  return start ?? end ?? boundedString(reference.articleNumber, 80) ?? null;
}

/** Produce a readable, deterministic citation without claiming a strict style. */
export function formatReadableReference(reference: StructuredReferenceMetadata): string {
  const override = boundedString(reference.formattedCitationOverride, MAX_REFERENCE_ENTRY_CHARS);
  if (override) return override;

  const parts: string[] = [];
  const creators = readableAuthorList(reference);
  if (creators) parts.push(sentence(creators)!);
  const year = yearText(reference.year);
  if (year) parts.push(`(${year}).`);

  const title = sentence(reference.title);
  if (title) parts.push(title);

  const container = boundedString(reference.containerTitle);
  const volume = boundedString(reference.volume, 80);
  const issue = boundedString(reference.issue, 80);
  const pages = pageLabel(reference);

  switch (reference.type) {
    case "journal-article": {
      let journal = container ?? "";
      if (volume) journal += `${journal ? ", " : ""}${volume}${issue ? `(${issue})` : ""}`;
      else if (issue) journal += `${journal ? ", " : ""}(${issue})`;
      if (pages) journal += `${journal ? ", " : ""}${pages}`;
      const value = sentence(journal);
      if (value) parts.push(value);
      break;
    }
    case "book": {
      const edition = boundedString(reference.edition, 100);
      if (edition) parts.push(`(${withoutEndingPunctuation(edition)}).`);
      const publisher = sentence(reference.publisher);
      if (publisher) parts.push(publisher);
      break;
    }
    case "book-chapter": {
      let book = container ? `In ${withoutEndingPunctuation(container)}` : "";
      if (pages) book += `${book ? " " : ""}(pp. ${pages})`;
      const bookSentence = sentence(book);
      if (bookSentence) parts.push(bookSentence);
      const publisher = sentence(reference.publisher);
      if (publisher) parts.push(publisher);
      break;
    }
    case "thesis-dissertation": {
      const thesis = reference as ThesisDissertationReferenceMetadata;
      const label = thesis.thesisKind === "dissertation" ? "Dissertation" : "Thesis";
      const institution = boundedString(thesis.institution) ?? boundedString(reference.publisher);
      parts.push(institution ? `[${label}, ${withoutEndingPunctuation(institution)}].` : `[${label}].`);
      break;
    }
    case "conference-paper": {
      const conference = reference as ConferencePaperReferenceMetadata;
      const venue = boundedString(conference.conferenceName) ?? container;
      if (venue) parts.push(`In ${withoutEndingPunctuation(venue)}${pages ? ` (pp. ${pages})` : ""}.`);
      const publisher = sentence(reference.publisher);
      if (publisher) parts.push(publisher);
      break;
    }
    case "website": {
      const website = reference as WebsiteReferenceMetadata;
      const siteName = sentence(website.websiteName ?? reference.publisher);
      if (siteName) parts.push(siteName);
      if (website.accessedDate) parts.push(`Accessed ${withoutEndingPunctuation(website.accessedDate)}.`);
      break;
    }
    case "other": {
      const otherContainer = sentence(container);
      if (otherContainer) parts.push(otherContainer);
      const publisher = sentence(reference.publisher);
      if (publisher) parts.push(publisher);
      break;
    }
  }

  const doi = normalizeReferenceDoi(reference.doi);
  const url = normalizeReferenceHttpUrl(reference.url);
  if (doi) parts.push(`https://doi.org/${doi}`);
  else if (url) parts.push(url);

  const formatted = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return formatted || boundedString(reference.originalText, MAX_REFERENCE_ENTRY_CHARS) || "Untitled reference";
}

function compactFirstAuthor(reference: StructuredReferenceMetadata): string {
  const first = reference.authors?.[0];
  if (!first) return boundedString(reference.organization, 200) ?? "Unknown author";
  if (typeof first !== "string") {
    return (
      boundedString(first.family, 150) ??
      boundedString(first.literal, 200) ??
      (formatAuthor(first) || "Unknown author")
    );
  }
  const value = boundedString(first, 200) ?? "Unknown author";
  if (value.includes(",")) return value.split(",", 1)[0].trim();
  // Keep non-Latin personal and organization names intact. Latin personal
  // names conventionally use the final token as the compact family name.
  if (/\p{Script=Latin}/u.test(value) && !reference.organization) {
    return value.split(/\s+/).at(-1)?.replace(/[.,]+$/g, "") || value;
  }
  return value;
}

function compactTitle(reference: StructuredReferenceMetadata): string {
  const raw =
    boundedString(reference.title, 500) ??
    boundedString(reference.originalText, 500) ??
    boundedString(reference.formattedCitationOverride, 500) ??
    "Untitled reference";
  return raw.length <= 140 ? raw : `${raw.slice(0, 137).trimEnd()}…`;
}

export function summarizeReference(reference: StructuredReferenceMetadata): ReferenceCardSummary {
  const firstAuthor = compactFirstAuthor(reference);
  const year = yearText(reference.year) ?? "n.d.";
  const title = compactTitle(reference);
  const multipleAuthors = (reference.authors?.filter((author) => formatAuthor(author)).length ?? 0) > 1;
  return {
    firstAuthor,
    year,
    title,
    shortCitation: `${firstAuthor}${multipleAuthors ? " et al." : ""} (${year})`,
  };
}

const REFERENCE_TYPES: readonly ReferenceType[] = [
  "journal-article",
  "book",
  "book-chapter",
  "thesis-dissertation",
  "conference-paper",
  "website",
  "other",
];

function sanitizedAuthors(value: unknown): ReferenceAuthor[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_REFERENCE_AUTHORS).flatMap<ReferenceAuthor>((entry) => {
    if (typeof entry === "string") {
      const literal = boundedString(entry, 300);
      return literal ? [literal] : [];
    }
    const person = asRecord(entry);
    if (!person) return [];
    const mapped: PersonReferenceAuthor = {
      ...(boundedString(person.given, 150) ? { given: boundedString(person.given, 150) } : {}),
      ...(boundedString(person.family, 150) ? { family: boundedString(person.family, 150) } : {}),
      ...(boundedString(person.literal, 300) ? { literal: boundedString(person.literal, 300) } : {}),
      ...(boundedString(person.orcid, 100) ? { orcid: boundedString(person.orcid, 100) } : {}),
    };
    return mapped.given || mapped.family || mapped.literal ? [mapped] : [];
  });
}

/**
 * Bound-validate unknown/stored JSON into structured reference metadata.
 * Unknown keys are dropped; unusable payloads become `undefined` so callers
 * can fall back to the formatted reference text.
 */
export function sanitizeStructuredReferenceMetadata(
  value: unknown,
): StructuredReferenceMetadata | undefined {
  const record = asRecord(value);
  if (!record) return undefined;

  const rawType = boundedString(record.type, 40);
  const type: ReferenceType = REFERENCE_TYPES.includes(rawType as ReferenceType)
    ? (rawType as ReferenceType)
    : "other";
  const authors = sanitizedAuthors(record.authors);
  const year =
    typeof record.year === "number" && Number.isFinite(record.year)
      ? Math.trunc(record.year)
      : boundedString(record.year, 20);

  const base: StructuredReferenceBase = {
    type,
    ...(authors.length > 0 ? { authors } : {}),
    ...(boundedString(record.organization, 300) ? { organization: boundedString(record.organization, 300) } : {}),
    ...(boundedString(record.title, 1_000) ? { title: boundedString(record.title, 1_000) } : {}),
    ...(boundedString(record.containerTitle, 500) ? { containerTitle: boundedString(record.containerTitle, 500) } : {}),
    ...(year ? { year } : {}),
    ...(boundedString(record.volume, 80) ? { volume: boundedString(record.volume, 80) } : {}),
    ...(boundedString(record.issue, 80) ? { issue: boundedString(record.issue, 80) } : {}),
    ...(boundedString(record.pageStart, 80) ? { pageStart: boundedString(record.pageStart, 80) } : {}),
    ...(boundedString(record.pageEnd, 80) ? { pageEnd: boundedString(record.pageEnd, 80) } : {}),
    ...(boundedString(record.articleNumber, 80) ? { articleNumber: boundedString(record.articleNumber, 80) } : {}),
    ...(boundedString(record.publisher, 300) ? { publisher: boundedString(record.publisher, 300) } : {}),
    ...(boundedString(record.edition, 100) ? { edition: boundedString(record.edition, 100) } : {}),
    ...(normalizeReferenceDoi(record.doi) ? { doi: normalizeReferenceDoi(record.doi) } : {}),
    ...(normalizeReferenceHttpUrl(record.url) ? { url: normalizeReferenceHttpUrl(record.url) } : {}),
    ...(typeof record.originalText === "string" && record.originalText.trim()
      ? { originalText: record.originalText.trim().slice(0, MAX_REFERENCE_ENTRY_CHARS) }
      : {}),
    ...(typeof record.formattedCitationOverride === "string" && record.formattedCitationOverride.trim()
      ? {
          formattedCitationOverride: record.formattedCitationOverride
            .trim()
            .slice(0, MAX_REFERENCE_ENTRY_CHARS),
        }
      : {}),
  };

  if (type === "thesis-dissertation") {
    return {
      ...base,
      type,
      ...(record.thesisKind === "dissertation" || record.thesisKind === "thesis"
        ? { thesisKind: record.thesisKind }
        : {}),
      ...(boundedString(record.institution, 300) ? { institution: boundedString(record.institution, 300) } : {}),
    };
  }
  if (type === "conference-paper") {
    return {
      ...base,
      type,
      ...(boundedString(record.conferenceName, 300)
        ? { conferenceName: boundedString(record.conferenceName, 300) }
        : {}),
    };
  }
  if (type === "website") {
    return {
      ...base,
      type,
      ...(boundedString(record.websiteName, 300) ? { websiteName: boundedString(record.websiteName, 300) } : {}),
      ...(boundedString(record.accessedDate, 60) ? { accessedDate: boundedString(record.accessedDate, 60) } : {}),
    };
  }
  return base as StructuredReferenceMetadata;
}

/** True when the metadata carries anything beyond its type discriminator. */
export function hasStructuredReferenceContent(
  metadata: StructuredReferenceMetadata | undefined,
): boolean {
  if (!metadata) return false;
  return Object.entries(metadata).some(
    ([key, value]) =>
      key !== "type" &&
      value !== undefined &&
      (typeof value !== "string" || value.trim() !== "") &&
      (!Array.isArray(value) || value.length > 0),
  );
}

const DOI_IN_TEXT_RE = /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i;
const URL_IN_TEXT_RE = /https?:\/\/[^\s<>"']+/i;
const YEAR_IN_TEXT_RE = /\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/;

function extractDoi(text: string): string | undefined {
  return normalizeReferenceDoi(text.match(DOI_IN_TEXT_RE)?.[0]);
}

function extractUrl(text: string): string | undefined {
  return normalizeReferenceHttpUrl(text.match(URL_IN_TEXT_RE)?.[0]);
}

function extractYear(text: string): string | undefined {
  return text.match(YEAR_IN_TEXT_RE)?.[1];
}

function removeListMarker(text: string): string {
  return text.replace(/^\s*(?:\[\d+\]|\(\d+\)|\d+[.)])\s*/, "").trim();
}

function inferAuthor(text: string, year: string | undefined): string | undefined {
  if (!year) return undefined;
  const beforeYear = removeListMarker(text).slice(0, text.indexOf(year));
  const author = boundedString(beforeYear.replace(/[([\s.,;:]+$/g, ""), 300);
  return author && /\p{L}/u.test(author) ? author : undefined;
}

function inferTitle(text: string, year?: string, doi?: string, url?: string): string | undefined {
  let cleaned = removeListMarker(text);
  if (doi) cleaned = cleaned.replace(new RegExp(doi.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ");
  if (url) cleaned = cleaned.replace(url, " ");
  cleaned = cleaned.replace(URL_IN_TEXT_RE, " ").replace(/\bdoi\s*:\s*/gi, " ");

  const afterYear = year ? cleaned.slice(cleaned.indexOf(year) + year.length) : cleaned;
  const candidates = afterYear
    .replace(/^[\s)\].,;:-]+/, "")
    .split(/\.\s+|;\s+/)
    .map((part) => boundedString(part, 500))
    .filter((part): part is string => !!part && /\p{L}/u.test(part));
  if (candidates[0] && candidates[0].length >= 4) return candidates[0];

  const fallback = cleaned
    .split(/\.\s+|;\s+/)
    .map((part) => boundedString(part, 500))
    .filter((part): part is string => !!part && /\p{L}/u.test(part))
    .sort((a, b) => b.length - a.length)[0];
  return fallback;
}

function splitReferenceEntries(input: string): string[] {
  const normalized = input.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];
  const blocks = normalized.split(/\n\s*\n+/).map((block) => block.trim()).filter(Boolean);
  if (blocks.length > 1) return blocks;

  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) return lines;

  const numbered = lines.some((line) => /^(?:\[\d+\]|\(\d+\)|\d+[.)])\s+/.test(line));
  if (!numbered) return lines;

  const entries: string[] = [];
  let current = "";
  for (const line of lines) {
    if (/^(?:\[\d+\]|\(\d+\)|\d+[.)])\s+/.test(line) && current) {
      entries.push(current);
      current = line;
    } else {
      current = current ? `${current} ${line}` : line;
    }
  }
  if (current) entries.push(current);
  return entries;
}

function confidenceFromScore(score: number): ParseConfidence {
  if (score >= 0.75) return "high";
  if (score >= 0.45) return "medium";
  return "low";
}

function reviewCandidate(original: string): ReferenceReviewCandidate {
  const originalInput = original.trim().slice(0, MAX_REFERENCE_ENTRY_CHARS);
  const doi = extractDoi(originalInput);
  const url = extractUrl(originalInput);
  const year = extractYear(originalInput);
  const title = inferTitle(originalInput, year, doi, url);
  const author = inferAuthor(originalInput, year);
  const type: ReferenceType = doi ? "journal-article" : url ? "website" : "other";
  const metadata: StructuredReferenceMetadata = {
    type,
    ...(author ? { authors: [author] } : {}),
    ...(title ? { title } : {}),
    ...(year ? { year } : {}),
    ...(doi ? { doi } : {}),
    ...(url ? { url } : {}),
    originalText: originalInput,
  };

  let score = 0.05;
  if (author) score += 0.1;
  if (title) score += 0.3;
  if (year) score += 0.2;
  if (doi) score += 0.35;
  else if (url) score += 0.2;
  score = Math.min(1, Number(score.toFixed(2)));

  const fieldConfidence: Partial<Record<ParsedReferenceField, ParseConfidence>> = {};
  if (author) fieldConfidence.author = "medium";
  if (title) fieldConfidence.title = title.length >= 12 ? "medium" : "low";
  if (year) fieldConfidence.year = "high";
  if (doi) fieldConfidence.doi = "high";
  if (url) fieldConfidence.url = "high";

  const warnings: string[] = [];
  if (!title) warnings.push("A title could not be detected; review the original reference.");
  if (!year) warnings.push("A publication year could not be detected.");
  if (!author) warnings.push("An author or organization could not be detected.");

  return {
    originalInput,
    metadata,
    confidence: confidenceFromScore(score),
    confidenceScore: score,
    fieldConfidence,
    warnings,
  };
}

/** Parse pasted text into bounded, explicitly reviewable candidates. */
export function parsePastedReferenceList(input: unknown): ReferenceListParseResult {
  if (typeof input !== "string" || !input.trim()) {
    return { candidates: [], truncated: false, ignoredEntryCount: 0 };
  }
  const truncatedByChars = input.length > MAX_PASTED_REFERENCE_LIST_CHARS;
  const bounded = input.slice(0, MAX_PASTED_REFERENCE_LIST_CHARS);
  const entries = splitReferenceEntries(bounded);
  const accepted = entries.slice(0, MAX_PARSED_REFERENCE_ENTRIES);
  return {
    candidates: accepted.map(reviewCandidate),
    truncated: truncatedByChars || entries.length > accepted.length,
    ignoredEntryCount: Math.max(0, entries.length - accepted.length),
  };
}

function normalizedComparableText(value: unknown): string {
  return (boundedString(value, MAX_REFERENCE_ENTRY_CHARS) ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function canonicalUrl(value: unknown): string | undefined {
  const normalized = normalizeReferenceHttpUrl(value);
  if (!normalized) return undefined;
  try {
    const parsed = new URL(normalized);
    parsed.hostname = parsed.hostname.toLowerCase();
    const result = parsed.toString();
    return parsed.pathname === "/" && !parsed.search ? result.replace(/\/$/, "") : result;
  } catch {
    return undefined;
  }
}

function titleSimilarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const a = new Set(left.split(" ").filter((token) => token.length > 1));
  const b = new Set(right.split(" ").filter((token) => token.length > 1));
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function comparableSignals(reference: ExistingReferenceLike) {
  const sourceText =
    reference.text ?? reference.originalText ?? reference.formattedCitationOverride ?? "";
  const doi = normalizeReferenceDoi(reference.doi) ?? extractDoi(sourceText);
  const url = canonicalUrl(reference.url) ?? canonicalUrl(extractUrl(sourceText));
  const year = yearText(reference.year) ?? extractYear(sourceText);
  const inferredTitle = reference.title ?? inferTitle(sourceText, year, doi, url);
  return {
    doi: doi?.toLocaleLowerCase("en"),
    url,
    year,
    title: normalizedComparableText(inferredTitle),
    text: normalizedComparableText(sourceText),
  };
}

function asExistingReference(
  candidate: ReferenceReviewCandidate | StructuredReferenceMetadata,
): ExistingReferenceLike {
  return "metadata" in candidate ? candidate.metadata : candidate;
}

/** Return likely matches, strongest first. Exact DOI/URL matches dominate. */
export function findLikelyReferenceDuplicates(
  candidate: ReferenceReviewCandidate | StructuredReferenceMetadata,
  existingReferences: readonly ExistingReferenceLike[],
): LikelyDuplicateMatch[] {
  const candidateSignals = comparableSignals(asExistingReference(candidate));
  const matches: LikelyDuplicateMatch[] = [];

  existingReferences.slice(0, MAX_DUPLICATE_COMPARISONS).forEach((existing, existingIndex) => {
    const existingSignals = comparableSignals(existing);
    let reason: DuplicateReason | null = null;
    let confidence = 0;

    if (candidateSignals.doi && candidateSignals.doi === existingSignals.doi) {
      reason = "doi";
      confidence = 1;
    } else if (candidateSignals.url && candidateSignals.url === existingSignals.url) {
      reason = "url";
      confidence = 0.98;
    } else if (
      candidateSignals.text &&
      existingSignals.text &&
      candidateSignals.text === existingSignals.text
    ) {
      reason = "formatted-text";
      confidence = 0.95;
    } else {
      const similarity = titleSimilarity(candidateSignals.title, existingSignals.title);
      if (
        similarity >= 0.8 &&
        candidateSignals.year &&
        candidateSignals.year === existingSignals.year
      ) {
        reason = "title-year";
        confidence = Number((0.75 + similarity * 0.15).toFixed(2));
      } else if (similarity === 1 && candidateSignals.title.length >= 12) {
        reason = "title";
        confidence = 0.78;
      }
    }

    if (reason) {
      matches.push({
        existingIndex,
        ...(existing.id ? { existingId: existing.id } : {}),
        reason,
        confidence,
      });
    }
  });

  return matches.sort((a, b) => b.confidence - a.confidence || a.existingIndex - b.existingIndex);
}

export function detectLikelyReferenceDuplicates(
  candidates: readonly (ReferenceReviewCandidate | StructuredReferenceMetadata)[],
  existingReferences: readonly ExistingReferenceLike[],
): CandidateDuplicateResult[] {
  return candidates
    .slice(0, MAX_PARSED_REFERENCE_ENTRIES)
    .map((candidate, candidateIndex) => ({
      candidateIndex,
      matches: findLikelyReferenceDuplicates(candidate, existingReferences),
    }))
    .filter((result) => result.matches.length > 0);
}

function crossrefType(value: unknown): ReferenceType {
  switch (boundedString(value, 80)?.toLocaleLowerCase("en")) {
    case "journal-article":
      return "journal-article";
    case "book":
    case "monograph":
    case "reference-book":
      return "book";
    case "book-chapter":
    case "book-section":
      return "book-chapter";
    case "dissertation":
      return "thesis-dissertation";
    case "proceedings-article":
    case "proceedings":
      return "conference-paper";
    case "webpage":
    case "dataset":
    case "posted-content":
      return "website";
    default:
      return "other";
  }
}

function crossrefYear(message: Record<string, unknown>): string | undefined {
  for (const key of ["published-print", "published-online", "published", "issued", "created"]) {
    const date = asRecord(message[key]);
    const dateParts = date?.["date-parts"];
    if (Array.isArray(dateParts) && Array.isArray(dateParts[0])) {
      const year = yearText(dateParts[0][0]);
      if (year) return year;
    }
    const year = yearText(date?.["date-time"]);
    if (year) return year;
  }
  return undefined;
}

function crossrefAuthors(value: unknown): PersonReferenceAuthor[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_REFERENCE_AUTHORS).flatMap((entry) => {
    const author = asRecord(entry);
    if (!author) return [];
    const mapped: PersonReferenceAuthor = {
      ...(boundedString(author.given, 150) ? { given: boundedString(author.given, 150) } : {}),
      ...(boundedString(author.family, 150) ? { family: boundedString(author.family, 150) } : {}),
      ...(boundedString(author.name, 300) ? { literal: boundedString(author.name, 300) } : {}),
      ...(boundedString(author.ORCID, 300)
        ? { orcid: boundedString(author.ORCID, 300)?.replace(/^https?:\/\/orcid\.org\//i, "") }
        : {}),
    };
    return mapped.given || mapped.family || mapped.literal ? [mapped] : [];
  });
}

function crossrefPages(value: unknown): Pick<StructuredReferenceBase, "pageStart" | "pageEnd" | "articleNumber"> {
  const page = boundedString(value, 160);
  if (!page) return {};
  const range = page.match(/^(.+?)[–—-]([^-–—]+)$/);
  if (range) return { pageStart: range[1].trim(), pageEnd: range[2].trim() };
  return /^e?\d+$/i.test(page) ? { articleNumber: page } : { pageStart: page };
}

/** Safely map a Crossref message or `{message: ...}` response wrapper. */
export function mapCrossrefLikeMetadata(input: unknown): StructuredReferenceMetadata | null {
  const root = asRecord(input);
  if (!root) return null;
  const wrapped = asRecord(root.message);
  const message = wrapped ?? root;
  const type = crossrefType(message.type);
  const title = firstText(message.title);
  const authors = crossrefAuthors(message.author);
  const organization = firstText(message["group-title"]);
  const containerTitle = firstText(message["container-title"]);
  const year = crossrefYear(message);
  const doi = normalizeReferenceDoi(message.DOI ?? message.doi);
  const url = normalizeReferenceHttpUrl(message.URL ?? message.url);

  const base: StructuredReferenceBase = {
    type,
    ...(authors.length > 0 ? { authors } : {}),
    ...(organization ? { organization } : {}),
    ...(title ? { title } : {}),
    ...(containerTitle ? { containerTitle } : {}),
    ...(year ? { year } : {}),
    ...(boundedString(message.volume, 80) ? { volume: boundedString(message.volume, 80) } : {}),
    ...(boundedString(message.issue, 80) ? { issue: boundedString(message.issue, 80) } : {}),
    ...crossrefPages(message.page),
    ...(boundedString(message["article-number"], 80)
      ? { articleNumber: boundedString(message["article-number"], 80) }
      : {}),
    ...(boundedString(message.publisher) ? { publisher: boundedString(message.publisher) } : {}),
    ...(doi ? { doi } : {}),
    ...(url ? { url } : {}),
  };

  if (type === "thesis-dissertation") {
    return {
      ...base,
      type,
      thesisKind: "dissertation",
      ...(base.publisher ? { institution: base.publisher } : {}),
    };
  }
  if (type === "conference-paper") {
    return { ...base, type, ...(containerTitle ? { conferenceName: containerTitle } : {}) };
  }
  if (type === "website") {
    return { ...base, type, ...(containerTitle ? { websiteName: containerTitle } : {}) };
  }
  return base as StructuredReferenceMetadata;
}

/** Alias kept concise for consumers that already know the payload is Crossref-like. */
export const mapCrossrefMetadata = mapCrossrefLikeMetadata;

function wordCountSource(value: string): string {
  return value
    .slice(0, MAX_WORD_COUNT_CHARS)
    .replace(/\[cite:[^\]]*\]/gi, " ")
    .replace(/<\/?(?:sub|sup)>/gi, "")
    .replace(/[*_]+/g, " ");
}

/** Count natural-language words, including Khmer when Intl.Segmenter exists. */
export function countWords(value: unknown, locale = "en"): number {
  if (typeof value !== "string" || !value.trim()) return 0;
  const text = wordCountSource(value);
  try {
    if (typeof Intl.Segmenter === "function") {
      const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
      let count = 0;
      for (const segment of segmenter.segment(text)) {
        if (segment.isWordLike) count += 1;
      }
      return count;
    }
  } catch {
    // Unsupported locale or partial Intl implementation: use the safe fallback.
  }
  return text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

/**
 * Flag a Khmer field that is substantially Latin-script. The result is always
 * nonblocking and deliberately ignores short snippets and mixed Khmer prose.
 */
export function detectKhmerFieldLanguageMismatch(
  value: unknown,
): KhmerLanguageMismatchWarning | null {
  if (typeof value !== "string") return null;
  const text = value.slice(0, MAX_WORD_COUNT_CHARS);
  const latin = text.match(/\p{Script=Latin}/gu)?.length ?? 0;
  const khmer = text.match(/\p{Script=Khmer}/gu)?.length ?? 0;
  const letterCount = latin + khmer;
  if (letterCount < 20 || latin < 16) return null;

  const latinRatio = latin / letterCount;
  const khmerRatio = khmer / letterCount;
  if (latinRatio < 0.7 || khmerRatio > 0.2) return null;

  return {
    code: "likely-latin-content",
    severity: "warning",
    message: "This Khmer field appears to contain mostly Latin or English text. Review it before publishing.",
    latinRatio: Number(latinRatio.toFixed(3)),
    khmerRatio: Number(khmerRatio.toFixed(3)),
    letterCount,
  };
}

export function isLikelyLatinContentInKhmerField(value: unknown): boolean {
  return detectKhmerFieldLanguageMismatch(value) !== null;
}
