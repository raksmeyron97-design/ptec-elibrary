"use server";

import { createClient } from "@/lib/supabase/server";
import { changedRow, NO_MATCH_MESSAGE } from "@/lib/db/changed-row";
import type { ResourceRecordType } from "@/app/actions/reading-lists";

/**
 * Reader bookmarks (migration 0141).
 *
 * These used to live only in `localStorage` under `ebook:bm:<bookId>`, which
 * means a student lost every one of them by clearing site data, by using a
 * different browser, or by reading on a shared machine — silently, with no
 * moment at which anything told them it had happened. Annotations (0047) and
 * collections (0136) were already server-side; bookmarks were the last
 * per-page thing a reader creates that lived nowhere durable.
 *
 * EVERY MUTATION HERE REPORTS WHAT ACTUALLY CHANGED, through `changedRow()`
 * (`lib/db/changed-row.ts`), which owns the reasoning: PostgREST answers a
 * statement that matched nothing with 204 / error:null / data:null, which is
 * byte-for-byte a successful write. Delete and update then answer DIFFERENTLY
 * on a zero-row result, and each says why below.
 *
 * OWNERSHIP is enforced twice, deliberately: every statement is scoped
 * `.eq("user_id", user.id)`, AND these run through the cookie-bound client, so
 * the table's RLS policy (`user_id = auth.uid()`) is live rather than bypassed.
 * A service client would silently make the `.eq` the only thing standing
 * between two readers.
 */

export type ReaderBookmark = {
  id: string;
  page_number: number;
  /** A name the reader gave this page. Null is the common case — the value of
      a bookmark is that it costs one tap; the panel falls back to the nearest
      outline heading, then to the page number. */
  label: string | null;
  created_at: string;
};

export type BookmarkResult =
  | { success: true; bookmark?: ReaderBookmark; removed?: boolean }
  | { success: false; error: string };

const MAX_LABEL_LENGTH = 120;
/** One reader cannot meaningfully use more than this in one document, and the
    cap keeps a scripted client from turning the panel into a scroll. */
const MAX_BOOKMARKS_PER_RECORD = 500;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECORD_TYPES: readonly ResourceRecordType[] = ["book", "research", "publication"];

const SELECT = "id, page_number, label, created_at";

function validate(
  recordType: string,
  recordId: string,
  page?: number,
): string | null {
  if (!RECORD_TYPES.includes(recordType as ResourceRecordType)) return "Unknown resource type.";
  if (!UUID_RE.test(recordId)) return "Invalid resource.";
  if (page !== undefined && (!Number.isFinite(page) || page < 1 || Math.floor(page) !== page)) {
    return "Invalid page.";
  }
  return null;
}

/** This reader's bookmarks in one document, in page order. */
export async function getReaderBookmarks(
  recordType: ResourceRecordType,
  recordId: string,
): Promise<ReaderBookmark[]> {
  if (validate(recordType, recordId)) return [];

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("reader_bookmarks")
    .select(SELECT)
    .eq("user_id", user.id)
    .eq("record_type", recordType)
    .eq("record_id", recordId)
    .order("page_number", { ascending: true })
    .limit(MAX_BOOKMARKS_PER_RECORD);

  if (error) {
    console.error("[getReaderBookmarks]", error.message);
    return [];
  }
  return (data ?? []) as ReaderBookmark[];
}

/**
 * Add a bookmark to a page, or report the one already there.
 *
 * The unique index on `(user_id, record_type, record_id, page_number)` is what
 * makes this idempotent: a double-tap, or the same page bookmarked from two
 * tabs, produces one row and a plain success rather than an error the panel
 * would have to explain.
 */
export async function addReaderBookmark(
  recordType: ResourceRecordType,
  recordId: string,
  page: number,
  label?: string | null,
): Promise<BookmarkResult> {
  const invalid = validate(recordType, recordId, page);
  if (invalid) return { success: false, error: invalid };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const trimmed = label?.trim().slice(0, MAX_LABEL_LENGTH) || null;

  const { data, error } = await supabase
    .from("reader_bookmarks")
    .insert({
      user_id: user.id,
      record_type: recordType,
      record_id: recordId,
      page_number: page,
      label: trimmed,
    })
    .select(SELECT)
    .maybeSingle();

  if (error?.code === "23505") {
    // Already bookmarked. Return the existing row so the caller's state ends
    // up correct rather than merely un-errored.
    const { data: existing } = await supabase
      .from("reader_bookmarks")
      .select(SELECT)
      .eq("user_id", user.id)
      .eq("record_type", recordType)
      .eq("record_id", recordId)
      .eq("page_number", page)
      .maybeSingle();
    return existing
      ? { success: true, bookmark: existing as ReaderBookmark }
      : { success: false, error: "Could not save bookmark." };
  }

  if (error || !data) {
    console.error("[addReaderBookmark]", error?.message);
    return { success: false, error: "Could not save bookmark." };
  }
  return { success: true, bookmark: data as ReaderBookmark };
}

