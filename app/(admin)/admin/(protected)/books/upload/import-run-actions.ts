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

import { requirePermission } from "@/lib/auth/requireAdmin";

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
