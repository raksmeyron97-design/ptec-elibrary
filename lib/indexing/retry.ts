/* lib/indexing/retry.ts
 *
 * Whose problem was it, and when — if ever — should we try again?
 *
 * PURE ON PURPOSE. No database, no clock of its own (callers pass `now`), no
 * `server-only`. Deciding that a Gemini quota error is worth retrying and a
 * corrupt PDF is not is the part that must be testable offline, because
 * getting it wrong is expensive in both directions: retry a permanent failure
 * forever and you burn quota on a document that will never parse; give up on
 * a transient one and a book silently stays unsearchable.
 *
 * ── The distinction this file exists for ────────────────────────────────────
 *
 * Migration 0133 recorded WHAT happened. It could not record WHOSE PROBLEM it
 * was, and production immediately produced the case that needs it: a backfill
 * started on a laptop wrote `unfetchable` against 203 healthy books, because
 * `.env.local` pointed `ZIMA_API_URL` at localhost and the SSRF allow-list
 * (correctly) refused every production storage URL. Every component behaved as
 * designed; the health view still reported a lie with total confidence.
 *
 * So `unresolvable-url` and `fetch-failed` — one status in 0133 — are now one
 * status with two kinds:
 *
 *   fetch-failed      the STORAGE said no        → transient  → retry
 *   unresolvable-url  OUR ALLOW-LIST said no     → config     → fix the env
 *
 * Only the first is evidence about the file. A `config` verdict must never
 * overwrite a good state and must never be counted as a fact about the
 * collection — see `shouldOverwrite()`.
 */

import type { IndexStatus } from "./state";

/**
 * Whose problem the failure is.
 *
 *   transient  the world was briefly unavailable — storage 5xx, socket reset,
 *              provider rate limit. Retry with backoff.
 *   permanent  a property of the document — image-only scan, corrupt PDF.
 *              Retrying achieves nothing.
 *   config     our own environment was wrong. Says NOTHING about the resource.
 */
export const FAILURE_KINDS = ["transient", "permanent", "config"] as const;
export type FailureKind = (typeof FAILURE_KINDS)[number];

/** Attempts before a transient failure stops being retried automatically. */
export const MAX_ATTEMPTS = 5;

/**
 * Backoff between attempts, in seconds: ~1m, 5m, 30m, 2h, 6h.
 *
 * The floor is a minute rather than seconds because every failure this retries
 * is an I/O or provider problem that does not resolve inside one; the ceiling
 * is hours rather than days because the reconciler runs hourly and a book
 * nobody can search is a visible defect.
 */
export const BACKOFF_SECONDS = [60, 300, 1_800, 7_200, 21_600] as const;

/**
 * Provider quota exhaustion is transient, and saying so is load-bearing.
 *
 * `gemini-embedding-001`'s free tier enforces a per-DAY cap, so a large
 * backfill is EXPECTED to stop partway. Recording those records as `failed`
 * with no retry — which a naive "an error is an error" mapping does — would
 * permanently abandon every book the run did not reach, and the admin screen
 * would show them as broken documents rather than as work still queued.
 */
const TRANSIENT_PATTERNS = [
  /\bquota\b/i,
  /rate.?limit/i,
  /\b429\b/i,
  /resource_exhausted/i,
  /\btimed?.?out\b/i,
  /\betimedout\b/i,
  /\beconnreset\b/i,
  /\becconnrefused\b/i,
  /\benotfound\b/i,
  /socket hang up/i,
  /network/i,
  /fetch failed/i,
  /\bHTTP 5\d\d\b/,
  /\bHTTP 429\b/,
  /temporarily/i,
  /unavailable/i,
];

/**
 * Failures that are a property of the document. Retrying re-downloads and
 * re-parses the same bytes to reach the same conclusion.
 */
const PERMANENT_PATTERNS = [
  /invalid pdf/i,
  /corrupt/i,
  /password/i,
  /encrypted/i,
  /\bXRef\b/,
  /unexpected end of file/i,
  /no text layer/i,
];

/**
 * Failures caused by OUR deployment or environment rather than by the world
 * or the document.
 *
 * `unresolvable-url` is the one that matters: it is emitted when
 * `toAllowedStorageUrl()` refuses a URL, which — given the URL came out of our
 * own database — means the allow-list and the data disagree, i.e. the process
 * is pointed at the wrong storage host. The module-not-found patterns cover
 * the class that has now bitten twice (`pdf.worker.mjs`, `@napi-rs/canvas`):
 * a file missing from the standalone bundle is a build defect, and calling it
 * a document problem is how five weeks were lost.
 */
const CONFIG_PATTERNS = [
  /unresolvable-url/i,
  /unresolvable_url/i,
  /cannot find module/i,
  /module_not_found/i,
  /is not defined/i,
  /fake worker failed/i,
  /are required/i,
  /not configured/i,
];

