import { createHash } from "node:crypto";

/**
 * The identity of a duplicate GROUP, for the purpose of remembering that a
 * librarian has already judged it.
 *
 * Not the group's `key`: that is the union-find root, an implementation detail
 * that changes the moment an unrelated record joins the cluster. Not a pair of
 * book ids either: union-find is transitive, so dismissing (A,B) while both
 * still match C would leave A and B in one group through C and the dismissal
 * would appear to do nothing.
 *
 * What is stable, and what the reviewer actually looked at, is the MEMBERSHIP.
 * Sorting before hashing makes the fingerprint independent of the order the
 * detector happened to emit; changing the membership changes the fingerprint,
 * so the group comes back — correctly, because a group with a new record in it
 * is a new question.
 *
 * Server-only (`node:crypto`). The browser never computes one — the page passes
 * each group's fingerprint down as a string and the client hands it straight
 * back to the Server Action, which re-derives nothing.
 */
export function duplicateGroupFingerprint(bookIds: readonly string[]): string {
  const sorted = [...bookIds].map((id) => id.trim().toLowerCase()).sort();
  return createHash("sha256").update(sorted.join(":")).digest("hex");
}
