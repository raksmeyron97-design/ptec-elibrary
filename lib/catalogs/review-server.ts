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
  PROVENANCE_FIELDS,
  canonicalValue,
  provenanceView,
  readFieldSources,
  type ProvenanceField,
  type ProvenanceRecord,
  type ProvenanceView,
} from "./provenance";
import { duplicateClusters, duplicateGroups, reviewTasks, type CopySummary, type ReviewTask, type ReviewTaskId } from "./review-tasks";
import type { DuplicateGroup } from "@/lib/admin/duplicates";
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

type BookIndexRow = {
  id: string;
  title: string;
  author: string | null;
  language: string | null;
  ddc: string | null;
  is_active: boolean;
  category: string | null;
  department: string | null;
  shelf_location: string | null;
  isbn: string | null;
  publisher: string | null;
  year: number | null;
  cover_url: string | null;
  description: string | null;
  catalog_copies: { status: string | null; shelf_location: string | null }[] | null;
};

const INDEX_COLUMNS =
  "id, title, author, language, ddc, is_active, category, department, shelf_location, isbn, publisher, year, cover_url, description, catalog_copies(status, shelf_location)";

export type ReviewIndex =
  | {
      ok: true;
      items: QueueItem[];
      /** Records carrying the duplicate TASK → the other members of their group. */
      duplicates: Map<string, string[]>;
      /** Every possible-duplicate group, low confidence included (the duplicates view). */
      clusters: DuplicateGroup[];
      /** Every record's language and call number, for a group whose members sit in different queues. */
      records: Map<string, { title: string; author: string | null; language: string | null; callNumber: string | null; isbn: string | null; year: number | null }>;
    }
  | { ok: false; missingTable: boolean; message: string };

/** Copies a reader could find: not withdrawn. Shelved = Koha gave it a location. */
export function summariseCopies(copies: BookIndexRow["catalog_copies"]): CopySummary {
  let total = 0;
  let shelved = 0;
  for (const c of copies ?? []) {
    if (c.status === "withdrawn") continue;
    total += 1;
    if (c.shelf_location && c.shelf_location.trim()) shelved += 1;
  }
  return { total, shelved };
}

/**
 * The whole catalogue with its review rows and tasks, then narrowed to one
 * queue (or not, for the counts). Read whole on purpose: a duplicate can sit
 * in either language, and its key must be compared across both. The language
 * filter runs here through reviewQueueOf, so a value that is not a code never
 * reaches a queue. Copies are embedded for their shelf only — status and
 * location — the same embed /admin/catalogs already reads for its figures.
 */
export async function loadReviewIndex(supabase: Db, queue: ReviewQueue | null): Promise<ReviewIndex> {
  const scan = await pagedScan<BookIndexRow>(
    (from, to) => supabase.from("catalog_books").select(INDEX_COLUMNS).order("id", { ascending: true }).range(from, to),
    CATALOG_SCAN_CAP,
  );
  if (scan.error) return { ok: false, missingTable: false, message: scan.error.message ?? "read failed" };
  if (scan.truncated) return { ok: false, missingTable: false, message: "the catalogue is larger than one scan may read" };

  const rows = await loadReviewRows(supabase);
  if (!rows.ok) return rows;

  const clusters = duplicateClusters(scan.data);
  const duplicates = duplicateGroups(scan.data, clusters);
  const records = new Map(scan.data.map((b) => [b.id, { title: b.title, author: b.author, language: b.language, callNumber: b.ddc, isbn: b.isbn, year: b.year }]));
  const items: QueueItem[] = [];
  for (const b of scan.data) {
    if (queue && reviewQueueOf(b.language) !== queue) continue;
    const review = rows.rows.get(b.id) ?? null;
    items.push({
      id: b.id,
      title: b.title,
      author: b.author,
      language: b.language,
      callNumber: b.ddc,
      isActive: b.is_active,
      review,
      tasks: reviewTasks(b, summariseCopies(b.catalog_copies), duplicates.has(b.id), review?.waivedTasks ?? []),
    });
  }
  return { ok: true, items, duplicates, clusters, records };
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

/**
 * Open tasks per language queue, from rows the caller already holds (the
 * /admin/catalogs collection scan) — so the overview's work figures cost no
 * second read of the catalogue. Duplicates are compared across both queues.
 */
export function openTaskCounts(
  books: readonly (Omit<BookIndexRow, "is_active" | "title"> & { title: string | null })[],
  rows: ReadonlyMap<string, ReviewRow>,
): { counts: Record<ReviewQueue, Partial<Record<ReviewTaskId, number>>>; tasksById: Map<string, ReviewTask[]> } {
  const duplicates = duplicateGroups(books);
  const counts: Record<ReviewQueue, Partial<Record<ReviewTaskId, number>>> = { km: {}, en: {} };
  const tasksById = new Map<string, ReviewTask[]>();
  for (const b of books) {
    const tasks = reviewTasks(b, summariseCopies(b.catalog_copies), duplicates.has(b.id), rows.get(b.id)?.waivedTasks ?? []);
    tasksById.set(b.id, tasks);
    const queue = reviewQueueOf(b.language);
    if (!queue) continue;
    for (const task of tasks) if (task.state === "open") counts[queue][task.id] = (counts[queue][task.id] ?? 0) + 1;
  }
  return { counts, tasksById };
}

/** sha256 of a field's canonical value — what field_sources entries are compared against. */
export function fieldHash(field: ProvenanceField, record: ProvenanceRecord): string {
  return createHash("sha256").update(canonicalValue(field, record), "utf8").digest("hex");
}

/** One record's provenance, as the workspace shows it. A failed read is reported, not shown as "no sources". */
export async function loadProvenance(
  supabase: Db,
  record: ProvenanceRecord & { id: string; koha_biblio_id?: number | null },
  verifiedAndUnchanged: boolean,
): Promise<{ ok: true; views: ProvenanceView[] } | { ok: false }> {
  const { data, error } = await supabase.from("catalog_review_state").select("field_sources").eq("book_id", record.id).maybeSingle();
  if (error) return { ok: false };
  const sources = readFieldSources(data?.field_sources);
  const views: ProvenanceView[] = [];
  for (const field of PROVENANCE_FIELDS) {
    const view = provenanceView({
      field,
      hasValue: canonicalValue(field, record) !== "",
      currentHash: fieldHash(field, record),
      entry: sources[field],
      kohaLinked: record.koha_biblio_id != null,
      verifiedAndUnchanged,
    });
    if (view) views.push(view);
  }
  return { ok: true, views };
}
