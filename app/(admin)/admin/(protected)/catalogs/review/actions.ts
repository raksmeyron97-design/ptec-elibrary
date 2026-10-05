"use server";
// app/admin/catalogs/review/actions.ts
// Review transitions for one Physical Library record (docs/CATALOG-REVIEW.md):
// claim, release, take over, verify, block, unblock, reopen.
//
// What these write: catalog_review_state, and one admin_audit_log row each.
// What they never write: catalog_books, catalog_copies, Koha. Editing the
// record is the existing updateCatalogBook (Koha first, three-way conflict
// check); "Verify & next" calls it first and calls verify only after it
// succeeded, and verify fingerprints the row AS STORED — never anything the
// browser says the record holds.
//
// Concurrency: every transition names the `version` it read. The write is a
// compare-and-set on that version (or an insert that collides on the primary
// key), so two librarians pressing at once cannot both claim or verify — the
// second is told the record changed, and nothing is overwritten.

import { requireAction } from "@/lib/admin/route-guard";
import { logAdminAction } from "@/app/actions/audit";
import { changedRow } from "@/lib/db/changed-row";
import { catalogReviewEnabled } from "@/lib/catalogs/review-flag";
import { loadReviewIndex, loadReviewRow, reviewFingerprint, summariseCopies } from "@/lib/catalogs/review-server";
import { toCsv } from "@/lib/export/csv";
import { createHash } from "node:crypto";
import { mergeIsbnCandidates, type MergedIsbnRecord } from "@/lib/isbn/enrich";
import type { IsbnCandidate } from "@/lib/isbn/types";
import { isCatalogStorageCover } from "@/lib/catalog-cover";
import { recallPublisherFetch } from "@/lib/catalogs/publisher-fetch-memory";
import {
  canonicalValue,
  parseHints,
  readFieldSources,
  type FieldSourceEntry,
  type ProvenanceField,
  type ProvenanceRecord,
  type ProvenanceSource,
} from "@/lib/catalogs/provenance";
import {
  isReviewQueue,
  matchesReviewQuery,
  parseReviewQuery,
  planReviewTransition,
  planTaskWaiver,
  sortQueue,
  reviewQueueOf,
  statusOf,
  type ReviewAction,
  type ReviewQueue,
  type ReviewRow,
  type ReviewStatus,
  type TransitionRefusal,
  type WaiverPlan,
} from "@/lib/catalogs/review";
import { openBlockingTasks, openTasks, reviewTasks, type ReviewTaskId, type TaskInput } from "@/lib/catalogs/review-tasks";

export type ReviewActionResult =
  | { ok: true; status: ReviewStatus; version: number; waivedTasks?: string[] }
  | {
      ok: false;
      error:
        | TransitionRefusal
        | WaiverRefusal
        | "open_tasks"
        | "other_language"
        | "stale"
        | "disabled"
        | "not_found"
        | "invalid"
        | "failed";
      /** Present on `stale`: the version the record holds now, so the page can offer a reload. */
      version?: number;
      /** Present on `open_tasks`: the blocking tasks verification is waiting on. */
      tasks?: ReviewTaskId[];
    };

type WaiverRefusal = Extract<WaiverPlan, { ok: false }>["reason"];
type Refused = Extract<ReviewActionResult, { ok: false }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Columns verify reads: the fingerprinted fields, plus what the blocking tasks need. */
const BOOK_COLUMNS =
  "id, title, author, isbn, publisher, year, language, category, department, ddc, shelf_location, cover_url, description, keywords, catalog_copies(status, shelf_location)";

type BookRow = TaskInput & { id: string; keywords: string[] | null; catalog_copies: { status: string | null; shelf_location: string | null }[] | null };

/**
 * The one guarded entry: switch, then the registry, then the record and its
 * review row — and a press made against an older page is refused before
 * anything is planned, because what the librarian saw is not what the record is.
 */
