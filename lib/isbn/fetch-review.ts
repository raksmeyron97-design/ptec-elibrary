/**
 * Fetch by ISBN on an existing record, as a PREVIEW (docs/CATALOG-REVIEW.md,
 * Slice 5). Pure. The rules of lib/isbn/enrich.ts are unchanged — empty fields
 * are fillable, different values are only offered, nothing is filled while the
 * found title disagrees — this module only arranges the answer so a librarian
 * sees it before anything reaches the form:
 *
 *   SAFE TO APPLY   — fields the record leaves empty (ticked by default);
 *   NEEDS REVIEW    — fields that already hold something else (unticked,
 *                     unless the current value merely restates the record);
 *   NO TRUSTED DATA — what no provider is believed for, said out loud.
 *
 * Exact ISBN identity is the match; title similarity only decides whether a
 * found record names THIS work. When the providers describe different editions
 * (another publisher or year for the same ISBN), they are shown as choices and
 * never merged into one record.
 */
import { mergeIsbnCandidates, planIsbnFill, titlesLookAlike, type CurrentRecord, type EnrichField, type FillValue } from "./enrich";
import type { IsbnCandidate, IsbnProvider, ProviderOutcome } from "./types";
import { normalizeTitle } from "@/lib/books/duplicate-detection/normalize";

/** Never filled from a provider: PTEC's own subject scheme, its department, Koha's call number and shelf. */
export const NO_TRUSTED_FIELDS = ["category", "department", "call-number", "shelf"] as const;
export type NoTrustedField = (typeof NO_TRUSTED_FIELDS)[number];

const fullTitle = (c: IsbnCandidate) => (c.subtitle ? `${c.title}: ${c.subtitle}` : c.title);

/** Candidates that name the record's work. The rest are another book behind a mistyped ISBN. */
export function sameWorkCandidates(recordTitle: string, candidates: readonly IsbnCandidate[]): IsbnCandidate[] {
  return candidates.filter(
    (c) => titlesLookAlike(recordTitle, c.title) || (!!c.subtitle && titlesLookAlike(recordTitle, `${c.title} ${c.subtitle}`)),
  );
}

export type EditionGroup = { key: string; publisher: string | null; year: number | null; candidates: IsbnCandidate[] };

/**
 * Group candidates by edition — publisher and year. A candidate that states
 * neither says nothing about the edition and joins every group, so it never
 * makes a lookup look ambiguous on its own.
 */
export function editionGroups(candidates: readonly IsbnCandidate[]): EditionGroup[] {
  const groups = new Map<string, EditionGroup>();
  const silent: IsbnCandidate[] = [];
  for (const c of candidates) {
    const publisher = c.publisher?.trim() || null;
    if (!publisher && !c.year) {
      silent.push(c);
      continue;
    }
    const key = `${normalizeTitle(publisher)}|${c.year ?? ""}`;
    const g = groups.get(key) ?? { key, publisher, year: c.year ?? null, candidates: [] };
    g.candidates.push(c);
    groups.set(key, g);
  }
  const out = [...groups.values()];
  if (out.length === 0) return silent.length ? [{ key: "|", publisher: null, year: null, candidates: silent }] : [];
  for (const g of out) g.candidates.push(...silent);
  return out;
}

export type PreviewItem = {
  field: EnrichField;
  found: FillValue;
  current: FillValue | null;
  source: IsbnProvider | null;
  /** Ticked by default: safe fills always; a review item only when the current value just restates the record. */
  preselected: boolean;
};

export type FetchPreview = {
  safe: PreviewItem[];
  review: PreviewItem[];
  noTrusted: readonly NoTrustedField[];
  title: string;
};

export function fetchPreview(current: CurrentRecord, candidates: readonly IsbnCandidate[]): FetchPreview | null {
  const merged = mergeIsbnCandidates([...candidates]);
  if (!merged) return null;
  const plan = planIsbnFill(current, merged);
  const safe: PreviewItem[] = (Object.entries(plan.fill) as [EnrichField, FillValue][]).map(([field, found]) => ({
    field,
    found,
    current: null,
    source: plan.sources[field] ?? null,
    preselected: true,
  }));
  const review: PreviewItem[] = plan.conflicts.map((c) => ({
    field: c.field,
    found: c.found,
    current: c.current,
    source: plan.sources[c.field] ?? null,
    preselected: !!c.suggested,
  }));
  return { safe, review, noTrusted: NO_TRUSTED_FIELDS, title: merged.title };
}

/** The selected items as form values, with the provider each came from. */
export function chosenValues(preview: FetchPreview, chosen: ReadonlySet<EnrichField>) {
  const values: Partial<Record<EnrichField, FillValue>> = {};
  const sources: Partial<Record<EnrichField, IsbnProvider>> = {};
  for (const item of [...preview.safe, ...preview.review]) {
    if (!chosen.has(item.field)) continue;
    values[item.field] = item.found;
    if (item.source) sources[item.field] = item.source;
  }
  return { values, sources };
}

export type LookupResult =
  | { kind: "found"; partial: boolean }
  | { kind: "ambiguous"; groups: EditionGroup[]; partial: boolean }
  | { kind: "mismatch"; foundTitle: string; provider: IsbnProvider }
  | { kind: "not_found" }
  | { kind: "incomplete" };

/**
 * What the lookup came to, named honestly: "not found" only when every provider
 * actually answered; "incomplete" when one failed and nothing was found;
 * "partial" when something was found but a provider failed.
 */
export function classifyLookup(recordTitle: string, candidates: readonly IsbnCandidate[], outcomes: readonly ProviderOutcome[]): LookupResult {
  const failed = outcomes.some((o) => o.status === "error");
  if (candidates.length === 0) return failed ? { kind: "incomplete" } : { kind: "not_found" };
  const same = sameWorkCandidates(recordTitle, candidates);
  if (same.length === 0) return { kind: "mismatch", foundTitle: fullTitle(candidates[0]), provider: candidates[0].provider };
  const groups = editionGroups(same);
  if (groups.length > 1) return { kind: "ambiguous", groups, partial: failed };
  return { kind: "found", partial: failed };
}
