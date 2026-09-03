import "server-only";

/**
 * Reconciliation for upload sessions and the bytes they left behind.
 *
 * WHAT THIS EXISTS TO FIND
 *
 * The failure mode operators reported — "the file is in Zima but the book is
 * not in the admin dashboard" — had no owner. Nothing in the system knew that
 * a file had been stored, so nothing could notice that no row referenced it.
 * The session table (0132) makes that state nameable, and this makes it
 * actionable:
 *
 *   session STORED, no resource, past its expiry  → a storage orphan
 *   session SAVING_DB, stuck                      → a save that died mid-flight
 *   session FINALIZING, stuck                     → a finalize that died
 *   staging directory with no live session        → disk to reclaim
 *
 * TWO RULES GOVERN EVERYTHING HERE.
 *
 * 1. IT NEVER DELETES A DATABASE ROW. Not a book, not a book_files row, not a
 *    thesis. A record with a broken file is a repair job for a librarian;
 *    deleting it destroys catalogue work that a re-upload cannot recreate.
 *
 * 2. IT NEVER DELETES A STORAGE OBJECT WITHOUT ASKING THE DATABASE FIRST, and
 *    never on the strength of a UI event. Before anything is trashed, the URL
 *    is looked up in every table that could reference it. This is the rule the
 *    old client broke: it deleted the PDF whenever a save request failed, which
 *    included saves that had actually succeeded and whose response was simply
 *    lost — taking out the file a live book row pointed at.
 *
 * Deletion is additionally opt-in (`purge: true`) and age-bounded, so the
 * default pass is a REPORT. An orphan costs disk; a wrongly deleted book costs
 * the library the book.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { zimaDelete } from "@/lib/zima";
import { uploadLog } from "@/lib/uploads/log";
import {
  expiredSessions,
  liveSessionIds,
  stuckSessions,
  transition,
  type UploadSession,
} from "@/lib/uploads/session";
import { sweepStaging } from "@/lib/uploads/staging";

/** A finalize cannot legitimately outlive the route's own 300 s ceiling. */
const FINALIZING_STUCK_MS = 15 * 60 * 1000;
/** A save is a handful of Supabase round-trips; minutes is already generous. */
const SAVING_STUCK_MS = 10 * 60 * 1000;
/** Staged parts of a session nothing is working on. */
const STAGING_MAX_AGE_MS = 26 * 60 * 60 * 1000;
/** How long an orphan must sit before `purge` will touch it. */
const ORPHAN_PURGE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
/** Fresh lease given to a session this pass released, so the retry can happen. */
const RECLAIM_LEASE_MS = 24 * 60 * 60 * 1000;

export type ReconcileReport = {
  finalizingReclaimed: number;
  savingReclaimed: number;
  abandonedFailed: number;
  adopted: number;
  orphaned: number;
  purged: number;
  stagingRemoved: number;
  stagingFreedBytes: number;
  orphanUrls: string[];
};

/**
 * Is this URL referenced by anything in the library?
 *
 * Checked across every table that can hold a storage URL. `book_files` is the
 * one that matters for books, but a file can also have been attached to a
 * thesis or a publication by a form that shares the upload route, and treating
 * one of those as unreferenced would delete a live file.
 */
async function isReferenced(url: string): Promise<boolean> {
  const db = createServiceClient();
  const checks = await Promise.all([
    db.from("book_files").select("id").eq("file_url", url).limit(1).maybeSingle(),
    db.from("books").select("id").eq("cover_url", url).limit(1).maybeSingle(),
    db.from("research_reports").select("id").eq("file_url", url).limit(1).maybeSingle(),
  ]);
  for (const { data, error } of checks) {
    // FAIL SAFE, LOUDLY. A lookup that errored is not evidence of absence, and
    // treating it as such is how a reconciler deletes live files. Any error at
    // all means "assume referenced".
    if (error && error.code !== "PGRST116") return true;
    if (data) return true;
  }
  return false;
}