type Prepared = {
  supabase: Awaited<ReturnType<typeof requireAction>>["supabase"];
  userId: string;
  book: BookRow;
  row: ReviewRow | null;
};

async function prepare(bookId: string, expectedVersion: number): Promise<{ refused: Refused } | Prepared> {
  if (!catalogReviewEnabled()) return { refused: { ok: false, error: "disabled" } as Refused };
  const { supabase, userId } = await requireAction("catalog.review.transition");

  if (typeof bookId !== "string" || !UUID.test(bookId)) return { refused: { ok: false, error: "invalid" } as Refused };
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) return { refused: { ok: false, error: "invalid" } as Refused };

  const { data, error: bookError } = await supabase.from("catalog_books").select(BOOK_COLUMNS).eq("id", bookId).maybeSingle();
  if (bookError) return { refused: { ok: false, error: "failed" } as Refused };
  if (!data) return { refused: { ok: false, error: "not_found" } as Refused };
  const book = data as unknown as BookRow;

  const current = await loadReviewRow(supabase, bookId);
  if (!current.ok) return { refused: { ok: false, error: "failed" } as Refused };
  const row = current.row;
  const heldVersion = row?.version ?? 0;
  if (heldVersion !== expectedVersion) return { refused: { ok: false, error: "stale", version: heldVersion } as Refused };

  return { supabase, userId, book, row };
}

/** Compare-and-set on the version read, or an insert that collides on the primary key. */
async function writeRow(p: Prepared, patch: Record<string, unknown>): Promise<{ version: number } | Refused> {
  const updatedAt = new Date().toISOString();
  if (!p.row) {
    const { error } = await p.supabase
      .from("catalog_review_state")
      .insert({ book_id: p.book.id, status: "needs_review", ...patch, version: 1, updated_at: updatedAt });
    // 23505: another librarian's first write landed between the read and this insert.
    if (error) return error.code === "23505" ? { ok: false, error: "stale" } : { ok: false, error: "failed" };
    return { version: 1 };
  }
  const written = changedRow<{ version: number }>(
    await p.supabase
      .from("catalog_review_state")
      .update({ ...patch, version: p.row.version + 1, updated_at: updatedAt })
      .eq("book_id", p.book.id)
      .eq("version", p.row.version)
      .select("version"),
  );
  if (!written.ok) return written.reason === "no_match" ? { ok: false, error: "stale" } : { ok: false, error: "failed" };
  return { version: written.row.version };
}

async function transition(
  bookId: string,
  action: ReviewAction,
  expectedVersion: number,
  extra: { block?: { reason: string; note?: string | null }; expectQueue?: ReviewQueue } = {},
): Promise<ReviewActionResult> {
  const p = await prepare(bookId, expectedVersion);
  if ("refused" in p) return p.refused;
  // A bulk press names its queue; a record that is not in it is refused rather
  // than changed — a selection can never reach across languages.
  if (extra.expectQueue && reviewQueueOf(p.book.language) !== extra.expectQueue) return { ok: false, error: "other_language" };

  // Verification waits on the blocking tasks of the record AS SAVED — the
  // editor saves first, so a subject typed a moment ago already counts.
  if (action === "verify") {
    const tasks = reviewTasks(p.book, summariseCopies(p.book.catalog_copies), false, p.row?.waivedTasks ?? []);
    const blocking = openBlockingTasks(tasks).map((t) => t.id);
    if (blocking.length) return { ok: false, error: "open_tasks", tasks: blocking };
  }

  const plan = planReviewTransition({
    action,
    row: p.row,
    actorId: p.userId,
    now: new Date(),
    fingerprint: action === "verify" ? reviewFingerprint(p.book) : null,
    block: extra.block,
  });
  if (!plan.ok) return { ok: false, error: plan.reason };

  const written = await writeRow(p, plan.patch);
  if ("ok" in written) return written;

  await logAdminAction(p.userId, `catalogReview.${action}`, "catalog_books", p.book.id, {
    from: plan.from,
    to: plan.to,
    queue: reviewQueueOf(p.book.language),
    ...(plan.previousHolder ? { previousHolder: plan.previousHolder } : {}),
    ...(plan.patch.blocked_reason ? { reason: plan.patch.blocked_reason } : {}),
  });

  return { ok: true, status: plan.to, version: written.version };
}

