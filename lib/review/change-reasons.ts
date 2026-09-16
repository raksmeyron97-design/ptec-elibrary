// lib/review/change-reasons.ts
//
// The structured half of "Request changes".
//
// A free-text box records what one reviewer thought; it cannot answer "what do
// records get sent back FOR?" across a term. So a reviewer now picks from a
// fixed vocabulary AND writes the specifics, and both are kept — but neither
// is kept in a new place:
//
//   - the human sentence goes in `books.review_note` (0086), which is the
//     column the editor already reads and every existing surface already
//     renders. There is no second rejection model.
//   - the reason IDS go in the `admin_audit_log` metadata of the same
//     `content.changes_requested` row the transition already writes, which is
//     where "who did what, when, why" already lives and is already queryable.
//
// The list is short and specific to THIS library's actual failures — a
// vocabulary with twenty entries is one nobody reads to the end of, and a
// reason that never fits a real PTEC record is a reason that gets picked
// because it was first.

export const CHANGE_REASONS = [
  "title",
  "author",
  "isbn",
  "metadata",
  "cover",
  "file",
  "rights",
  "incomplete",
  "other",
] as const;

export type ChangeReason = (typeof CHANGE_REASONS)[number];

/**
 * Canonical English labels.
 *
 * The composed note is STORED, and it is read later by whoever opens the
 * record — possibly months later, possibly in the other language. Composing it
 * from the reviewer's current UI locale would freeze one reader's language
 * into the data, so the stored string uses these and the UI translates the
 * checkboxes it shows. The ids in the audit log are the machine-readable copy
 * and carry no language at all.
 */
export const CHANGE_REASON_LABELS: Record<ChangeReason, string> = {
  title: "Incorrect title",
  author: "Incorrect author or contributor",
  isbn: "Missing or incorrect ISBN",
  metadata: "Incorrect metadata",
  cover: "Cover problem",
  file: "File problem",
  rights: "Rights or licence issue",
  incomplete: "Missing information",
  other: "Other",
};

export function isChangeReason(value: string): value is ChangeReason {
  return (CHANGE_REASONS as readonly string[]).includes(value);
}

/** Drop anything the vocabulary does not contain, and de-duplicate. */
export function normalizeReasons(raw: readonly string[] | undefined): ChangeReason[] {
  if (!raw) return [];
  const seen = new Set<ChangeReason>();
  for (const value of raw) if (isChangeReason(value)) seen.add(value);
  // Stable vocabulary order, not click order: two reviewers picking the same
  // two reasons must produce the same stored note.
  return CHANGE_REASONS.filter((r) => seen.has(r));
}

/**
 * The note as it is stored on the row.
 *
 * Reasons first, then the reviewer's own words — an editor opening the record
 * sees the category before the detail. With no reasons picked it is exactly
 * the free text, which is what every note written before this shipped looks
 * like, so old and new notes render identically.
 */
export function composeChangeNote(reasons: readonly string[] | undefined, note: string): string {
  const picked = normalizeReasons(reasons);
  const text = note.trim();
  if (picked.length === 0) return text;
  const heading = picked.map((r) => CHANGE_REASON_LABELS[r]).join("; ");
  return text ? `${heading} — ${text}` : heading;
}

/**
 * Is this enough to send a record back?
 *
 * Either a reason or a sentence. Requiring both makes "Other" unusable and
 * requiring neither reintroduces the empty rejection that 0086's `review_note`
 * exists to prevent.
 */
export function hasChangeRationale(reasons: readonly string[] | undefined, note: string): boolean {
  return normalizeReasons(reasons).length > 0 || note.trim().length > 0;
}
