/* lib/indexing/reconcile.ts
 *
 * The loop that keeps the retrieval index honest without anyone watching.
 *
 * 0133 made indexing outcomes visible; 0134 made them classifiable and
 * retryable. Neither of those retries anything on its own, so a book whose
 * first attempt hit a storage blip stayed unsearchable until a human noticed —
 * and the entire lesson of this area is that nobody notices. This module is
 * the "and then it heals" half.
 *
 * ── What it will and will not do ────────────────────────────────────────────
 *
 * It processes a BOUNDED batch per run. The hourly cron must not walk 215
 * books every hour: extraction is I/O and CPU on multi-megabyte PDFs, and a
 * job that occasionally takes an hour is a job that overlaps itself.
 *
 * It CLAIMS each record before working on it, so an operator's manual backfill
 * and the cron cannot both process the same book — and a claim left behind by
 * a killed process is reclaimable after STALE_CLAIM_MS rather than stranding
 * the record in `running` for good.
 *
 * It does NOT embed. Extraction and embedding are separate because they fail
 * differently and cost differently: extraction is free and local, embedding
 * spends a metered external quota with a per-day cap. Chaining them means one
 * quota stop aborts extraction work that would have succeeded. `indexPdfPages`
 * already chains chunk embedding on the upload path where the volume is one
 * book; a sweep over the backlog keeps them apart.
 *
 * It never deletes a resource row, and never treats a failure to READ the
 * database as evidence about a resource — the same posture as
 * lib/uploads/reconcile.ts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { indexPdfPages, type PageRecordType } from "@/lib/pdf-page-index";
import {
  readIndexState,
  sourceDigest,
  writeIndexState,
  outcomeFromError,
  outcomeFromResult,
} from "./state";
import {
  compareWork,
  isClaimReclaimable,
  isDue,
  type WorkReason,
} from "./retry";
import { judgeEnvironment, PROBE_SAMPLE_SIZE } from "./environment";

/** Records processed in one reconciliation pass. */
export const DEFAULT_BATCH = 10;

export type ResourceRef = {
  recordType: PageRecordType;
  recordId: string;
  title: string;
  fileUrl: string;
};

export type WorkItem = ResourceRef & { reason: WorkReason };

export type ReconcileReport = {
  scanned: number;
  eligible: number;
  processed: number;
  indexed: number;
  noTextLayer: number;
  unfetchable: number;
  failed: number;
  skippedEnvironment: boolean;
  reason?: string;
  items: Array<{ recordType: string; recordId: string; reason: WorkReason; status: string }>;
};

type StateRow = {
  record_type: string;
  record_id: string;
  status: string;
  failure_kind: string | null;
  source_digest: string | null;
  next_attempt_at: string | null;
  claimed_at: string | null;
};

/**
 * Every published resource that has a file, with the URL it points at NOW.
 *
 * Deliberately mirrors the `published` CTE in migration 0134's health view:
 * if the two ever disagree about what "published with a file" means, the
 * dashboard and the worker are describing different libraries.
 */
export async function listIndexableResources(db: SupabaseClient): Promise<ResourceRef[]> {
  const out: ResourceRef[] = [];

  const [books, theses, publications] = await Promise.all([
    db.from("books").select("id, title, book_files(file_url)").eq("is_published", true),
    db.from("research_reports").select("id, title, file_url").eq("is_published", true),
    db.from("publications").select("id, title, pdf_url").eq("is_published", true),
  ]);

  for (const b of books.data ?? []) {
    const files = (b.book_files ?? []) as Array<{ file_url: string | null }>;
    const url = files
      .map((f) => f.file_url)
      .filter((u): u is string => !!u)
      .sort()[0];
    if (url) out.push({ recordType: "book", recordId: b.id, title: b.title ?? "", fileUrl: url });
  }
  for (const r of theses.data ?? []) {
    if (r.file_url)
      out.push({ recordType: "research", recordId: r.id, title: r.title ?? "", fileUrl: r.file_url });
  }
  for (const p of publications.data ?? []) {
    if (p.pdf_url)
      out.push({
        recordType: "publication",
        recordId: p.id,
        title: p.title ?? "",
        fileUrl: p.pdf_url,
      });
  }
  return out;
}

/**
 * Decide what needs work, and why. PURE given the inputs, so the priority
 * rules are testable without a database.
 *
 * A record is eligible when it has never been attempted, when its retry is
 * due, when it was indexed from a file it no longer points at (stale), or when
 * a claim on it has gone cold. A healthy, current, `indexed` record is not
 * eligible, and neither is a `permanent` failure — which is the whole point of
 * classifying them: nothing retries a scanned PDF forever.
 */
