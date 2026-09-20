// lib/books/restricted.ts
//
// Which books may NOT have their text quoted, cited by page, or used to
// ground an answer (migration 0151, `file_access = 'catalogue_only'`).
//
// Lives beside lib/books/access.ts, not under lib/ai/, because it is a fact
// about BOOKS that two different subsystems need: the assistant's evidence
// legs and native search's "found inside" page hits. One set, one rule.
//
// ── Why this needs a module at all ───────────────────────────────────────────
//
// The evidence legs query `book_pages` and `book_chunks` directly, and those
// tables have no foreign key to `books` — they are polymorphic over
// `(record_type, record_id)` like every other index table here. So there is
// no join to hang a policy on, and a per-row lookup would be an N+1 against
// the hottest path in the AI.
//
// One small set, resolved once and cached under the tag the book save path
// already fires, is the same shape as lib/learning-paths/membership-index.ts:
// the whole answer for the whole library costs less than one book's page rows.
//
// ── The record stays; the CONTENTS stop ──────────────────────────────────────
//
// A catalogue-only book is still in the library. It is still findable by
// title, still recommendable, still a legitimate answer to "do you have X".
// What stops is republishing what is inside it.
//
// ── Fail-closed, and what that costs ─────────────────────────────────────────
//
// If this read fails, callers must suppress BOOK evidence rather than admit
// it. This is a rights boundary, not a quality gate: admitting text the
// library has withdrawn is not a degraded answer, it is the thing the
// setting exists to prevent. The practical cost is near zero, because the
// read that failed is against the same database the rest of the request
// needs anyway — answers degrade to catalogue level for as long as the
// database is unreachable, which is also how long they would have been
// degraded regardless.

import "server-only";

import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";

export type RestrictedBooks =
  /** The set is known. Empty is a real answer: nothing is restricted. */
  | { ok: true; ids: ReadonlySet<string> }
  /** The set could NOT be determined. Callers must suppress book evidence. */
  | { ok: false; ids: null };

/**
 * A `column does not exist` error is not a failure to answer — it is a
 * database on which no book CAN be catalogue-only, because the column that
 * would say so has not been created. That is a certainty, not a guess, so it
 * resolves to the empty set rather than to fail-closed. Without this, a
 * deploy that reaches a pre-0151 database would suppress every book's
 * evidence across the whole assistant.
 */
function columnMissing(error: { code?: string; message?: string }): boolean {
  return error.code === "42703" || /file_access/i.test(error.message ?? "");
}

const loadRestrictedBookIds = unstable_cache(
  async (): Promise<string[]> => {
    const db = createServiceClient();
    const { data, error } = await db
      .from("books")
      .select("id")
      .eq("file_access", "catalogue_only");

    if (error) {
      if (columnMissing(error)) return [];
      // THROWN, never returned: unstable_cache stores what a function
      // returns, so returning a failure here would persist it for the whole
      // revalidate window — the poisoned-entry trap SEO 4.0 §5.2d recorded
      // against getCollectionStats(). A throw propagates and caches nothing.
      throw new Error(`restricted-book read failed: ${error.message}`);
    }
    return (data ?? []).map((r) => r.id as string);
  },
  ["ai-restricted-book-ids"],
  // The `books` tag is fired by revalidateBook() on every save, so a
  // librarian's change takes effect on the next request rather than at the
  // end of a timer. The hour is only a backstop.
  { revalidate: 3600, tags: ["books"] },
);

export async function getRestrictedBookIds(): Promise<RestrictedBooks> {
  try {
    return { ok: true, ids: new Set(await loadRestrictedBookIds()) };
  } catch {
    return { ok: false, ids: null };
  }
}

/** A row far enough along to be judged: which record does it come from? */
export interface RecordRef {
  record_type: string;
  record_id: string;
}

/**
 * Drop every row belonging to a book whose contents may not be republished.
 *
 * When the set is unknown, EVERY book row is dropped — the fail-closed half.
 * Rows from theses, publications and anything else are untouched: 0151 is a
 * policy on `books`, and applying it to resources it does not describe would
 * be a different bug.
 */
export function dropRestrictedRows<T extends RecordRef>(
  rows: readonly T[],
  restricted: RestrictedBooks,
): T[] {
  if (restricted.ok && restricted.ids.size === 0) return [...rows];
  return rows.filter((r) => {
    if (r.record_type !== "book") return true;
    return restricted.ok ? !restricted.ids.has(r.record_id) : false;
  });
}

/** The ids as an array, for passing to an RPC. Empty when unknown. */
export function restrictedIdList(restricted: RestrictedBooks): string[] {
  return restricted.ok ? [...restricted.ids] : [];
}