/**
 * Remove the bookmark on a page.
 *
 * `removed` says whether a row actually went. False is not a failure — the
 * page was not bookmarked, and the caller's desired state (no bookmark here)
 * holds either way — but it is the difference between "we deleted it" and "it
 * was not there", and only the second is safe to report as a no-op.
 */
export async function removeReaderBookmark(
  recordType: ResourceRecordType,
  recordId: string,
  page: number,
): Promise<BookmarkResult> {
  const invalid = validate(recordType, recordId, page);
  if (invalid) return { success: false, error: invalid };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const result = changedRow(
    await supabase
      .from("reader_bookmarks")
      .delete()
      .eq("user_id", user.id)
      .eq("record_type", recordType)
      .eq("record_id", recordId)
      .eq("page_number", page)
      .select("id"),
  );

  if (!result.ok && result.reason === "error") {
    console.error("[removeReaderBookmark]", result.message);
    return { success: false, error: "Could not remove bookmark." };
  }
  return { success: true, removed: result.ok };
}

/**
 * Name a bookmark, or clear its name (an empty label is null, not "").
 *
 * A zero-row update is reported as a FAILURE here, unlike the delete above.
 * The two differ in what the caller wanted: a delete that finds nothing has
 * still reached the requested state, whereas a rename that matches nothing has
 * not — the label the reader typed is not stored anywhere, and telling them it
 * was is how a note is lost.
 */
export async function setReaderBookmarkLabel(
  bookmarkId: string,
  label: string,
): Promise<BookmarkResult> {
  if (!UUID_RE.test(bookmarkId)) return { success: false, error: "Invalid bookmark." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const trimmed = label.trim().slice(0, MAX_LABEL_LENGTH) || null;

  const result = changedRow<ReaderBookmark>(
    await supabase
      .from("reader_bookmarks")
      .update({ label: trimmed })
      .eq("id", bookmarkId)
      .eq("user_id", user.id)
      .select(SELECT),
  );

  if (!result.ok) {
    if (result.reason === "error") {
      console.error("[setReaderBookmarkLabel]", result.message);
      return { success: false, error: "Could not rename bookmark." };
    }
    return { success: false, error: NO_MATCH_MESSAGE };
  }
  return { success: true, bookmark: result.row };
}

/**
 * Reconcile this device's `localStorage` bookmarks with the account, once per
 * document, and report who the account is.
 *
 * THE OWNERSHIP DECISION IS MADE HERE, not in the browser, because this is
 * where identity is actually known. A shared lab machine has one localStorage
 * per origin and many readers: without this check, the next student to sign in
 * would upload the previous student's bookmarks into their own account on
 * first sync — silently, and with no way to tell afterwards which pages were
 * whose. `lib/offline.ts` stamps downloaded books with their owning account
 * for the same reason.
 *
 * Three cases, and the middle one is the whole point:
 *
 *   • `localOwner` is null — a record written before 0141. Trusted and
 *     claimed: those pages predate multi-account sync, and they were already
 *     visible to everyone using that browser, so uploading them is no worse
 *     than the status quo and is what carries an existing reader's bookmarks
 *     into their account.
 *   • `localOwner` is SOMEONE ELSE — not uploaded, at all. The caller is given
 *     this account's own bookmarks and told the new owner, and overwrites its
 *     local record with them.
 *   • `localOwner` is this account — the ordinary path.
 *
 * Pages already bookmarked server-side keep their labels: `ignoreDuplicates`
 * means an existing row is left alone rather than having its label nulled by a
 * device that never knew about it.
 */
export async function syncReaderBookmarks(
  recordType: ResourceRecordType,
  recordId: string,
  localPages: number[],
  localOwner: string | null,
): Promise<{ ownerKey: string | null; bookmarks: ReaderBookmark[] }> {
  if (validate(recordType, recordId)) return { ownerKey: null, bookmarks: [] };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ownerKey: null, bookmarks: [] };

  const mine = localOwner === null || localOwner === user.id;
  const clean = mine
    ? [...new Set(localPages)]
        .filter((p) => Number.isFinite(p) && p >= 1 && Math.floor(p) === p)
        .slice(0, MAX_BOOKMARKS_PER_RECORD)
    : [];

  if (clean.length > 0) {
    const { error } = await supabase.from("reader_bookmarks").upsert(
      clean.map((page_number) => ({
        user_id: user.id,
        record_type: recordType,
        record_id: recordId,
        page_number,
      })),
      { onConflict: "user_id,record_type,record_id,page_number", ignoreDuplicates: true },
    );
    // A failed upload must not lose the device's bookmarks: the caller keeps
    // its local set and the next open tries again.
    if (error) console.error("[syncReaderBookmarks]", error.message);
  }

  return {
    ownerKey: user.id,
    bookmarks: await getReaderBookmarks(recordType, recordId),
  };
}