export function selectWork(
  resources: readonly ResourceRef[],
  states: ReadonlyMap<string, StateRow>,
  now: Date,
  limit: number,
): WorkItem[] {
  const work: WorkItem[] = [];

  for (const r of resources) {
    const state = states.get(`${r.recordType}:${r.recordId}`);

    if (!state) {
      work.push({ ...r, reason: "never_attempted" });
      continue;
    }

    if (state.status === "running") {
      // Only a cold claim is work; a live one belongs to another runner.
      if (isClaimReclaimable(state.claimed_at, now)) work.push({ ...r, reason: "reclaimed" });
      continue;
    }

    if (state.status === "indexed") {
      // Stale = indexed from a different file than the one it points at today.
      // This is the only state that is actively WRONG rather than absent:
      // search would quote text the current document does not contain.
      if (state.source_digest && state.source_digest !== sourceDigest(r.fileUrl)) {
        work.push({ ...r, reason: "stale" });
      }
      continue;
    }

    // A failure is work only when its own schedule says so. `permanent` never
    // gets a next_attempt_at, so it never lands here.
    if (isDue({ status: "failed", nextAttemptAt: state.next_attempt_at }, now)) {
      work.push({ ...r, reason: state.failure_kind === "config" ? "config" : "transient" });
    }
  }

  work.sort((a, b) => compareWork(a.reason, b.reason));
  return work.slice(0, limit);
}

/**
 * One reconciliation pass.
 *
 * `dryRun` reports exactly what would be processed and writes nothing — the
 * mode an operator should use first against production.
 */
export async function reconcileIndex(
  db: SupabaseClient,
  opts: { limit?: number; dryRun?: boolean; runnerId?: string; now?: Date } = {},
): Promise<ReconcileReport> {
  const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_BATCH, 200));
  const now = opts.now ?? new Date();
  const runnerId = opts.runnerId ?? `reconcile:${process.pid}`;
  const empty = {
    scanned: 0,
    eligible: 0,
    processed: 0,
    indexed: 0,
    noTextLayer: 0,
    unfetchable: 0,
    failed: 0,
    items: [] as ReconcileReport["items"],
  };

  const resources = await listIndexableResources(db);

  /* Refuse to run at all when this process's storage allow-list cannot reach
     the files in this database. Without this the sweep would faithfully record
     every record as unfetchable — which is precisely how 203 healthy books
     were marked broken. Aborting is the correct outcome: there is nothing to
     learn here, and writing what we "observed" is writing a lie. */
  const verdict = judgeEnvironment(resources.slice(0, PROBE_SAMPLE_SIZE).map((r) => r.fileUrl));
  if (!verdict.ok) {
    return {
      ...empty,
      scanned: resources.length,
      skippedEnvironment: true,
      reason: verdict.reason,
    };
  }

  const { data: stateRows } = await db
    .from("resource_index_state")
    .select("record_type, record_id, status, failure_kind, source_digest, next_attempt_at, claimed_at");

  const states = new Map<string, StateRow>(
    ((stateRows ?? []) as StateRow[]).map((r) => [`${r.record_type}:${r.record_id}`, r]),
  );

  const work = selectWork(resources, states, now, limit);
  const report: ReconcileReport = {
    ...empty,
    scanned: resources.length,
    eligible: work.length,
    skippedEnvironment: false,
  };

  if (opts.dryRun) {
    report.items = work.map((w) => ({
      recordType: w.recordType,
      recordId: w.recordId,
      reason: w.reason,
      status: "would-process",
    }));
    return report;
  }

  for (const item of work) {
    // Claim first. A crash between here and the outcome leaves the record in
    // `running`, which the next pass reclaims once the claim goes cold.
    await writeIndexState(
      db,
      {
        recordType: item.recordType,
        recordId: item.recordId,
        status: "running",
        pages: 0,
        chunks: 0,
        claimedBy: runnerId,
        sourceDigest: sourceDigest(item.fileUrl),
      },
      now,
    );

    let outcome: ReturnType<typeof outcomeFromError>;
    try {
      const result = await indexPdfPages({
        recordType: item.recordType,
        recordId: item.recordId,
        fileUrl: item.fileUrl,
        db,
      });
      outcome = outcomeFromResult(result);
    } catch (err) {
      outcome = outcomeFromError(err);
    }

    // The claim wrote attempt_count for `running`; read it back so the failure
    // schedule counts this attempt once, not twice.
    const existing = await readIndexState(db, item.recordType, item.recordId);
    await writeIndexState(
      db,
      {
        recordType: item.recordType,
        recordId: item.recordId,
        status: outcome.status,
        pages: outcome.pages,
        chunks: 0,
        detail: outcome.detail,
        sourceDigest: sourceDigest(item.fileUrl),
        previousAttempts: existing?.attemptCount ?? 0,
      },
      new Date(),
    );

    report.processed++;
    if (outcome.status === "indexed") report.indexed++;
    else if (outcome.status === "no_text_layer") report.noTextLayer++;
    else if (outcome.status === "unfetchable") report.unfetchable++;
    else report.failed++;

    report.items.push({
      recordType: item.recordType,
      recordId: item.recordId,
      reason: item.reason,
      status: outcome.status,
    });
  }

  return report;
}
