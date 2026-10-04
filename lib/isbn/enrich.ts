/**
 * "Fetch by ISBN" on an EXISTING record — the edit form's button and
 * scripts/enrich-catalog-book.ts. Pure: no I/O.
 *
 * Add by ISBN lets the librarian pick one candidate. Enriching a record is a
 * different job: the record already says which book it is, and the providers
 * are asked only for what it is missing. So the candidates are merged field
 * by field, and the merge is planned against the record's current values:
 *   • an empty field is filled;
 *   • a field that already holds something different is a CONFLICT, offered,
 *     never applied without the librarian ticking it;
 *   • nothing is filled at all while the found title disagrees with the
 *     record's title — a mistyped or misprinted ISBN fetches a real book,
 *     just not this one (measured 2026-10-04: 9781853963285, given as Fidler's
 *     "Strategic management for school development", is Open Library's
 *     "Educational management today", 1996).
 */
import { MAX_TEXT } from "@/lib/catalog";
import { resolveRowLanguage, type CatalogLanguage } from "@/lib/catalog-import";
import { isAllowedCoverSource } from "./cover-source";
import type { IsbnCandidate, IsbnProvider } from "./types";

export type Sourced<T> = { value: T; provider: IsbnProvider };

export type MergedIsbnRecord = {
  /** The first candidate's title (with subtitle), for the title check and messages. */
  title: string;
  description: Sourced<string> | null;
  publisher: Sourced<string> | null;
  year: Sourced<number> | null;
  /** Only when a provider STATED a language — never guessed from the title here. */
  language: Sourced<CatalogLanguage> | null;
  keywords: Sourced<string[]> | null;
  /** An allow-listed Open Library cover source, to import on Save. */
  coverImportUrl: Sourced<string> | null;
};

// Google Books writes descriptions; Open Library's edition records rarely do
// and its provider never returns one. Publisher and year are edition facts,
// which Open Library records per edition — so it goes first for those.
const DESCRIPTION_ORDER: IsbnProvider[] = ["google_books", "open_library"];
const EDITION_ORDER: IsbnProvider[] = ["open_library", "google_books"];

function ordered(candidates: IsbnCandidate[], order: IsbnProvider[]): IsbnCandidate[] {
  return [...candidates].sort((a, b) => order.indexOf(a.provider) - order.indexOf(b.provider));
}

function first<T>(candidates: IsbnCandidate[], order: IsbnProvider[], pick: (c: IsbnCandidate) => T | null): Sourced<T> | null {
  for (const c of ordered(candidates, order)) {
    const value = pick(c);
    if (value !== null) return { value, provider: c.provider };
  }
  return null;
}

const nonEmpty = (s: string | null | undefined) => {
  const v = (s ?? "").trim();
  return v ? v : null;
};

export function mergeIsbnCandidates(candidates: IsbnCandidate[]): MergedIsbnRecord | null {
  if (candidates.length === 0) return null;
  const byEdition = ordered(candidates, EDITION_ORDER);
  const head = byEdition[0];
  // Open Library's are Library of Congress headings; Google's are broad shelves.
  const subjects = [...new Set(byEdition.flatMap((c) => c.subjects.map((s) => s.trim()).filter(Boolean)))].slice(0, 10);
  const subjectSource = byEdition.find((c) => c.subjects.some((s) => s.trim()));
  return {
    title: head.subtitle ? `${head.title}: ${head.subtitle}` : head.title,
    description: first(candidates, DESCRIPTION_ORDER, (c) => nonEmpty(c.description)?.slice(0, MAX_TEXT.description) ?? null),
    publisher: first(candidates, EDITION_ORDER, (c) => nonEmpty(c.publisher)?.slice(0, MAX_TEXT.publisher) ?? null),
    year: first(candidates, EDITION_ORDER, (c) => (c.year && c.year > 0 ? c.year : null)),
    language: first(candidates, EDITION_ORDER, (c) => {
      const r = resolveRowLanguage(c.language, null);
      return r.source === "stated" && r.known ? r.value : null;
    }),
    keywords: subjects.length && subjectSource ? { value: subjects, provider: subjectSource.provider } : null,
    coverImportUrl: first(candidates, EDITION_ORDER, (c) => (isAllowedCoverSource(c.coverSource) ? c.coverSource : null)),
  };
}

// ── Is it the same book? ─────────────────────────────────────────────────────

const STOPWORDS = new Set(["the", "and", "for", "with", "from", "into", "your", "their", "les", "des", "une"]);

function words(title: string): string[] {
  return title
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

const compact = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, "");

/**
 * Does a found title name the same work as the record's? Generous on purpose —
 * a subtitle present on one side only, case and punctuation all pass — because
 * a false "mismatch" only costs one extra click, while a false "match" fills a
 * record with another book's description. Khmer is not space-delimited, so a
 * title with too few words falls back to containment of the letters alone.
 */
