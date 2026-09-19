// lib/admin/contributor-trust-report.ts
//
// The librarian's view of what the contributor rule did, and what it left for
// a human.
//
// PURE. The admin action fetches the roster; this module decides nothing about
// the database and writes nothing to it. That matters more here than usual,
// because every finding in this report is a row that a person may be about to
// edit or retire, and the one thing this feature must never do is act on its
// own judgement about somebody's name.
//
// ── Why a report rather than a repair ───────────────────────────────────────
//
// `lib/resources/contributor-trust.ts` already answers the only question that
// has an automatic consequence: does this string identify anybody? When the
// answer is no, the public surfaces go quiet — the directory stops listing it,
// the sitemap stops advertising it, the page stops asserting a `Person`. That
// is reversible, costs nothing if wrong, and needs no operator.
//
// Everything else needs one. The 621 books credited to "Channa 0977 33 61 62"
// have a real author or a real corporate producer, and nothing in this
// codebase knows which. Merging that row, retiring it, or re-attributing those
// books are cataloguing decisions with URL consequences, and they are exactly
// the decisions `scripts/audit-book-duplicates.ts` and `/admin/review` already
// treat as deliberate, audited, human work. So this panel ranks the work and
// stops.
//
// ── What "affected" counts ──────────────────────────────────────────────────
//
// The work count the directory computed, which is the number of public works
// that lose a machine-readable credit while the row stands. It is the right
// ranking key precisely because it is not the number of rows: ten junk rows
// with one book each matter less than one junk row with 621.

import {
  assessContributorName,
  type ContributorTrustReason,
} from "@/lib/resources/contributor-trust";

/** One roster row, as the author directory already computes it. */
export type ContributorRosterRow = {
  slug: string;
  name: string;
  workCount: number;
};

export type ContributorTrustFinding = {
  slug: string;
  name: string;
  workCount: number;
  /** `invalid` is already suppressed publicly; `suspicious` is not. */
  trust: "invalid" | "suspicious";
  reason: ContributorTrustReason;
};

export type ContributorTrustReport = {
  /** Ordered: suppressed rows first, then by how much work rides on them. */
  findings: ContributorTrustFinding[];
  counts: {
    /** Roster rows examined. */
    checked: number;
    /** Rows whose name identifies nobody — already withdrawn from public view. */
    suppressed: number;
    /** Rows flagged for a librarian; nothing about them has changed. */
    flagged: number;
    /** Public works that lost a machine-readable credit. */
    worksAffected: number;
  };
};

/** Findings, ranked, with the totals the panel heads itself with. */
export function buildContributorTrustReport(
  rows: readonly ContributorRosterRow[],
  limit = 25,
): ContributorTrustReport {
  const findings: ContributorTrustFinding[] = [];
  let suppressed = 0;
  let flagged = 0;
  let worksAffected = 0;

  for (const row of rows) {
    const { trust, reason } = assessContributorName(row.name);
    if (trust === "valid" || reason === null) continue;
    if (trust === "invalid") {
      suppressed += 1;
      worksAffected += Math.max(0, row.workCount);
    } else {
      flagged += 1;
    }
    findings.push({ slug: row.slug, name: row.name, workCount: row.workCount, trust, reason });
  }

  // Suppressed before flagged, because only the first has already changed what
  // readers and crawlers see; then by work count, because that is the size of
  // the consequence. The slug breaks every remaining tie so the panel does not
  // reshuffle between two loads of the same data.
  findings.sort(
    (a, b) =>
      Number(b.trust === "invalid") - Number(a.trust === "invalid") ||
      b.workCount - a.workCount ||
      (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
  );

  return {
    findings: findings.slice(0, limit),
    counts: { checked: rows.length, suppressed, flagged, worksAffected },
  };
}
