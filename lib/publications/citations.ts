import type { PublicationReference } from "@/lib/publications";

export const MAX_PUBLICATION_REFERENCES = 250;
export const MAX_REFERENCE_TEXT_LENGTH = 5_000;
export const CITATION_TOKEN_EXAMPLE = "[cite:reference-id]";

// Canonical IDs are deliberately namespaced and lowercase so they can never
// be confused with legacy positional tokens such as `[cite:2]`.
const REFERENCE_ID_RE = /^ref-[a-z0-9][a-z0-9_-]{0,75}$/;
const CITATION_TOKEN_RE = /\[cite:([^\]]*)\]/gi;
const DOI_RE = /^10\.\d{4,9}\/\S+$/i;

export type CitationSource = {
  id: string;
  text: string | null | undefined;
};

export type CitationTokenMatch = {
  key: string;
  raw: string;
  start: number;
  end: number;
};

export type ResolvedCitation = {
  reference: PublicationReference;
  number: number;
};

export type CitationOccurrence = ResolvedCitation & {
  sourceId: string;
  citationId: string;
  occurrence: number;
};

export type CitationValidationIssue = {
  code:
    | "invalid_references"
    | "too_many_references"
    | "invalid_reference"
    | "missing_reference_text"
    | "reference_text_too_long"
    | "invalid_reference_id"
    | "duplicate_reference_id"
    | "invalid_doi"
    | "duplicate_doi"
    | "invalid_url"
    | "invalid_citation_token"
    | "missing_citation_target";
  message: string;
  referenceIndex?: number;
  referenceId?: string;
  field?: "id" | "text" | "doi" | "url" | "citation";
  token?: string;
};

export type CitationValidationResult = {
  references: PublicationReference[];
  errors: CitationValidationIssue[];
  warnings: CitationValidationIssue[];
};

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function idSeed(reference: Record<string, unknown>, index: number): string {
  return [
    index,
    stringValue(reference.text),
    stringValue(reference.doi),
    stringValue(reference.url),
  ].join("\u0000");
}

export function isValidReferenceId(value: string): boolean {
  return REFERENCE_ID_RE.test(value);
}

export function deterministicReferenceId(
  reference: Record<string, unknown>,
  index: number,
): string {
  return `ref-${fnv1a(idSeed(reference, index))}`;
}