/** Waive or un-waive one task. Changes no review status, and never over someone else's fresh claim. */
async function waiver(bookId: string, expectedVersion: number, task: string, waive: boolean): Promise<ReviewActionResult> {
  const p = await prepare(bookId, expectedVersion);
  if ("refused" in p) return p.refused;

  const plan = planTaskWaiver({ row: p.row, actorId: p.userId, now: new Date(), task: typeof task === "string" ? task : "", waive });
  if (!plan.ok) return { ok: false, error: plan.reason };

  const written = await writeRow(p, { waived_tasks: plan.waivedTasks });
  if ("ok" in written) return written;

  await logAdminAction(p.userId, waive ? "catalogReview.waive" : "catalogReview.unwaive", "catalog_books", p.book.id, {
    task,
    queue: reviewQueueOf(p.book.language),
  });
  return { ok: true, status: statusOf(p.row), version: written.version, waivedTasks: plan.waivedTasks };
}

export async function claimCatalogReview(bookId: string, expectedVersion: number) {
  return transition(bookId, "claim", expectedVersion);
}

export async function releaseCatalogReview(bookId: string, expectedVersion: number) {
  return transition(bookId, "release", expectedVersion);
}

export async function takeOverCatalogReview(bookId: string, expectedVersion: number) {
  return transition(bookId, "takeover", expectedVersion);
}

export async function verifyCatalogReview(bookId: string, expectedVersion: number) {
  return transition(bookId, "verify", expectedVersion);
}

export async function blockCatalogReview(bookId: string, expectedVersion: number, reason: string, note?: string | null) {
  return transition(bookId, "block", expectedVersion, {
    block: { reason: typeof reason === "string" ? reason : "", note: typeof note === "string" ? note : null },
  });
}

export async function unblockCatalogReview(bookId: string, expectedVersion: number) {
  return transition(bookId, "unblock", expectedVersion);
}

export async function reopenCatalogReview(bookId: string, expectedVersion: number) {
  return transition(bookId, "reopen", expectedVersion);
}

export async function waiveCatalogTask(bookId: string, expectedVersion: number, task: string) {
  return waiver(bookId, expectedVersion, task, true);
}

export async function unwaiveCatalogTask(bookId: string, expectedVersion: number, task: string) {
  return waiver(bookId, expectedVersion, task, false);
}

// ── Bulk (Slice 3) ────────────────────────────────────────────────────────────

/** At most one page of the list per press. */
const BULK_LIMIT = 50;

export type BulkResult =
  | { ok: true; done: number; refused: { id: string; error: Refused["error"] }[] }
  | { ok: false; error: "disabled" | "invalid" };

/**
 * Take or give back a selection, inside ONE queue. Each record goes through
 * the same guarded, compare-and-set, audited transition as a single press, so
 * a bulk action cannot do anything one press could not — and a record whose
 * language is not the queue's is refused, never changed. No bulk verify:
 * verifying means checking the book in hand.
 */
export async function bulkCatalogReview(
  action: "claim" | "release",
  queue: string,
  items: { id: string; version: number }[],
): Promise<BulkResult> {
  if (!catalogReviewEnabled()) return { ok: false, error: "disabled" };
  await requireAction("catalog.review.transition");
  if (action !== "claim" && action !== "release") return { ok: false, error: "invalid" };
  if (!isReviewQueue(queue)) return { ok: false, error: "invalid" };
  if (!Array.isArray(items) || items.length === 0 || items.length > BULK_LIMIT) return { ok: false, error: "invalid" };

  let done = 0;
  const refused: { id: string; error: Refused["error"] }[] = [];
  for (const item of items) {
    const r = await transition(String(item?.id ?? ""), action, Number(item?.version), { expectQueue: queue });
    if (r.ok) done += 1;
    else refused.push({ id: String(item?.id ?? ""), error: r.error });
  }
  return { ok: true, done, refused };
}

