import {
  METADATA_TIER_LABELS,
  thesisFieldLabels,
  thesisFieldWeights,
  type MetadataQualityTier,
} from "@/lib/admin/thesis-metadata-quality";
import { ebookFieldLabels, ebookFieldWeights } from "@/lib/admin/ebook-quality";

export type QualityRecordType = "book" | "research";

/** One scored, published record. `missing` keeps the field KEY, not just its
 *  label — the key is what the UI filters on and translates from. */
export type ScoredRecord = {
  id: string;
  type: QualityRecordType;
  title: string;
  completeness: number;
  tier: MetadataQualityTier;
  missing: { key: string; label: string }[];
  editUrl: string;
};

/**
 * One field, across the whole published collection.
 *
 * `impact` is the headline: the percentage points the collection's AVERAGE
 * completeness would gain if this one field were filled on every record that
 * is missing it. Sorting by raw count answers "what is missing most often";
 * sorting by impact answers "what should I fix first", and those two orders
 * routinely disagree — a 3-point Publisher gap on 90 records is worth less
 * than a 15-point Abstract gap on 25.
 */
export type FieldImpact = {
  key: string;
  label: string;
  count: number;
  /** Share of scored records missing this field, 0–1. */
  share: number;
  /** Average-completeness points the collection would gain. */
  impact: number;
  types: QualityRecordType[];
};

export type TierBreakdown = { tier: MetadataQualityTier; label: string; count: number };

export type QualityReport = {
  /** Records with at least one gap, worst completeness first. */
  gaps: ScoredRecord[];
  /** Every published record that was scored, gaps or not. */
  scoredCount: number;
  completeCount: number;
  tiers: TierBreakdown[];
  fields: FieldImpact[];
  averageCompleteness: number;
  byType: Record<QualityRecordType, { count: number; average: number }>;
};

export const TIER_ORDER: MetadataQualityTier[] = ["complete", "good", "needs_review", "incomplete"];

const WEIGHTS: Record<QualityRecordType, Record<string, number>> = {
  book: ebookFieldWeights(),
  research: thesisFieldWeights(),
};
const LABELS: Record<QualityRecordType, Record<string, string>> = {
  book: ebookFieldLabels(),
  research: thesisFieldLabels(),
};

/** The scorers' own thresholds, in one place so the report cannot disagree. */
export function tierOf(score: number): MetadataQualityTier {
  if (score >= 90) return "complete";
  if (score >= 70) return "good";
  if (score >= 40) return "needs_review";
  return "incomplete";
}

function average(values: number[]): number {
  return values.length === 0 ? 100 : Math.round(values.reduce((sum, n) => sum + n, 0) / values.length);
}

/**
 * Turn a flat list of scored records into everything the Data Quality page
 * shows: the repair queue, the tier distribution, and the per-field impact
 * ranking.
 *
 * Pure on purpose. The page scores every published book and thesis on each
 * request anyway; deriving all three views from that ONE pass is what makes
 * the analysis free, instead of the two independent full-table scans (one for
 * the summary, one for the queue) this replaced.
 */
export function buildQualityReport(records: ScoredRecord[]): QualityReport {
  const tierCounts = new Map<MetadataQualityTier, number>(TIER_ORDER.map((tier) => [tier, 0]));
  const fieldCounts = new Map<string, { count: number; weighted: number; types: Set<QualityRecordType> }>();
  const scores: number[] = [];
  const byTypeScores: Record<QualityRecordType, number[]> = { book: [], research: [] };

  for (const record of records) {
    scores.push(record.completeness);
    byTypeScores[record.type].push(record.completeness);
    tierCounts.set(record.tier, (tierCounts.get(record.tier) ?? 0) + 1);

    for (const field of record.missing) {
      const entry = fieldCounts.get(field.key) ?? { count: 0, weighted: 0, types: new Set() };
      entry.count += 1;
      // The same key can carry a different weight per type (a thesis Abstract
      // is worth more than a book Description), so the impact accumulates the
      // weight of the record it was actually missing from.
      entry.weighted += WEIGHTS[record.type][field.key] ?? 0;
      entry.types.add(record.type);
      fieldCounts.set(field.key, entry);
    }
  }

  const scoredCount = records.length;
  const fields: FieldImpact[] = [...fieldCounts.entries()]
    .map(([key, entry]) => ({
      key,
      label: LABELS.book[key] ?? LABELS.research[key] ?? key,
      count: entry.count,
      share: scoredCount > 0 ? entry.count / scoredCount : 0,
      impact: scoredCount > 0 ? Math.round((entry.weighted / scoredCount) * 10) / 10 : 0,
      types: [...entry.types],
    }))
    .sort((a, b) => b.impact - a.impact || b.count - a.count || a.key.localeCompare(b.key));

  return {
    gaps: records
      .filter((record) => record.missing.length > 0)
      .sort((a, b) => a.completeness - b.completeness || a.title.localeCompare(b.title)),
    scoredCount,
    completeCount: records.filter((record) => record.missing.length === 0).length,
    tiers: TIER_ORDER.map((tier) => ({
      tier,
      label: METADATA_TIER_LABELS[tier],
      count: tierCounts.get(tier) ?? 0,
    })),
    fields,
    averageCompleteness: average(scores),
    byType: {
      book: { count: byTypeScores.book.length, average: average(byTypeScores.book) },
      research: { count: byTypeScores.research.length, average: average(byTypeScores.research) },
    },
  };
}

export type QueueFilters = {
  type?: QualityRecordType | "all";
  field?: string;
  tier?: MetadataQualityTier | "all";
  query?: string;
};

/** Apply the repair queue's URL filters. Pure, so the page and its tests
 *  agree on what "112 records, 30 of them missing a License" means. */
export function filterGaps(gaps: ScoredRecord[], filters: QueueFilters): ScoredRecord[] {
  const query = filters.query?.trim().toLowerCase();
  return gaps.filter((record) => {
    if (filters.type && filters.type !== "all" && record.type !== filters.type) return false;
    if (filters.tier && filters.tier !== "all" && record.tier !== filters.tier) return false;
    if (filters.field && !record.missing.some((field) => field.key === filters.field)) return false;
    if (query && !record.title.toLowerCase().includes(query)) return false;
    return true;
  });
}