export function createPublicationReferenceId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `ref-${uuid.toLowerCase()}`;
  return `ref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeDoi(value: unknown): string | undefined {
  const raw = stringValue(value);
  if (!raw) return undefined;
  const normalized = raw
    .replace(/^doi\s*:\s*/i, "")
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .trim();
  return normalized || undefined;
}

export function isValidDoi(value: string): boolean {
  return DOI_RE.test(value) && !/\s/.test(value);
}

export function normalizeReferenceUrl(value: unknown): string | undefined {
  const raw = stringValue(value);
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

/**
 * Convert unknown/legacy JSONB into the browser-safe reference model.
 * Invalid rows are ignored on reads; mutation validation reports them instead.
 */
export function normalizePublicationReferences(input: unknown): PublicationReference[] {
  if (!Array.isArray(input)) return [];

  const normalized: PublicationReference[] = [];
  const usedIds = new Set<string>();

  for (let rawIndex = 0; rawIndex < input.length && normalized.length < MAX_PUBLICATION_REFERENCES; rawIndex += 1) {
    const raw = input[rawIndex];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const text = stringValue(row.text);
    if (!text) continue;

    const suppliedId = stringValue(row.id);
    const baseId = isValidReferenceId(suppliedId)
      ? suppliedId
      : deterministicReferenceId(row, rawIndex);
    let id = baseId;
    let collision = 2;
    while (usedIds.has(id)) {
      id = `${baseId.slice(0, 72)}-${collision}`;
      collision += 1;
    }
    usedIds.add(id);

    const doiCandidate = normalizeDoi(row.doi);
    const doi = doiCandidate && isValidDoi(doiCandidate) ? doiCandidate : undefined;
    const url = normalizeReferenceUrl(row.url);
    normalized.push({
      id,
      index: normalized.length + 1,
      text,
      ...(doi ? { doi } : {}),
      ...(url ? { url } : {}),
    });
  }

  return normalized;
}

export function citationToken(referenceId: string): string {
  return `[cite:${referenceId}]`;
}

export function extractCitationTokens(content: string | null | undefined): CitationTokenMatch[] {
  if (!content) return [];
  const matches: CitationTokenMatch[] = [];
  const pattern = new RegExp(CITATION_TOKEN_RE.source, CITATION_TOKEN_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    matches.push({
      key: match[1].trim(),
      raw: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return matches;
}

export function resolveCitation(
  key: string,
  references: readonly PublicationReference[],
): ResolvedCitation | null {
  const trimmed = key.trim();
  const byId = references.findIndex((reference) => reference.id === trimmed);
  if (byId >= 0) return { reference: references[byId], number: byId + 1 };

  // Compatibility for manually-authored legacy positional tokens. Admin
  // editing upgrades these to stable IDs before a reorder can change meaning.
  if (/^[1-9]\d*$/.test(trimmed)) {
    const number = Number(trimmed);
    const reference = references[number - 1];
    if (reference) return { reference, number };
  }
  return null;
}

export function upgradeLegacyCitationTokens(
  content: string | null | undefined,
  references: readonly PublicationReference[],
): string {
  if (!content) return content ?? "";
  return content.replace(CITATION_TOKEN_RE, (raw, key: string) => {
    if (!/^[1-9]\d*$/.test(key.trim())) return raw;
    const resolved = resolveCitation(key, references);
    return resolved ? citationToken(resolved.reference.id) : raw;
  });
}

export function removeCitationTokensForReference(
  content: string | null | undefined,
  referenceId: string,
  references: readonly PublicationReference[],
): string {
  if (!content) return "";
  // Absorb horizontal whitespace before a removed token so deletion does not
  // leave "word ;" or doubled spaces behind.
  const withLeadingSpace = new RegExp(`[ \\t]*${CITATION_TOKEN_RE.source}`, CITATION_TOKEN_RE.flags);
  return content.replace(withLeadingSpace, (raw, key: string) => {
    const resolved = resolveCitation(key, references);
    return resolved?.reference.id === referenceId ? "" : raw;
  });
}

export function domSafeCitationPart(value: string): string {
  const safe = value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  // Valid reference IDs and our own source IDs sanitize to themselves, so a
  // hash fallback is only needed when sanitization erases everything.
  return safe || `item-${fnv1a(value)}`;
}

export function getReferenceTargetId(referenceId: string): string {
  return `reference-${domSafeCitationPart(referenceId)}`;
}

export function getCitationOccurrenceId(
  sourceId: string,
  referenceId: string,
  occurrence: number,
): string {
  return `citation-${domSafeCitationPart(sourceId)}-${domSafeCitationPart(referenceId)}-${occurrence}`;
}

export function collectCitationOccurrences(
  sources: readonly CitationSource[],
  references: readonly PublicationReference[],
): CitationOccurrence[] {
  const occurrences: CitationOccurrence[] = [];
  for (const source of sources) {
    const perReference = new Map<string, number>();
    for (const token of extractCitationTokens(source.text)) {
      const resolved = resolveCitation(token.key, references);
      if (!resolved) continue;
      const occurrence = (perReference.get(resolved.reference.id) ?? 0) + 1;
      perReference.set(resolved.reference.id, occurrence);
      occurrences.push({
        ...resolved,
        sourceId: source.id,
        occurrence,
        citationId: getCitationOccurrenceId(source.id, resolved.reference.id, occurrence),
      });
    }
  }
  return occurrences;
}

export function countCitationsByReference(
  sources: readonly CitationSource[],
  references: readonly PublicationReference[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const occurrence of collectCitationOccurrences(sources, references)) {
    counts[occurrence.reference.id] = (counts[occurrence.reference.id] ?? 0) + 1;
  }
  return counts;
}

function stripInlineFormatting(text: string): string {
  return text
    .replace(/<\/?(?:sub|sup)>/gi, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1");
}

export function academicTextToPlainText(
  content: string | null | undefined,
  references: readonly PublicationReference[] = [],
): string {
  if (!content) return "";
  const withCitations = content.replace(CITATION_TOKEN_RE, (_raw, key: string) => {
    const resolved = resolveCitation(key, references);
    return resolved ? `(${resolved.number})` : "";
  });
  return stripInlineFormatting(withCitations).replace(/\s+/g, " ").trim();
}

export function validatePublicationCitations(
  input: unknown,
  sources: readonly CitationSource[],
): CitationValidationResult {
  const errors: CitationValidationIssue[] = [];
  const warnings: CitationValidationIssue[] = [];

  if (!Array.isArray(input)) {
    errors.push({
      code: "invalid_references",
      field: "text",
      message: "References must be provided as an ordered list.",
    });
    return { references: [], errors, warnings };
  }

  if (input.length > MAX_PUBLICATION_REFERENCES) {
    errors.push({
      code: "too_many_references",
      message: `A publication can contain at most ${MAX_PUBLICATION_REFERENCES} references.`,
    });
  }

  const seenIds = new Set<string>();
  const seenDois = new Set<string>();
  for (let index = 0; index < Math.min(input.length, MAX_PUBLICATION_REFERENCES); index += 1) {
    const raw = input[index];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      errors.push({
        code: "invalid_reference",
        referenceIndex: index,
        message: `Reference ${index + 1} is not a valid reference object.`,
      });
      continue;
    }
    const row = raw as Record<string, unknown>;
    const text = stringValue(row.text);
    if (!text) {
      errors.push({
        code: "missing_reference_text",
        field: "text",
        referenceIndex: index,
        message: `Reference ${index + 1} needs citation text.`,
      });
    } else if (text.length > MAX_REFERENCE_TEXT_LENGTH) {
      errors.push({
        code: "reference_text_too_long",
        field: "text",
        referenceIndex: index,
        message: `Reference ${index + 1} exceeds ${MAX_REFERENCE_TEXT_LENGTH.toLocaleString()} characters.`,
      });
    }

    const suppliedId = stringValue(row.id);
    if (suppliedId) {
      if (!isValidReferenceId(suppliedId)) {
        errors.push({
          code: "invalid_reference_id",
          field: "id",
          referenceIndex: index,
          referenceId: suppliedId,
          message: `Reference ${index + 1} has an invalid stable ID.`,
        });
      } else if (seenIds.has(suppliedId)) {
        errors.push({
          code: "duplicate_reference_id",
          field: "id",
          referenceIndex: index,
          referenceId: suppliedId,
          message: `Reference ${index + 1} repeats stable ID “${suppliedId}”.`,
        });
      } else {
        seenIds.add(suppliedId);
      }
    } else {
      warnings.push({
        code: "invalid_reference_id",
        field: "id",
        referenceIndex: index,
        message: `Reference ${index + 1} uses a generated legacy ID and will be upgraded on save.`,
      });
    }

    const rawDoi = stringValue(row.doi);
    const doi = normalizeDoi(rawDoi);
    if (rawDoi && (!doi || !isValidDoi(doi))) {
      errors.push({
        code: "invalid_doi",
        field: "doi",
        referenceIndex: index,
        message: `Reference ${index + 1} has an invalid DOI.`,
      });
    } else if (doi) {
      const key = doi.toLowerCase();
      if (seenDois.has(key)) {
        errors.push({
          code: "duplicate_doi",
          field: "doi",
          referenceIndex: index,
          message: `Reference ${index + 1} repeats DOI “${doi}”.`,
        });
      }
      seenDois.add(key);
    }

    const rawUrl = stringValue(row.url);
    if (rawUrl && !normalizeReferenceUrl(rawUrl)) {
      errors.push({
        code: "invalid_url",
        field: "url",
        referenceIndex: index,
        message: `Reference ${index + 1} needs a valid HTTP or HTTPS URL.`,
      });
    }
  }

  const references = normalizePublicationReferences(input);
  for (const source of sources) {
    for (const token of extractCitationTokens(source.text)) {
      if (!token.key || (!isValidReferenceId(token.key) && !/^[1-9]\d*$/.test(token.key))) {
        errors.push({
          code: "invalid_citation_token",
          field: "citation",
          token: token.raw,
          message: `The citation token “${token.raw}” is malformed.`,
        });
        continue;
      }
      if (!resolveCitation(token.key, references)) {
        errors.push({
          code: "missing_citation_target",
          field: "citation",
          token: token.raw,
          referenceId: token.key,
          message: `Citation “${token.raw}” does not match a reference.`,
        });
      }
    }
  }

  return { references, errors, warnings };
}
