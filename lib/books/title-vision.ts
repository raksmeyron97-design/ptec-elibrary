// lib/books/title-vision.ts
//
// Is a title read off a book's own cover safe to write into the catalogue?
//
// PURE. It takes the stored (cut) title and what a vision pass transcribed,
// and returns a verdict. No model call, no I/O — so the rule that decides
// whether a catalogue record is rewritten by a model is testable offline.
//
// ── Why this is a different question from lib/books/title-restore.ts ────────
//
// That module asks "does a candidate from some OTHER list continue this
// title?", and only a verbatim continuation is ever applied, because the pool
// contains other books. Here the pool is one image: the record's OWN cover,
// fetched by its own `cover_url`. Picking the wrong book is not the failure
// mode. Mis-TRANSCRIBING is.
//
// And a continuation test does not fit what covers actually say. Checked
// against production covers on 2026-09-23:
//
//   stored : កម្មវិធីសិក្សាលម្អិត មុខវិជ្ជា បច្ចេកវិទ្យាព័ត៌មាន និងសារគមនាគមន៍
//   cover  : កម្មវិធីសិក្សាលម្អិត … បច្ចេកវិទ្យាគមនាគមន៍និងព័ត៌មាន …
//
// Same book, same opening — and the last two words are SWAPPED, because the
// stored string came from somewhere other than the cover. A prefix test
// refuses that; a head-agreement test does not, and head agreement is the real
// evidence that the transcription describes this record.
//
// ── The four rules ──────────────────────────────────────────────────────────
//
// 1. It must AGREE ON THE HEAD. A cover whose title shares nothing with the
//    stored one is either not a title page or not this book's cover, and
//    either way there is nothing to conclude.
// 2. It must not be SHORTER. The whole point is a title the truncation cut;
//    a transcription that loses text is a worse record, not a better one.
// 3. It must be READABLE KHMER, when it is Khmer. A cover scan can transcribe
//    into correctly-encoded characters that spell nothing, which is the exact
//    failure lib/ai/page-quality.ts refuses for page text — and it would be
//    least noticeable here, in the reader's own language, as a title.
// 4. The model must say it could read the whole title. A partially-legible
//    cover is a review, never an apply.

const KHMER = /[ក-៿]/;

/** Comparison form: NFC, zero-width gone, punctuation and spacing gone.
 *  Khmer writes no spaces between words and covers line-break titles wherever
 *  the design needs, so neither spacing nor punctuation carries meaning for
 *  "is this the same title". */
export function titleKey(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[​‌‍﻿]/g, "")
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "")
    .toLowerCase();
}

function trigrams(value: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + 3 <= value.length; i++) out.add(value.slice(i, i + 3));
  return out;
}

/**
 * How much of the stored title's HEAD the transcription contains.
 *
 * The head, not the whole string: the tail is the part the truncation mangled
 * — it is cut mid-cluster, so its last characters are unreliable by
 * construction (production's `…វិទ្យាសាស្ដ` against a cover printing
 * `…វិទ្យាសាស្ត្រ` differs in the final consonant alone).
 */
export function headAgreement(stored: string, transcribed: string): number {
  const head = titleKey(stored).slice(0, HEAD_CHARS);
  if (head.length < 12) return 0;
  const grams = trigrams(head);
  if (grams.size === 0) return 0;
  const candidate = trigrams(titleKey(transcribed));
  let shared = 0;
  for (const g of grams) if (candidate.has(g)) shared += 1;
  return shared / grams.size;
}

/** Characters of the stored title treated as its head. 45 of 65 leaves the
 *  final third — the part a fixed-length cut damages — out of the comparison,
 *  while still being far too specific to match a different book by accident. */
export const HEAD_CHARS = 45;

/** Head agreement at or above this is the same title. Below it, the cover is
 *  describing something else and nothing is concluded. */
export const HEAD_AGREEMENT_FLOOR = 0.9;

/**
 * Mean length of a Khmer character run.
 *
 * The signal `scripts/audit-khmer-page-text.ts` measured over 20,000
 * production pages: readable Khmer sits at p50 5.98, text that extracted into
 * meaningless fragments at p50 2.27. A title is short, so this is a coarse
 * guard against the worst case rather than a fine one — it is here to stop a
 * transcription that is obviously shredded, not to grade prose.
 */
export const KHMER_RUN_FLOOR = 3.5;

export function meanKhmerRun(value: string): number {
  const runs = value.match(/[ក-៿]+/g) ?? [];
  if (runs.length === 0) return 0;
  return runs.reduce((sum, r) => sum + r.length, 0) / runs.length;
}

/**
 * `unavailable` is not a verdict about the book.
 *
 * The first live run of this pass hit a spending cap, and every record came
 * back "reject — the vision pass read no title": a quota stop recorded as a
 * statement that 191 covers were unreadable. That is the fault-vocabulary
 * mistake lib/verify/http.ts exists to prevent, and it is worse here, because
 * the report is what an operator would read to decide the covers are useless.
 *
 * So a failure to ASK is its own outcome, it never counts as a pass or a
 * defect, and the runner stops rather than spending a whole run producing it.
 */
export type VisionTitleVerdict = "apply" | "review" | "reject" | "unavailable";

export type VisionTitleCheck = {
  verdict: VisionTitleVerdict;
  reason: string;
  agreement: number;
};

export function verifyVisionTitle(input: {
  stored: string;
  transcribed: string | null | undefined;
  /** What the model said about whether the whole title was legible. */
  fullyLegible: boolean;
  /** True when the model could not be reached at all — a quota stop, a
   *  timeout, an outage. Distinct from "the model answered with nothing". */
  unreachable?: boolean;
}): VisionTitleCheck {
  if (input.unreachable) {
    return { verdict: "unavailable", reason: "the vision model could not be reached", agreement: 0 };
  }
  const transcribed = (input.transcribed ?? "").replace(/\s+/g, " ").trim();
  if (!transcribed) {
    return { verdict: "reject", reason: "the model answered, and read no title on this cover", agreement: 0 };
  }

  const agreement = headAgreement(input.stored, transcribed);
  if (agreement < HEAD_AGREEMENT_FLOOR) {
    return {
      verdict: "reject",
      reason: `the cover's title shares only ${(agreement * 100).toFixed(0)}% of the stored title's opening — this is not the same title`,
      agreement,
    };
  }

  if (titleKey(transcribed).length <= titleKey(input.stored).length) {
    return {
      verdict: "reject",
      reason: "the transcription is no longer than the stored title, so it restores nothing",
      agreement,
    };
  }

  if (KHMER.test(transcribed) && meanKhmerRun(transcribed) < KHMER_RUN_FLOOR) {
    return {
      verdict: "reject",
      reason: `the Khmer transcribed into fragments (mean run ${meanKhmerRun(transcribed).toFixed(2)}), which is how unreadable text looks`,
      agreement,
    };
  }

  if (!input.fullyLegible) {
    return {
      verdict: "review",
      reason: "the model could not read the whole title off the cover",
      agreement,
    };
  }

  return {
    verdict: "apply",
    reason: `the cover's title agrees with ${(agreement * 100).toFixed(0)}% of the stored opening and carries more of it`,
    agreement,
  };
}
