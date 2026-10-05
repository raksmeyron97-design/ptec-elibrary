import "server-only";
/**
 * Reads for the Physical Library review (docs/CATALOG-REVIEW.md). Server-only:
 * catalog_review_state is service-role only, and every caller has already
 * passed its route or action guard and hands its client in.
 *
 * The queue is ONE ordered list per request — the records' ids, titles, call
 * numbers and languages plus the review rows — from which the page derives its
 * list, its counts and the current record's previous/next. At PTEC's size
 * (2,639 records, three 1,000-row pages) that is cheaper than a query per
 * question, and it means the counts, the list and the navigation cannot
 * disagree about one record. A read that fails or is cut short is reported, and
 * the page says so rather than presenting a partial queue as the whole one.
 */
import { createHash } from "node:crypto";
import type { createServiceClient } from "@/lib/supabase/server";
import { CATALOG_SCAN_CAP } from "@/lib/catalog";
import { chunked, pagedScan } from "@/lib/db/paged-scan";
import {
  REVIEW_ROW_COLUMNS,
  fingerprintInput,
  reviewQueueOf,
  reviewRowFromDb,
  type DbReviewRow,
  type FingerprintFields,
  type QueueItem,
  type ReviewQueue,
  type ReviewRow,
} from "./review";

type Db = ReturnType<typeof createServiceClient>;

export function reviewFingerprint(book: FingerprintFields): string {
  return createHash("sha256").update(fingerprintInput(book), "utf8").digest("hex");
}

/** PostgREST's "relation does not exist" — the window before 0169 is applied. */
const isMissingTable = (code: string | undefined) => code === "42P01" || code === "PGRST205";

export type ReviewRowsResult =
  | { ok: true; rows: Map<string, ReviewRow> }
  | { ok: false; missingTable: boolean; message: string };

/** Every review row. The table holds at most one row per record. */
export async function loadReviewRows(supabase: Db): Promise<ReviewRowsResult> {
  const scan = await pagedScan<DbReviewRow>(
    (from, to) =>
      supabase.from("catalog_review_state").select(REVIEW_ROW_COLUMNS).order("book_id", { ascending: true }).range(from, to),
    CATALOG_SCAN_CAP,
  );
  if (scan.error) return { ok: false, missingTable: isMissingTable(scan.error.code), message: scan.error.message ?? "read failed" };
  if (scan.truncated) return { ok: false, missingTable: false, message: "the review table is larger than one scan may read" };
  return { ok: true, rows: new Map(scan.data.map((r) => [r.book_id, reviewRowFromDb(r)])) };
}

export async function loadReviewRow(supabase: Db, bookId: string): Promise<{ ok: true; row: ReviewRow | null } | { ok: false; missingTable: boolean; message: string }> {
  const { data, error } = await supabase.from("catalog_review_state").select(REVIEW_ROW_COLUMNS).eq("book_id", bookId).maybeSingle();
  if (error) return { ok: false, missingTable: isMissingTable(error.code), message: error.message };
  return { ok: true, row: data ? reviewRowFromDb(data as DbReviewRow) : null };
}

type BookIndexRow = { id: string; title: string; author: string | null; language: string | null; ddc: string | null; is_active: boolean };

export type ReviewIndex =
  | { ok: true; items: QueueItem[] }
  | { ok: false; missingTable: boolean; message: string };

/**
 * The records of one queue (or of the whole catalogue, for the counts) with
 * their review rows. The language filter runs in the database AND again here
 * through reviewQueueOf, so a value the SQL filter would let through (an empty
 * string) still cannot reach a queue it does not belong to.
 */
export async function loadReviewIndex(supabase: Db, queue: ReviewQueue | null): Promise<ReviewIndex> {
  const scan = await pagedScan<BookIndexRow>((from, to) => {
    let q = supabase.from("catalog_books").select("id, title, author, language, ddc, is_active");
    if (queue === "km") q = q.eq("language", "km");
    else if (queue === "en") q = q.neq("language", "km");
    return q.order("id", { ascending: true }).range(from, to);
  }, CATALOG_SCAN_CAP);
  if (scan.error) return { ok: false, missingTable: false, message: scan.error.message ?? "read failed" };
  if (scan.truncated) return { ok: false, missingTable: false, message: "the catalogue is larger than one scan may read" };

  const rows = await loadReviewRows(supabase);
  if (!rows.ok) return rows;

  const items: QueueItem[] = [];
  for (const b of scan.data) {
    if (queue && reviewQueueOf(b.language) !== queue) continue;
    items.push({
      id: b.id,
      title: b.title,
      author: b.author,
      language: b.language,
      callNumber: b.ddc,
      isActive: b.is_active,
      review: rows.rows.get(b.id) ?? null,
    });
  }
  return { ok: true, items };
}

/** Display names for the people a page mentions (claim holders, reviewers). Unknown ids are simply absent. */
export async function loadProfileNames(supabase: Db, ids: readonly (string | null | undefined)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((v): v is string => !!v))];
  const out = new Map<string, string>();
  for (const part of chunked(wanted)) {
    const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", part);
    for (const p of (data ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
      const name = p.full_name?.trim() || p.email?.split("@")[0] || null;
      if (name) out.set(p.id, name);
    }
  }
  return out;
}