/**
 * The filtered queue as CSV — what is left to do, for a librarian to plan or
 * share. Read-level: it shows what the queue page already shows. The same
 * parse, order and filter as the page, so the file is the list on screen.
 */
export async function exportReviewQueue(search: string): Promise<{ ok: true; filename: string; csv: string } | { ok: false; error: "disabled" | "invalid" | "failed" }> {
  if (!catalogReviewEnabled()) return { ok: false, error: "disabled" };
  const { supabase, userId } = await requireAction("catalog.review.view");
  const query = parseReviewQuery(new URLSearchParams(typeof search === "string" ? search.slice(0, 500) : ""));
  if (!query.language) return { ok: false, error: "invalid" };

  const index = await loadReviewIndex(supabase, query.language);
  if (!index.ok) return { ok: false, error: "failed" };
  const now = new Date();
  const rows = sortQueue(index.items, query.sort).filter((i) => matchesReviewQuery(i, query, userId, now));

  const csv = toCsv(rows, [
    { key: "call_number", header: "call_number", value: (r) => r.callNumber },
    { key: "title", header: "title", value: (r) => r.title },
    { key: "author", header: "author", value: (r) => r.author },
    { key: "language", header: "language", value: (r) => r.language },
    { key: "review_status", header: "review_status", value: (r) => statusOf(r.review) },
    { key: "open_tasks", header: "open_tasks", value: (r) => openTasks(r.tasks).map((t) => t.id).join(" ") },
    { key: "blocking_tasks", header: "blocking_tasks", value: (r) => openBlockingTasks(r.tasks).map((t) => t.id).join(" ") },
    { key: "record_id", header: "record_id", value: (r) => r.id },
  ]);
  await logAdminAction(userId, "catalogReview.export", "catalog_books", undefined, { queue: query.language, rows: rows.length });
  return { ok: true, filename: `catalog-review-${query.language}-${now.toISOString().slice(0, 10)}.csv`, csv };
}

// ── Provenance (Slice 4) ──────────────────────────────────────────────────────

const PROVENANCE_COLUMNS = "id, title, author, isbn, publisher, year, language, category, description, keywords, cover_url";

/** The value a provider's cached answer gives for one field, canonical — or null when it gives none. */
function providerValue(field: ProvenanceField, merged: MergedIsbnRecord | null): string | null {
  if (!merged) return null;
  const blank: ProvenanceRecord = {
    title: null, author: null, isbn: null, publisher: null, year: null, language: null, category: null,
    description: null, keywords: null, cover_url: null,
  };
  switch (field) {
    case "description":
      return merged.description ? canonicalValue("description", { ...blank, description: merged.description.value }) : null;
    case "publisher":
      return merged.publisher ? canonicalValue("publisher", { ...blank, publisher: merged.publisher.value }) : null;
    case "year":
      return merged.year ? canonicalValue("year", { ...blank, year: merged.year.value }) : null;
    case "language":
      return merged.language ? canonicalValue("language", { ...blank, language: merged.language.value }) : null;
    case "keywords":
      return merged.keywords ? canonicalValue("keywords", { ...blank, keywords: merged.keywords.value }) : null;
    default:
      return null;
  }
}

/**
 * Record where the values just SAVED came from. Called by the editor after a
 * save succeeded, with hints; nothing is taken on the browser's word:
 *
 *   • Open Library / Google Books — kept only if that provider's cached answer
 *     for that ISBN gives exactly the saved value (a cover: the provider offered
 *     an allow-listed cover and the record now holds a cover this app stored);
 *   • a publisher page / Crossref — kept only if THIS server fetched that text
 *     for this librarian (lib/catalogs/publisher-fetch-memory.ts);
 *   • anything unproven is credited to the librarian who saved it.
 *
 * Writes field_sources only (compare-and-set), never the record.
 */
