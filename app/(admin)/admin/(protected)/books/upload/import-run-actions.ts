"use server";

// Durable progress for the bulk book importer (migration 0129).
//
// Zima allows 60 uploads per HOUR (lib/zima.ts → ZIMA_UPLOADS_PER_HOUR), so an
// 86-row import necessarily spans multiple quota windows and the importer has
// to sit out waits measured in tens of minutes. Progress held only in React
// state does not survive that: one refresh and the record of which rows
// succeeded is gone, leaving a re-run of the whole CSV as the only recovery.
//
// These actions store the QUEUE, not the files. Browser File handles cannot be
// serialized, so resuming still requires re-selecting the source folders — the
// UI states that plainly. What comes back is the decision record: which rows
// are done, which failed and why, and the folder each one's files belong in.


import { assessBatch } from "@/lib/books/duplicate-detection/batch";
import type { DuplicateCandidate, DuplicateConfidence, DuplicateReason } from "@/lib/books/duplicate-detection/signals";
import { requirePermission } from "@/lib/auth/requireAdmin";
import { logAdminAction } from "@/app/actions/audit";

/** One row of the queue as it is persisted. Mirrors BookJob's durable fields. */
export interface ImportRunRow {
  id: string;
  title: string;
  pdfName: string;
  folder: string;
  status: string;
  error?: string;
  slug?: string;
}

export interface ImportRun {
  id: string;
  label: string | null;
  total: number;
  rows: ImportRunRow[];
  status: "running" | "paused" | "completed" | "abandoned";
  updatedAt: string;
}

/** Runs older than this are not offered for resume — the CSV has moved on. */
const RESUMABLE_AGE_MS = 24 * 60 * 60 * 1000;

/** Cap the snapshot so one oversized CSV cannot bloat a jsonb column. */
const MAX_ROWS = 2000;

function trim(rows: ImportRunRow[]): ImportRunRow[] {
  return rows.slice(0, MAX_ROWS).map((r) => ({
    id: String(r.id),
    title: String(r.title ?? "").slice(0, 300),
    pdfName: String(r.pdfName ?? "").slice(0, 300),
    folder: String(r.folder ?? "").slice(0, 300),
    status: String(r.status ?? "pending").slice(0, 32),
    error: r.error ? String(r.error).slice(0, 500) : undefined,
    slug: r.slug ? String(r.slug).slice(0, 300) : undefined,
  }));
}

