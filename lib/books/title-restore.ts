// lib/books/title-restore.ts
//
// Can a truncated title be restored from a candidate source, and how sure are
// we?
//
// PURE. It is handed one cut title and a pool of candidate full titles, and it
// answers with a proposal and a confidence. It reads nothing and writes
// nothing — `scripts/repair-truncated-titles.ts` does the I/O — so the rule
// that decides whether a catalogue record is rewritten is testable offline.
//
// ── The one thing that makes this hard ──────────────────────────────────────
//
// What the truncation REMOVED is exactly what distinguishes one record from
// the next. This collection is mostly grade-numbered textbook series, so a cut
// title is a shared frame with the discriminator gone:
//
//   កម្រងវិញ្ញាសាប្រឡងសញ្ញាបត្រមធ្យមសិក្សាទុតិយភូមិ ថ្នាក់វិទ្យាសាស្រ|
//                                                                    ↑ cut
//
// A fuzzy matcher handed that string and a pool containing every member of the
// series will score them all ~0.9 and pick one. Measured against the PTEC
// physical-catalogue export on 2026-09-23, the two best non-prefix matches for
// two different cut titles were both the WRONG member of a series — one would
// have retitled a social-science paper as a mathematics one.
//
// So the rule is not "find the closest". It is:
//
//   exact      ONE candidate continues this title verbatim. Appliable.
//   ambiguous  SEVERAL candidates continue it. Refused — the evidence that
//              would choose between them is the evidence that was destroyed.
//   review     no continuation, but one candidate is very close. Proposed for
//              a human, never applied.
//   none       nothing close enough to say anything.
//
// Being wrong by refusing leaves a title that is already visibly cut. Being
// wrong by applying writes a DIFFERENT book's title onto this record, changes
// its slug, and 301s a real textbook's URL. Those costs are not comparable,
// which is why only a verbatim continuation is ever applied automatically.

import { TITLE_TRUNCATION_LENGTH } from "@/lib/admin/catalogue-text-report";

export { TITLE_TRUNCATION_LENGTH };

/** A possible full title, with whatever provenance the source could give. */
export type TitleCandidate = {
  title: string;
  /** Where it came from — "pmb-csv", "book-pages", … Carried into the report
   *  so a proposal can always be traced back to a row somebody can open. */
  source: string;
  author?: string | null;
  barcode?: string | null;
};

export type RestoreConfidence = "exact" | "ambiguous" | "review" | "none";

export type RestoreProposal = {
  /** The record's current, cut title. */
  current: string;
  /** What it would become. Null for every confidence but `exact`. */
  proposed: string | null;
  confidence: RestoreConfidence;
  /** One sentence a human can act on, in English, for the report. */
  reason: string;
  /** Everything that scored, best first, so a refusal can be reviewed. */
  candidates: { title: string; source: string; score: number; continues: boolean }[];
};

/**
 * Comparison form: NFC, zero-width characters removed, whitespace collapsed.
 *
 * Zero-width spaces matter here and are not cosmetic — 43 of production's 191
 * cut titles carry them, and the same title exported from the library system
 * carries them in different places, so a byte comparison finds nothing.
 * They are removed for COMPARISON only; a restored title keeps the candidate's
 * own characters exactly as the source wrote them.
 */
export function comparable(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[​‌‍﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Character trigrams. Script-agnostic on purpose: Khmer has no word
 *  boundaries, so a token measure cannot see inside a Khmer title at all. */
function trigrams(value: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + 3 <= value.length; i++) out.add(value.slice(i, i + 3));
  return out;
}

/** How much of the CUT title's shape the candidate contains. Containment, not
 *  Jaccard: the candidate is legitimately much longer, and Jaccard would
 *  punish it for exactly the extra text we are looking for. */
function containment(cut: Set<string>, candidate: Set<string>): number {
  if (cut.size === 0) return 0;
  let shared = 0;
  for (const g of cut) if (candidate.has(g)) shared += 1;
  return shared / cut.size;
}

/** A title the cut length says was cut. Code points — see TITLE_TRUNCATION_LENGTH. */
export function looksTruncated(title: string | null | undefined): boolean {
  return !!title && [...title].length === TITLE_TRUNCATION_LENGTH;
}

/**
 * Score a candidate above this and it is worth showing a human; nothing below
 * it is reported at all.
 *
 * 0.80, measured: across the 191 production cut titles scored against 2,623
 * candidate titles, the median BEST score was 0.42 — that is the noise floor
 * of "two Khmer education titles share vocabulary". Everything that turned out
 * to be a real relationship scored above 0.80, and everything between 0.42 and
 * 0.80 was a different book in the same series or on the same subject.
 */
export const REVIEW_THRESHOLD = 0.8;

/**
 * Propose a restoration for one cut title.
 *
 * `candidates` may be the whole source pool; this filters it. Callers pass the
 * whole pool because the ambiguity rule has to see every continuation, not the
 * first one found.
 */
export function proposeRestoredTitle(
  current: string,
  candidates: readonly TitleCandidate[],
): RestoreProposal {
  const cut = comparable(current);
  const cutGrams = trigrams(cut);

  const scored = candidates
    .map((c) => {
      const cand = comparable(c.title);
      return {
        title: c.title,
        source: c.source,
        // A continuation must be strictly LONGER: a candidate equal to the cut
        // title restores nothing, and one that is shorter is a different, also
        // truncated record.
        continues: cand.length > cut.length && cand.startsWith(cut),
        score: containment(cutGrams, trigrams(cand)),
      };
    })
    .filter((c) => c.continues || c.score >= REVIEW_THRESHOLD)
    .sort((a, b) => Number(b.continues) - Number(a.continues) || b.score - a.score);

  const continuations = scored.filter((c) => c.continues);

  if (continuations.length === 1) {
    return {
      current,
      proposed: continuations[0].title,
      confidence: "exact",
      reason: `one candidate in ${continuations[0].source} continues this title verbatim`,
      candidates: scored,
    };
  }

  if (continuations.length > 1) {
    // The dangerous case, and the reason this function exists. Several full
    // titles begin with the same 65 characters, and the text that told them
    // apart is the text the cut removed. Picking the longest, the first or the
    // most similar would each be a guess wearing a confidence score.
    const distinct = new Set(continuations.map((c) => comparable(c.title)));
    return {
      current,
      proposed: null,
      confidence: "ambiguous",
      reason: `${distinct.size} different titles continue this one — the text that would choose between them is the text the truncation removed`,
      candidates: scored,
    };
  }

  if (scored.length > 0) {
    return {
      current,
      proposed: null,
      confidence: "review",
      reason: `no candidate continues this title; the closest (${scored[0].score.toFixed(2)}) differs from it before the cut, so it is a related record rather than this one`,
      candidates: scored,
    };
  }

  return {
    current,
    proposed: null,
    confidence: "none",
    reason: "no candidate scored above the noise floor for this collection",
    candidates: [],
  };
}

export type RestoreSummary = {
  examined: number;
  exact: number;
  ambiguous: number;
  review: number;
  none: number;
};

export function summarize(proposals: readonly RestoreProposal[]): RestoreSummary {
  return {
    examined: proposals.length,
    exact: proposals.filter((p) => p.confidence === "exact").length,
    ambiguous: proposals.filter((p) => p.confidence === "ambiguous").length,
    review: proposals.filter((p) => p.confidence === "review").length,
    none: proposals.filter((p) => p.confidence === "none").length,
  };
}