export function titlesLookAlike(recordTitle: string, foundTitle: string): boolean {
  const a = words(recordTitle);
  const b = words(foundTitle);
  if (a.length < 2 || b.length < 2) {
    const x = compact(recordTitle);
    const y = compact(foundTitle);
    return !!x && !!y && (x.includes(y) || y.includes(x));
  }
  const [shorter, longer] = a.length <= b.length ? [a, new Set(b)] : [b, new Set(a)];
  const shared = shorter.filter((w) => longer.has(w)).length;
  return shared / shorter.length >= 0.6;
}

// ── What to fill, what to ask ────────────────────────────────────────────────

export type EnrichField = "description" | "publisher" | "year" | "language" | "keywords" | "cover";

export type CurrentRecord = {
  description: string;
  /**
   * The description only restates the record ("Social sciences by Martin Ann
   * M. DDC call number: 300 MAR." — lib/catalogs/derived-description.ts). Still
   * never replaced unasked, but replacing it is the suggested answer.
   */
  descriptionIsDerived?: boolean;
  publisher: string;
  year: string;
  language: string;
  keywords: string[];
  /** True when the record has no cover of its own (it shows the generated one). */
  coverIsGenerated: boolean;
};

export type FillValue = string | string[];

export type EnrichPlan = {
  /** Empty on the record — safe to fill. */
  fill: Partial<Record<EnrichField, FillValue>>;
  /** Already holds something different — only with the librarian's say-so. */
  conflicts: { field: Exclude<EnrichField, "cover">; current: FillValue; found: FillValue; suggested?: boolean }[];
  /** Which provider each offered value came from. */
  sources: Partial<Record<EnrichField, IsbnProvider>>;
};

const same = (a: string, b: string) => a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();

export function planIsbnFill(current: CurrentRecord, found: MergedIsbnRecord): EnrichPlan {
  const plan: EnrichPlan = { fill: {}, conflicts: [], sources: {} };

  const text = (field: "description" | "publisher" | "year", have: string, got: Sourced<string> | null, suggested = false) => {
    if (!got) return;
    if (!have.trim()) {
      plan.fill[field] = got.value;
      plan.sources[field] = got.provider;
    } else if (!same(have, got.value)) {
      plan.conflicts.push({ field, current: have.trim(), found: got.value, ...(suggested ? { suggested } : {}) });
      plan.sources[field] = got.provider;
    }
  };
  text("description", current.description, found.description, !!current.descriptionIsDerived);
  text("publisher", current.publisher, found.publisher);
  text("year", current.year, found.year ? { value: String(found.year.value), provider: found.year.provider } : null);

  // The language select is never empty, so a stated language that differs is
  // always a question, never a fill.
  if (found.language && found.language.value !== current.language) {
    plan.conflicts.push({ field: "language", current: current.language, found: found.language.value });
    plan.sources.language = found.language.provider;
  }

  // Subjects are suggestions: they fill an empty keyword list, and are never
  // offered over keywords a librarian chose.
  if (found.keywords && current.keywords.length === 0) {
    plan.fill.keywords = found.keywords.value;
    plan.sources.keywords = found.keywords.provider;
  }

  if (found.coverImportUrl && current.coverIsGenerated) {
    plan.fill.cover = found.coverImportUrl.value;
    plan.sources.cover = found.coverImportUrl.provider;
  }
  return plan;
}

// ── For Koha ─────────────────────────────────────────────────────────────────

/**
 * The MARC21 a cataloguer types into Koha for the same values — the e-Library
 * and Koha field mapping of docs/KOHA-SYNC.md. 264 is RDA's production
 * statement (Koha's sync also reads 260); 653 is uncontrolled index terms.
 */
export function marcForEnrichment(v: {
  isbn?: string | null;
  publisher?: string | null;
  year?: string | number | null;
  description?: string | null;
  keywords?: string[] | null;
  language?: CatalogLanguage | null;
}): string[] {
  const lines: string[] = [];
  if (v.isbn) lines.push(`020    $a ${v.isbn}`);
  const lang = v.language ? MARC_LANGUAGE[v.language] : null;
  if (lang) lines.push(`041 0  $a ${lang}`);
  if (v.publisher || v.year) {
    lines.push(`264  1 ${v.publisher ? `$b ${v.publisher}${v.year ? "," : ""}` : ""}${v.publisher && v.year ? " " : ""}${v.year ? `$c ${v.year}` : ""}`);
  }
  if (v.description) lines.push(`520    $a ${v.description.replace(/\s*\n+\s*/g, " ")}`);
  // Second indicator 0, "topical term": the category is the 653 with a blank
  // one, so a keyword must never be written blank (lib/koha/projection.ts).
  for (const k of v.keywords ?? []) lines.push(`653  0 $a ${k}`);
  return lines;
}

const MARC_LANGUAGE: Partial<Record<CatalogLanguage, string>> = { km: "khm", en: "eng", fr: "fre", zh: "chi" };