/** Start a run and return its id. Any older unfinished run is abandoned. */
export async function startImportRun(
  label: string,
  rows: ImportRunRow[],
): Promise<{ runId: string } | { error: string }> {
  try {
    const { supabase, user } = await requirePermission("books", "write");

    // One live run per operator: two importers writing snapshots into
    // different rows would make "resume the latest" ambiguous.
    await supabase
      .from("book_import_runs")
      .update({ status: "abandoned" })
      .eq("created_by", user.id)
      .in("status", ["running", "paused"]);

    const clean = trim(rows);
    const { data, error } = await supabase
      .from("book_import_runs")
      .insert({
        created_by: user.id,
        label: label.slice(0, 200),
        total: clean.length,
        rows: clean,
        status: "running",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { runId: data.id as string };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start the import run" };
  }
}

/**
 * Replace the run's snapshot. Called on a debounce while the queue runs, so it
 * is deliberately a whole-array write: a partial merge would need the client to
 * track which rows changed, and the snapshot is a few tens of KB.
 */
export async function saveImportRunProgress(
  runId: string,
  rows: ImportRunRow[],
  status: ImportRun["status"],
): Promise<{ ok: true } | { error: string }> {
  try {
    const { supabase, user } = await requirePermission("books", "write");
    const { error } = await supabase
      .from("book_import_runs")
      .update({ rows: trim(rows), status })
      .eq("id", runId)
      // Scoped to the owner so a run id cannot be used to write over
      // another operator's import.
      .eq("created_by", user.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save progress" };
  }
}

/** The operator's most recent unfinished run, if it is recent enough to matter. */
export async function getResumableImportRun(): Promise<ImportRun | null> {
  try {
    const { supabase, user } = await requirePermission("books", "write");
    const { data } = await supabase
      .from("book_import_runs")
      .select("id, label, total, rows, status, updated_at")
      .eq("created_by", user.id)
      .in("status", ["running", "paused"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;

    const updatedAt = new Date(data.updated_at as string);
    if (Date.now() - updatedAt.getTime() > RESUMABLE_AGE_MS) return null;

    const rows = (data.rows ?? []) as ImportRunRow[];
    // A run with nothing left to do is not worth offering.
    if (!rows.some((r) => r.status !== "done" && r.status !== "skipped")) return null;

    return {
      id: data.id as string,
      label: (data.label as string | null) ?? null,
      // The snapshot is the truth. `total` is the count the run STARTED with,
      // which drifts if an operator resumes against an edited CSV.
      total: rows.length,
      rows,
      status: data.status as ImportRun["status"],
      updatedAt: data.updated_at as string,
    };
  } catch {
    // Progress persistence must never block an import. A missing table (the
    // migration has not reached this environment yet) or a transient read
    // failure means "no run to resume", not an error the operator must clear.
    return null;
  }
}

/** Mark a run finished or discarded so it stops being offered. */
export async function closeImportRun(
  runId: string,
  status: "completed" | "abandoned",
): Promise<{ ok: true } | { error: string }> {
  try {
    const { supabase, user } = await requirePermission("books", "write");
    const { error } = await supabase
      .from("book_import_runs")
      .update({ status })
      .eq("id", runId)
      .eq("created_by", user.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not close the import run" };
  }
}


// ── Pre-flight duplicate check ───────────────────────────────────────────────
//
// There is already a duplicate check, and it is stronger than this one: the
// upload route hashes every PDF and refuses a byte-identical file with a 409
// (`book_files.content_hash`, unique-indexed by migration 0060). Nothing can
// create a duplicate row.
//
// What that check cannot do is answer "which of these 33 rows do I already
// have?" BEFORE the run starts. It fires per row, after the file has been sent
// to this server, and it misses a book re-exported or re-compressed to
// different bytes. This one runs once over the whole CSV and lets the importer
// mark those rows before transferring anything.
//
// The two are complementary and neither replaces the other: this one is
// advisory (an operator can still start a flagged row), the hash one is the
// guarantee.
//
// It does NOT have rules of its own. The first version of this check was an
// exact folded title+author key defined right here, and it was withdrawn
// rather than shipped: it disagreed with both the upload form and
// /admin/books/duplicates, passing a row that shared an ISBN with an existing
// book while failing one that differed only by "2nd Edition". The scoring now
// comes from lib/books/duplicate-detection, so all three doors into the
// collection answer the same question the same way, and this file contributes
// only the two things a BATCH has — one catalogue read for the whole CSV, and
// row-against-row comparison for duplicates that exist nowhere but in the file
// being imported.

/** Cap the scan: this reads the catalogue, not a single row. */
const MATCH_SCAN_LIMIT = 20_000;

export interface AlreadyImported {
  /** Row id (CSV index). */
  id: string;
  /** The colliding record's title — an existing book, or an earlier CSV row. */
  title: string;
  /** Public slug of the existing book, when the collision is with one. */
  slug: string | null;
  /** The existing book's id, so the row can link into the admin record. */
  bookId: string | null;
  /** Whether the collision is with the library or with another line of this
   *  same file. Two rows of one CSV can be the same book, and no check against
   *  the catalogue can see that — neither exists yet. */
  source: "catalog" | "batch";
  /** True when the save would be REFUSED (identifier evidence), not merely
   *  warned about. */
  blocked: boolean;
  confidence: DuplicateConfidence;
  score: number;
  /** Translatable reason codes — never sentences. */
  reasons: DuplicateReason[];
  /** For an in-file collision, the CSV row it collides with. */
  matchRowId?: string;
}

/**
 * Which of these rows collide — with the library, or with each other.
 *
 * ONE detector, not a second one. The scoring rules are
 * lib/books/duplicate-detection/signals.ts, exactly as the single-upload gate
 * uses them, so an ISBN collision, an edition difference and a series volume
 * are all judged identically whichever door the book comes through. This
 * function only supplies the candidates and the batch dimension.
 *
 * One query for the whole CSV rather than one per row: the catalogue is in the
 * hundreds of rows, 86 rows would otherwise be 86 round trips, and the scoring
 * has to happen in JS anyway.
 */
export async function findAlreadyImported(
  rows: Array<{ id: string; title: string; author: string; isbn?: string; year?: string }>,
): Promise<AlreadyImported[]> {
  try {
    if (rows.length === 0) return [];
    const { supabase } = await requirePermission("books", "write");

    // Everything the scorer weighs. The previous version selected only title,
    // slug and author, so an ISBN collision — the one signal that should stop
    // a row outright — was invisible to the pre-flight.
    const { data, error } = await supabase
      .from("books")
      .select("id, title, slug, isbn, publisher, published_at, status, is_published, authors(name)")
      .limit(MATCH_SCAN_LIMIT);
    if (error) throw new Error(error.message);

    const catalogue: DuplicateCandidate[] = [];
    for (const row of data ?? []) {
      // `authors` arrives as an object for a to-one embed and an array for a
      // to-many one depending on how PostgREST resolves the relationship;
      // accept both rather than depending on which.
      const rel = (row as { authors?: unknown }).authors;
      const name =
        Array.isArray(rel)
          ? ((rel[0] as { name?: string } | undefined)?.name ?? "")
          : ((rel as { name?: string } | null)?.name ?? "");
      const title = (row as { title?: string }).title ?? "";
      if (!title) continue;
      const publishedAt = (row as { published_at?: string | null }).published_at ?? null;
      catalogue.push({
        id: (row as { id: string }).id,
        slug: (row as { slug?: string | null }).slug ?? "",
        title,
        author: name || null,
        isbn: (row as { isbn?: string | null }).isbn ?? null,
        year: publishedAt ? new Date(publishedAt).getUTCFullYear() : null,
        publisher: (row as { publisher?: string | null }).publisher ?? null,
        // Not selected: book_files is a separate embed and the pre-flight runs
        // before any file has been read, so there is no hash to compare yet.
        // The upload route's 409 remains the file-identity guarantee.
        contentHash: null,
        status: (row as { status?: string | null }).status ?? null,
        isPublished: Boolean((row as { is_published?: boolean }).is_published),
      });
    }

    const verdicts = assessBatch(
      rows.map((row) => ({
        id: row.id,
        title: row.title,
        author: row.author,
        isbn: row.isbn ?? null,
        year: Number(row.year) || null,
      })),
      catalogue,
    );

    return [...verdicts.values()].map((verdict) => ({
      id: verdict.id,
      title: verdict.match.title,
      slug: verdict.source === "catalog" ? verdict.match.slug || null : null,
      bookId: verdict.source === "catalog" ? verdict.match.bookId : null,
      source: verdict.source,
      blocked: verdict.blocked,
      confidence: verdict.match.confidence,
      score: verdict.match.score,
      reasons: verdict.match.reasons,
      matchRowId: verdict.matchRowId,
    }));
  } catch {
    // Advisory only. A failed pre-check must never block an import — the
    // content-hash check downstream is the actual guarantee.
    return [];
  }
}

/**
 * Record that an operator overrode the pre-flight's duplicate verdict.
 *
 * The pre-flight is ADVISORY — it scores metadata before a byte is uploaded,
 * against a candidate pool that holds no content hashes, so it can be wrong in
 * both directions and a librarian has to be able to say so. What it must not
 * be is silent: a row that entered the library over a "this is already here"
 * warning is exactly the row someone will later want explained.
 *
 * This changes no gate. The identifier refusals still stand where they always
 * did — `assertNotDuplicate` re-runs at save time with the file's real content
 * hash, and the unique index on `book_files.content_hash` stands behind that.
 * A librarian can overrule a resemblance; nobody overrules a hash.
 */
export async function recordDuplicateOverride(input: {
  title: string;
  matchedTitle: string;
  matchedBookId?: string | null;
  score: number;
  confidence: DuplicateConfidence;
  source: "catalog" | "batch";
}): Promise<void> {
  try {
    const { userId } = await requirePermission("books", "write");
    await logAdminAction(userId, "book.import_duplicate_override", "books", input.matchedBookId ?? undefined, {
      attemptedTitle: String(input.title).slice(0, 300),
      matchedTitle: String(input.matchedTitle).slice(0, 300),
      score: input.score,
      confidence: input.confidence,
      source: input.source,
      stage: "bulk_import_preflight",
    });
  } catch {
    // An unrecorded override must not stop the import: the row still faces the
    // authoritative check at save time, which does its own logging.
  }
}