/**
 * Classify a failed attempt.
 *
 * Order is deliberate: config first, because a config failure often *looks*
 * like something else ("Cannot find module" is technically a crash), and
 * misfiling it as `permanent` would mark a perfectly good PDF as unusable.
 * Anything unrecognised is `transient` — the safe default is to try again
 * later rather than to abandon a resource on a message we have not seen
 * before, and `MAX_ATTEMPTS` bounds the cost of being wrong.
 */
export function classifyFailure(status: IndexStatus, detail?: string): FailureKind | null {
  if (status === "indexed" || status === "running") return null;
  // A scan is the canonical permanent outcome and needs no message to prove it.
  if (status === "no_text_layer") return "permanent";

  const text = detail ?? "";
  if (CONFIG_PATTERNS.some((re) => re.test(text))) return "config";
  if (PERMANENT_PATTERNS.some((re) => re.test(text))) return "permanent";
  if (TRANSIENT_PATTERNS.some((re) => re.test(text))) return "transient";
  return "transient";
}

/**
 * When may this record be tried again? `null` means "not automatically".
 *
 * `permanent` never reschedules. `config` DOES — an environment gets fixed and
 * redeployed, and the record should heal on its own afterwards rather than
 * waiting for someone to remember it — but it does not consume the attempt
 * budget, because the resource never actually failed. Without that exemption
 * the laptop incident would have burned all five attempts on 203 books and
 * left them permanently un-retried after the environment was corrected.
 */
export function nextAttemptAt(
  kind: FailureKind | null,
  attemptCount: number,
  now: Date,
): Date | null {
  if (kind === null) return null;
  if (kind === "permanent") return null;
  if (kind === "transient" && attemptCount >= MAX_ATTEMPTS) return null;

  const index = Math.min(Math.max(attemptCount - 1, 0), BACKOFF_SECONDS.length - 1);
  const delay = kind === "config" ? BACKOFF_SECONDS[BACKOFF_SECONDS.length - 1] : BACKOFF_SECONDS[index];
  return new Date(now.getTime() + delay * 1000);
}

/**
 * The attempt counter for the next write.
 *
 * A `config` failure does not increment it: the attempt tested our
 * environment, not the resource, and letting it consume the budget is how a
 * misconfigured run permanently exhausts the retries of every record it
 * touches.
 */
export function nextAttemptCount(kind: FailureKind | null, previous: number): number {
  if (kind === null) return 0;
  if (kind === "config") return previous;
  return previous + 1;
}

/**
 * May this outcome replace what is already stored?
 *
 * The one rule with teeth: **a `config` failure never overwrites a state that
 * was not itself a config failure.** A run from a machine pointed at the wrong
 * storage learns nothing about a resource, so it must not be allowed to erase
 * what a correctly configured run established — which is precisely what
 * happened when 203 `indexed`/absent states were replaced by `unfetchable`.
 *
 * Everything else overwrites: the newest real attempt is the current truth.
 */
export function shouldOverwrite(
  incomingKind: FailureKind | null,
  existing: { status: IndexStatus; failureKind: FailureKind | null } | null,
): boolean {
  if (existing === null) return incomingKind !== "config";
  if (incomingKind !== "config") return true;
  return existing.failureKind === "config";
}

/** Is this record due for an automatic retry at `now`? */
export function isDue(
  row: { status: IndexStatus; nextAttemptAt: Date | string | null },
  now: Date,
): boolean {
  if (row.nextAttemptAt === null) return false;
  const due = row.nextAttemptAt instanceof Date ? row.nextAttemptAt : new Date(row.nextAttemptAt);
  return Number.isFinite(due.getTime()) && due.getTime() <= now.getTime();
}

/**
 * How long a `running` claim may stand before another runner may take it.
 *
 * Longer than the slowest realistic extraction (a large scanned PDF over a
 * slow link) and shorter than the cron interval, so a runner killed mid-record
 * is picked up on the next pass instead of stranding the record in `running`
 * for good.
 */
export const STALE_CLAIM_MS = 30 * 60 * 1000;

/** May `now` reclaim a record claimed at `claimedAt`? */
export function isClaimReclaimable(claimedAt: Date | string | null, now: Date): boolean {
  if (claimedAt === null) return true;
  const at = claimedAt instanceof Date ? claimedAt : new Date(claimedAt);
  if (!Number.isFinite(at.getTime())) return true;
  return now.getTime() - at.getTime() >= STALE_CLAIM_MS;
}

/**
 * Work priority for the reconciler, lowest number first.
 *
 * Stale outranks everything: a resource indexed from a PDF that has since been
 * replaced is the only state that is actively WRONG rather than merely absent
 * — search will quote text the current document does not contain. Records
 * never attempted come before failures, because a first attempt is more likely
 * to succeed than a repeat of one that already failed.
 */
export const WORK_PRIORITY = {
  stale: 0,
  never_attempted: 1,
  config: 2,
  transient: 3,
  reclaimed: 4,
} as const;

export type WorkReason = keyof typeof WORK_PRIORITY;

export function compareWork(a: WorkReason, b: WorkReason): number {
  return WORK_PRIORITY[a] - WORK_PRIORITY[b];
}