export async function reconcileUploads(
  options: { purge?: boolean } = {},
): Promise<ReconcileReport> {
  const report: ReconcileReport = {
    finalizingReclaimed: 0,
    savingReclaimed: 0,
    abandonedFailed: 0,
    adopted: 0,
    orphaned: 0,
    purged: 0,
    stagingRemoved: 0,
    stagingFreedBytes: 0,
    orphanUrls: [],
  };

  // ── 1. Sessions whose request died mid-transition ──────────────────────────
  // Handed BACK rather than failed: the staged bytes, or the stored file, are
  // still good, so the operator's retry is cheap. A session left in FINALIZING
  // forever would answer every retry with SESSION_BUSY — a permanent lock held
  // by a process that no longer exists.
  for (const session of await stuckSessions("FINALIZING", FINALIZING_STUCK_MS)) {
    const moved = await transition(session.id, "FINALIZING", "UPLOADING", {
      errorCode: "FINALIZATION_FAILED",
      errorMessage: "Finalization did not complete; the upload was released for retry.",
      // A fresh lease, or the abandoned-upload sweep below would fail this very
      // session in the same pass and the release would buy the operator nothing.
      extendExpiryMs: RECLAIM_LEASE_MS,
    }).catch(() => null);
    if (moved) {
      report.finalizingReclaimed++;
      uploadLog({ event: "session_reclaimed", uploadId: session.id, state: "UPLOADING" });
    }
  }

  for (const session of await stuckSessions("SAVING_DB", SAVING_STUCK_MS)) {
    // The file is stored; only the row is missing. Back to STORED so the save
    // can be retried without re-uploading, and so the orphan pass below can
    // see it if nobody ever does.
    const moved = await transition(session.id, "SAVING_DB", "STORED", {
      errorCode: "DATABASE_SAVE_FAILED",
      errorMessage: "The database save did not complete; the file is still in storage.",
      extendExpiryMs: RECLAIM_LEASE_MS,
    }).catch(() => null);
    if (moved) {
      report.savingReclaimed++;
      uploadLog({ event: "session_reclaimed", uploadId: session.id, state: "STORED" });
    }
  }

  // ── 2. Uploads abandoned before anything was stored ────────────────────────
  // Nothing reached storage, so this is pure bookkeeping plus disk.
  for (const session of await expiredSessions(["CREATED", "UPLOADING"])) {
    const moved = await transition(session.id, ["CREATED", "UPLOADING"], "FAILED", {
      errorCode: "FINALIZATION_FAILED",
      errorMessage: "Abandoned before the file was complete.",
    }).catch(() => null);
    if (moved) report.abandonedFailed++;
  }

  // ── 3. Stored bytes: adopted or declared orphaned ──────────────────────────
  for (const session of await expiredSessions(["STORED"])) {
    if (!session.storedUrl) continue;

    if (await isReferenced(session.storedUrl)) {
      // A row DOES point at this file — the save succeeded and only the
      // session's bookkeeping was lost (a response that never arrived, a
      // container restart between the insert and the update). Adopting it is
      // the difference between a correct library and a reconciler that deletes
      // a live book's PDF.
      await transition(session.id, "STORED", "SAVING_DB").catch(() => null);
      await transition(session.id, "SAVING_DB", "COMPLETED", {
        resourceType: session.resourceType ?? "book",
        resourceId: session.resourceId,
      }).catch(() => null);
      report.adopted++;
      continue;
    }

    const moved = await transition(session.id, "STORED", "ORPHANED", {
      errorCode: "DATABASE_SAVE_FAILED",
      errorMessage: "Stored in Zima but no library record references it.",
    }).catch(() => null);
    if (moved) {
      report.orphaned++;
      report.orphanUrls.push(session.storedUrl);
      uploadLog({
        event: "session_reclaimed",
        uploadId: session.id,
        state: "ORPHANED",
        message: "stored but unreferenced",
      });
    }
  }

  // ── 4. Purge, only when asked, only when old, only when still unreferenced ─
  if (options.purge) {
    const cutoff = Date.now() - ORPHAN_PURGE_AFTER_MS;
    for (const session of await expiredSessions(["ORPHANED"])) {
      if (!session.storedUrl) continue;
      if (new Date(session.updatedAt).getTime() > cutoff) continue;
      // Re-checked immediately before deleting, not once at classification
      // time: a librarian may have attached the file to a record in the days
      // between, and the whole point of the delay is to give them that chance.
      if (await isReferenced(session.storedUrl)) {
        await transition(session.id, "ORPHANED", "COMPLETED", {
          resourceType: session.resourceType ?? "book",
          resourceId: session.resourceId,
        }).catch(() => null);
        report.adopted++;
        continue;
      }
      await zimaDelete(session.storedUrl).catch(() => undefined);
      await transition(session.id, "ORPHANED", "CANCELLED", {
        errorCode: "DATABASE_SAVE_FAILED",
        errorMessage: "Unreferenced file removed by reconciliation.",
      }).catch(() => null);
      report.purged++;
      uploadLog({
        event: "session_reclaimed",
        uploadId: session.id,
        state: "CANCELLED",
        message: "orphan purged",
      });
    }
  }

  // ── 5. Reclaim staging disk ────────────────────────────────────────────────
  // `protect` is every session that is still live, so a legitimately paused
  // upload — a librarian on a slow link, or an importer waiting out a storage
  // quota window, which is measured in tens of minutes — keeps its parts.
  const swept = await sweepStaging({
    maxAgeMs: STAGING_MAX_AGE_MS,
    protect: await liveSessionIds(),
  });
  report.stagingRemoved = swept.removed.length;
  report.stagingFreedBytes = swept.freedBytes;
  if (swept.removed.length > 0) {
    uploadLog({
      event: "staging_swept",
      uploadId: null,
      message: `${swept.removed.length} stale staging directories, ${swept.freedBytes} bytes`,
    });
  }

  return report;
}

/** Sessions currently holding bytes nothing references. For an admin view. */
export async function listStorageOrphans(limit = 100): Promise<UploadSession[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("upload_sessions")
    .select("*")
    .eq("state", "ORPHANED")
    .order("updated_at", { ascending: false })
    .limit(limit);
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return (data ?? []) as any as UploadSession[];
}