export async function recordFieldSources(bookId: string, rawHints: unknown): Promise<{ ok: true; recorded: number } | { ok: false; error: "disabled" | "invalid" | "not_found" | "stale" | "failed" }> {
  if (!catalogReviewEnabled()) return { ok: false, error: "disabled" };
  const { supabase, userId } = await requireAction("catalog.review.transition");
  if (typeof bookId !== "string" || !UUID.test(bookId)) return { ok: false, error: "invalid" };
  const hints = parseHints(rawHints);
  if (hints.length === 0) return { ok: true, recorded: 0 };

  const { data, error } = await supabase.from("catalog_books").select(PROVENANCE_COLUMNS).eq("id", bookId).maybeSingle();
  if (error) return { ok: false, error: "failed" };
  if (!data) return { ok: false, error: "not_found" };
  const book = data as unknown as ProvenanceRecord;

  const cache = new Map<string, MergedIsbnRecord | null>();
  async function providerAnswer(isbn13: string, provider: "open_library" | "google_books") {
    const k = `${isbn13}:${provider}`;
    if (!cache.has(k)) {
      const { data: row } = await supabase
        .from("isbn_metadata_cache")
        .select("status, candidates")
        .eq("isbn13", isbn13)
        .eq("provider", provider)
        .maybeSingle();
      const candidates = row?.status === "found" && Array.isArray(row.candidates) ? (row.candidates as IsbnCandidate[]) : [];
      cache.set(k, mergeIsbnCandidates(candidates));
    }
    return cache.get(k) ?? null;
  }

  const at = new Date().toISOString();
  const entries: Partial<Record<ProvenanceField, FieldSourceEntry>> = {};
  for (const hint of hints) {
    const value = canonicalValue(hint.field, book);
    if (!value) continue;
    let source: ProvenanceSource = "librarian";
    let host: string | undefined;
    if ((hint.source === "open_library" || hint.source === "google_books") && hint.isbn13) {
      const merged = await providerAnswer(hint.isbn13, hint.source);
      const proven =
        hint.field === "cover"
          ? !!merged?.coverImportUrl && isCatalogStorageCover(book.cover_url)
          : providerValue(hint.field, merged) === value;
      if (proven) source = hint.source;
    } else if ((hint.source === "publisher" || hint.source === "crossref") && hint.field === "description") {
      const fetched = recallPublisherFetch(userId, value);
      if (fetched) {
        source = fetched.source;
        host = fetched.host;
      }
    }
    entries[hint.field] = { source, by: userId, at, hash: createHash("sha256").update(value, "utf8").digest("hex"), ...(host ? { host } : {}) };
  }
  if (Object.keys(entries).length === 0) return { ok: true, recorded: 0 };

  // Merge into what is stored; one retry if another write landed in between.
  for (let attempt = 0; attempt < 2; attempt++) {
    const current = await loadReviewRow(supabase, bookId);
    if (!current.ok) return { ok: false, error: "failed" };
    const { data: stored } = current.row
      ? await supabase.from("catalog_review_state").select("field_sources").eq("book_id", bookId).maybeSingle()
      : { data: null };
    const merged = { ...readFieldSources(stored?.field_sources), ...entries };
    const written = await writeRow(
      { supabase, userId, book: { id: bookId } as BookRow, row: current.row },
      { field_sources: merged },
    );
    if ("ok" in written) {
      if (written.error === "stale" && attempt === 0) continue;
      return { ok: false, error: written.error === "stale" ? "stale" : "failed" };
    }
    await logAdminAction(userId, "catalogReview.provenance", "catalog_books", bookId, {
      fields: Object.fromEntries(Object.entries(entries).map(([f, e]) => [f, e!.source])),
    });
    return { ok: true, recorded: Object.keys(entries).length };
  }
  return { ok: false, error: "stale" };
}
