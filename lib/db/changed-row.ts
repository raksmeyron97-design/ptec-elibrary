// lib/db/changed-row.ts
//
// "Did that mutation actually change anything?" — as a value, not an
// assumption.
//
// PostgREST answers an UPDATE or DELETE whose predicate matched no row with
// `204 No Content`: `error` is null, `data` is null, `count` is null. Measured
// against production:
//
//   UPDATE …eq(id, <ghost>) →  error: null · status: 204 · data: null
//   DELETE …eq(id, <ghost>) →  error: null · status: 204 · data: null
//
// That is byte-for-byte what a successful single-row update returns, so
// `if (error) fail()` cannot tell "saved" from "that row is not yours" or
// "that row is gone". Every mutation guarded only by an ownership predicate —
// `.eq("user_id", user.id)` — therefore reported success for a row belonging
// to someone else, and the caller told the reader their edit was saved.
//
// Adding `.select(...)` changes the answer to the rows the statement actually
// touched, which is the only thing that distinguishes the three cases. This
// module is the shape of that answer; it is pure, so the decision it encodes
// is testable without a database.

/** What a mutation did, once it was asked to report its rows. */
export type ChangedRow<T> =
  | { ok: true; row: T }
  /** The database refused the statement. */
  | { ok: false; reason: "error"; message: string }
  /** The statement ran and matched nothing: wrong owner, or already gone. */
  | { ok: false; reason: "no_match" };

/**
 * Interpret a PostgREST mutation that was asked for its rows via `.select()`.
 *
 * Passing a result WITHOUT `.select()` is the mistake this exists to prevent,
 * and it is reported as `no_match` rather than silently as success — a caller
 * that forgets the `.select()` gets a loud failure in development instead of
 * the false "saved" it had before.
 */
export function changedRow<T>(result: {
  data: T[] | T | null;
  error: { message: string } | null;
}): ChangedRow<T> {
  if (result.error) return { ok: false, reason: "error", message: result.error.message };
  const rows = result.data == null ? [] : Array.isArray(result.data) ? result.data : [result.data];
  if (rows.length === 0) return { ok: false, reason: "no_match" };
  return { ok: true, row: rows[0] };
}

/**
 * The message a reader should see when their own row did not match.
 *
 * One sentence for both causes on purpose: the row count cannot separate
 * "someone else's" from "already deleted", and guessing in the copy would
 * either accuse the reader or hide a real permission problem.
 */
export const NO_MATCH_MESSAGE =
  "That item no longer exists, or it is not yours to change.";
