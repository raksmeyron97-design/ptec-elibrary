// lib/analytics/counting.ts
//
// WHAT THE PUBLIC LIFETIME COUNTERS ARE ALLOWED TO COUNT.
//
// `books.view_count` and `books.download_count` are the two numbers a reader
// sees on a book card, so they have to mean the same kind of thing. They did
// not: a card showing "4 views / 11 downloads" was not a book people download
// without reading, it was one counter working and the other frozen — the view
// RPC was called with an argument name no function has, and unlike the
// download path it had no fallback to hide it (see app/actions/view-count.ts).
//
// Once both counters work, the remaining way they can disagree is the RULE
// each one applies. So there is one rule here and both call it:
//
//   one event per viewer per rolling 24 hours, bots never counted.
//
// A ROLLING WINDOW, NOT "TODAY". A UTC day boundary falls at 07:00 in Phnom
// Penh — the middle of a reader's morning. A student opening a book at 06:55
// and again at 07:05 would be two views of one reading session, and the
// library's own peak hours would sit either side of the seam. A rolling
// window has no seam to sit on.
//
// A VIEWER WITH NO IDENTITY IS NOT COUNTED. The dedupe key is the signed-in
// user id, or the daily-rotating anonymous session hash. That hash is null
// only when the HMAC secret is missing (lib/search/analytics.ts), and without
// a key there is nothing to deduplicate against — counting anyway would make
// the badge a refresh counter. Refusing is the safe direction: it is visible
// as a flat number, where inflation is not.
//
// Pure on purpose — no server-only imports — so the rules that decide a
// public number are unit-testable offline. lib/analytics/counting.test.ts.

/** One event per viewer per rolling 24 hours. */
export const COUNT_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * ISO timestamp marking the start of the dedupe window — the `>=` bound for
 * the `viewed_at` / `downloaded_at` lookup.
 */
export function dedupeWindowStart(now: Date = new Date()): string {
  return new Date(now.getTime() - COUNT_DEDUPE_WINDOW_MS).toISOString();
}

/**
 * Which column identifies this viewer in the log table. A signed-in reader is
 * their account on every device; an anonymous one is the daily session hash.
 * Never both: a reader who signs in mid-session would otherwise be counted
 * once as a guest and once as themselves.
 */
export type ViewerIdentity =
  | { column: "user_id"; value: string }
  | { column: "session_hash"; value: string };

export function viewerIdentity(viewer: {
  userId: string | null;
  sessionHash: string | null;
}): ViewerIdentity | null {
  if (viewer.userId) return { column: "user_id", value: viewer.userId };
  if (viewer.sessionHash) return { column: "session_hash", value: viewer.sessionHash };
  return null;
}

/**
 * Why a lifetime counter did or did not move. Every branch is named so the
 * telemetry can tell "nobody read it" from "we refused to count it".
 */
export type CountOutcome = "count" | "bot" | "repeat" | "unidentified";

export function decideLifetimeCount(input: {
  isBot: boolean;
  identity: ViewerIdentity | null;
  /** True when this viewer already moved the counter inside the window. */
  countedWithinWindow: boolean;
}): CountOutcome {
  if (input.isBot) return "bot";
  if (!input.identity) return "unidentified";
  if (input.countedWithinWindow) return "repeat";
  return "count";
}
