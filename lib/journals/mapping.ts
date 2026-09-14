// Pure twin of migration 0148's matching rules, plus the mapping-report
// vocabulary. No server-only imports: scripts/journals/mapping-report.ts, the
// admin Journals page and the unit tests all run this.
//
// The database is authoritative — the trigger `publications_sync_journal_refs`
// decides what an article maps to, and the view `journal_mapping_report`
// labels each row. This file exists so the SAME rule can be explained, tested
// and previewed (e.g. "which articles would this alias map?") without a
// round-trip, and lib/journals/mapping.test.ts pins that the SQL applies the
// same three normalization steps as journalMatchKey().

/**
 * "The same journal name": trim, collapse runs of whitespace, case-fold. That
 * is ALL — no punctuation folding, no abbreviation expansion, no similarity.
 * Anything looser is decided by an admin recording an alias, never by code.
 * SQL twin: public.journal_match_key().
 */
export function journalMatchKey(name: string | null | undefined): string | null {
  const key = (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return key === "" ? null : key;
}

/** Trimmed, whitespace-collapsed, case kept. SQL twin: journal_clean_name(). */
export function journalCleanName(name: string | null | undefined): string | null {
  const clean = (name ?? "").trim().replace(/\s+/g, " ");
  return clean === "" ? null : clean;
}

/**
 * Where an article stands against the journal model. Same values, same
 * precedence, as the `mapping_status` column of `journal_mapping_report`.
 *
 *  - mapped      journal (and every volume/issue the text names) resolved,
 *                and the text agrees with the canonical row
 *  - partial     journal resolved but a named volume/issue did not
 *  - invalid     mapped, but the legacy text disagrees with the canonical row
 *                (should be impossible while the trigger is installed — a
 *                non-zero count means something wrote around it)
 *  - ambiguous   the name matches more than one journal (title or alias)
 *  - unmapped    the name matches no journal — an admin must create the
 *                journal or add the name as an alias of an existing one
 *  - no_journal  the article names no journal at all
 */
export type JournalMappingStatus =
  | "mapped"
  | "partial"
  | "invalid"
  | "ambiguous"
  | "unmapped"
  | "no_journal";

export const MAPPING_STATUSES: readonly JournalMappingStatus[] = [
  "mapped",
  "partial",
  "invalid",
  "ambiguous",
  "unmapped",
  "no_journal",
];

export type MappingJournal = { id: string; title: string; aliases?: readonly string[] | null };

export type MappingArticle = {
  journal_name: string | null;
  volume: string | null;
  issue_no: string | null;
  journal_id: string | null;
  volume_id: string | null;
  issue_id: string | null;
};

/** The journals whose title or an alias has this name's key. */
export function journalsMatching(
  name: string | null | undefined,
  journals: readonly MappingJournal[],
): MappingJournal[] {
  const key = journalMatchKey(name);
  if (!key) return [];
  return journals.filter(
    (j) =>
      journalMatchKey(j.title) === key ||
      (j.aliases ?? []).some((a) => journalMatchKey(a) === key),
  );
}

const present = (v: string | null | undefined) => (v ?? "").trim() !== "";

export function classifyJournalMapping(
  article: MappingArticle,
  journals: readonly MappingJournal[],
): JournalMappingStatus {
  if (!article.journal_id) {
    if (!journalMatchKey(article.journal_name)) return "no_journal";
    return journalsMatching(article.journal_name, journals).length > 1 ? "ambiguous" : "unmapped";
  }
  if ((present(article.volume) && !article.volume_id) || (present(article.issue_no) && !article.issue_id)) {
    return "partial";
  }
  const journal = journals.find((j) => j.id === article.journal_id);
  if (!journal || article.journal_name !== journal.title) return "invalid";
  return "mapped";
}

export type MappingSummary = Record<JournalMappingStatus, number> & { total: number };

export function summarizeMapping(statuses: readonly JournalMappingStatus[]): MappingSummary {
  const summary = Object.fromEntries(MAPPING_STATUSES.map((s) => [s, 0])) as MappingSummary;
  summary.total = statuses.length;
  for (const s of statuses) summary[s] += 1;
  return summary;
}

/**
 * Journal names that would be AMBIGUOUS for the backfill: two or more
 * distinct cleaned spellings folding to one key ("Journal of X" and
 * "journal of x"). The 0148 backfill creates no journal for these; this lists
 * them so an admin can pick the title and record the rest as aliases.
 */
export function spellingCollisions(names: readonly (string | null | undefined)[]): Map<string, string[]> {
  const byKey = new Map<string, Set<string>>();
  for (const n of names) {
    const key = journalMatchKey(n);
    const clean = journalCleanName(n);
    if (!key || !clean) continue;
    const set = byKey.get(key) ?? new Set<string>();
    set.add(clean);
    byKey.set(key, set);
  }
  const out = new Map<string, string[]>();
  for (const [key, set] of byKey) if (set.size > 1) out.set(key, [...set].sort());
  return out;
}
