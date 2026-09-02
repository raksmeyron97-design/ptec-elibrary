/**
 * Duplicate assessment for a whole CSV import, using the same rules as the
 * single-upload gate.
 *
 * WHY IT IS NOT A SECOND DETECTOR. A bulk import is where duplicates arrive by
 * the dozen, so it is the last place that should have its own idea of what one
 * is. Everything here delegates to `scoreCandidate`; what it adds is the two
 * things a batch has and a single upload does not:
 *
 *   1. **Row-against-row.** Two lines of one CSV can be the same book, and no
 *      amount of checking against the catalogue will find that — neither row
 *      exists yet. Each row is scored against the rows BEFORE it, so exactly
 *      one of a pair is flagged and the other stays importable.
 *   2. **One catalogue read for the whole file.** 86 rows must not become 86
 *      round trips; the caller fetches the candidate pool once and every row
 *      is scored against it in memory.
 *
 * Pure — no DB, no server-only imports — so an importer's verdict for a given
 * CSV is reproducible in a test.
 */

import { assessDuplicates, type DuplicateCandidate, type DuplicateMatch } from "./signals";

export type BatchRow = {
  /** Stable row identity — the CSV index, as the importer already uses. */
  id: string;
  title: string;
  author?: string | null;
  isbn?: string | null;
  year?: number | null;
  publisher?: string | null;
};

export type BatchVerdict = {
  id: string;
  /** Where the match is: already catalogued, or earlier in this same file. */
  source: "catalog" | "batch";
  /** True when the save would be refused — an identifier match. */
  blocked: boolean;
  match: DuplicateMatch;
  /** For an in-file match, the row it collides with. */
  matchRowId?: string;
};

/** A CSV row, seen as a candidate for the rows that follow it. */
function rowAsCandidate(row: BatchRow): DuplicateCandidate {
  return {
    id: `row:${row.id}`,
    slug: "",
    title: row.title,
    author: row.author ?? null,
    isbn: row.isbn ?? null,
    year: row.year ?? null,
    publisher: row.publisher ?? null,
    contentHash: null,
    status: null,
    isPublished: false,
  };
}

/**
 * Score every row against the catalogue and against its predecessors.
 *
 * Returns one verdict per row that has a match — rows absent from the result
 * are clean. The catalogue always wins over an in-file match when both exist:
 * "this book is already in the library" is the more actionable sentence.
 */
export function assessBatch(
  rows: readonly BatchRow[],
  catalogue: readonly DuplicateCandidate[],
): Map<string, BatchVerdict> {
  const verdicts = new Map<string, BatchVerdict>();
  const seen: BatchRow[] = [];

  for (const row of rows) {
    const query = {
      title: row.title,
      author: row.author ?? null,
      isbn: row.isbn ?? null,
      year: row.year ?? null,
      publisher: row.publisher ?? null,
    };

    const againstCatalog = assessDuplicates(query, catalogue);
    const againstBatch = assessDuplicates(query, seen.map(rowAsCandidate));

    // Prefer the catalogue hit; fall back to the in-file one. A row that
    // collides with both is reported against the library, because that is the
    // record the operator has to go and look at.
    const catalogTop = againstCatalog.top;
    const batchTop = againstBatch.top;

    if (catalogTop && (!batchTop || catalogTop.score >= batchTop.score)) {
      verdicts.set(row.id, {
        id: row.id,
        source: "catalog",
        blocked: againstCatalog.blocked,
        match: catalogTop,
      });
    } else if (batchTop) {
      verdicts.set(row.id, {
        id: row.id,
        source: "batch",
        blocked: againstBatch.blocked,
        match: batchTop,
        matchRowId: batchTop.bookId.replace(/^row:/, ""),
      });
    }

    // Only after scoring: a row must not be a candidate for itself.
    seen.push(row);
  }

  return verdicts;
}

export type BatchSummary = { blocked: number; strong: number; possible: number; clean: number };

/** Counts for the importer's summary strip. */
export function summarizeBatch(
  rowCount: number,
  verdicts: ReadonlyMap<string, BatchVerdict>,
): BatchSummary {
  let blocked = 0;
  let strong = 0;
  let possible = 0;
  for (const verdict of verdicts.values()) {
    if (verdict.blocked) blocked += 1;
    else if (verdict.match.confidence === "high") strong += 1;
    else possible += 1;
  }
  return { blocked, strong, possible, clean: Math.max(0, rowCount - verdicts.size) };
}
