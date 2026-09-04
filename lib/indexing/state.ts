/* lib/indexing/state.ts
 *
 * The index state of a resource, as a value.
 *
 * Full-text extraction (lib/pdf-page-index.ts) and passage embedding
 * (lib/chunk-embed.ts) both run in the background from `after()`, and both are
 * deliberately non-throwing: a PDF that will not parse must never fail the
 * librarian's save. The cost of that choice is that every outcome used to
 * collapse into a `console.log` nobody reads, which made a total, five-week,
 * every-record failure in production look exactly like a library full of
 * scanned documents. See migration 0133 for the full account.
 *
 * This module is the decision half of the fix and is PURE ON PURPOSE — no
 * `server-only`, no Supabase import, no `next/headers`. Mapping an extraction
 * outcome onto a status is the part worth testing offline, and the invariant
 * that MATTERS ("a thrown error is `failed`, never `no_text_layer`") is a
 * property of this mapping, not of the database.
 *
 * The one impure function, `writeIndexState`, takes its client as an argument
 * for the same reason `indexPdfPages` does.
 */

import { createHash } from "node:crypto";
import type { IndexPdfResult, PageRecordType } from "../pdf-page-index";
import {
  classifyFailure,
  nextAttemptAt,
  nextAttemptCount,
  shouldOverwrite,
  type FailureKind,
} from "./retry";

/**
 * What the most recent attempt produced.
 *
 * The split that matters is between the two SKIPS and the FAILURE:
 * `no_text_layer` is a permanent property of the document (a scan — re-running
 * the indexer will never help, OCR would), `unfetchable` is transient (storage
 * outage, a moved object — retry), and `failed` always means a bug or an
 * outage on our side. Merging any of them, as a bare "not indexed" boolean
 * would, is precisely what hid the original defect.
 */
export const INDEX_STATUSES = [
  "running",
  "indexed",
  "no_text_layer",
  "unfetchable",
  "failed",
] as const;
export type IndexStatus = (typeof INDEX_STATUSES)[number];

/** Statuses worth retrying on the next backfill sweep. */
export const RETRYABLE_STATUSES: ReadonlySet<IndexStatus> = new Set<IndexStatus>([
  "unfetchable",
  "failed",
]);

export type IndexStateRecord = {
  recordType: PageRecordType;
  recordId: string;
  status: IndexStatus;
  pages: number;
  chunks: number;
  detail?: string;
  sourceDigest?: string;
  /** Attempts already recorded for this record; drives the backoff (0134). */
  previousAttempts?: number;
  /** Who is writing this — a claim marker for `running`. */
  claimedBy?: string;
};

/** Matches the CHECK on resource_index_state.detail. */
export const MAX_DETAIL_CHARS = 500;

/**
 * Trim a reason down to something an admin screen can render.
 *
 * Control characters go first — `detail` reaches a log line and an HTML table,
 * and it can carry a message from a third-party library that quoted a file
 * name. Same reasoning as `sanitizeLogId`, which covers the id rather than the
 * message.
 */
export function sanitizeDetail(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = (value instanceof Error ? value.message : String(value))
    .replace(/[\r\n]+/g, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 0 ? text.slice(0, MAX_DETAIL_CHARS) : undefined;
}

/**
 * A stable digest of the file URL that was indexed.
 *
 * The URL itself is never stored. A storage URL is a permanent, credential-
 * free download link (docs/BOOK-DOWNLOAD-PERMISSION.md), so copying it into a
 * second table would create a second place it can leak from — and "has this
 * file changed since we indexed it?" only ever needed equality.
 */
export function sourceDigest(fileUrl: string): string {
  return createHash("sha256").update(fileUrl).digest("hex").slice(0, 64);
}

/**
 * Map an extraction result onto a durable status.
 *
 * `indexPdfPages` reports its EXPECTED non-fatal outcomes as
 * `{ indexed: false, reason }` and throws everything else, so this function
 * only ever sees the expected set — `outcomeFromError` covers the rest.
 */
export function outcomeFromResult(result: IndexPdfResult): {
  status: IndexStatus;
  pages: number;
  detail?: string;
} {
  if (result.indexed) return { status: "indexed", pages: result.pages };
  switch (result.reason) {
    case "no-text-layer":
      return { status: "no_text_layer", pages: 0, detail: sanitizeDetail(result.detail) };
    case "unresolvable-url":
    case "fetch-failed":
      return {
        status: "unfetchable",
        pages: 0,
        detail: sanitizeDetail(result.detail ?? result.reason),
      };
    default: {
      // A reason this module has not been taught about is a code change that
      // forgot this file. Treat it as a failure so it surfaces on the admin
      // screen instead of being silently counted as a skip.
      const reason: string = (result as { reason: string }).reason;
      return { status: "failed", pages: 0, detail: sanitizeDetail(`unknown reason: ${reason}`) };
    }
  }
}

/**
 * Map a thrown error onto a durable status.
 *
 * Always `failed`. An exception is never evidence about the document — it is
 * evidence about us. In production the exception was thrown by the very first
 * statement of the extractor (a dynamic `import()` of a package the standalone
 * bundle did not carry), and a mapping that guessed "probably a scan" from a
 * throw would have written the reassuring answer 120 times.
 */
export function outcomeFromError(err: unknown): {
  status: IndexStatus;
  pages: number;
  detail?: string;
} {
  return { status: "failed", pages: 0, detail: sanitizeDetail(err) ?? "unknown error" };
}

/** The row shape written to `resource_index_state` (migration 0133). */
export function toRow(state: IndexStateRecord, now: Date = new Date()): Record<string, unknown> {
  const detail = sanitizeDetail(state.detail);
  const kind = classifyFailure(state.status, detail);
  const attempts = nextAttemptCount(kind, state.previousAttempts ?? 0);
  const next = nextAttemptAt(kind, attempts, now);

  return {
    record_type: state.recordType,
    record_id: state.recordId,
    status: state.status,
    pages: Math.max(0, Math.trunc(state.pages)),
    chunks: Math.max(0, Math.trunc(state.chunks)),
    detail: detail ?? null,
    source_digest: state.sourceDigest ?? null,
    failure_kind: kind,
    attempt_count: attempts,
    next_attempt_at: next ? next.toISOString() : null,
    // A claim only means something while the record is in flight; carrying it
    // on a finished row would make a dead runner look like the owner of a
    // healthy record.
    claimed_at: state.status === "running" ? now.toISOString() : null,
    claimed_by: state.status === "running" ? (state.claimedBy ?? null) : null,
    attempted_at: now.toISOString(),
  };
}

/**
 * Minimal surface of the Supabase client this module needs.
 *
 * Kept deliberately SHALLOW. Spelling the full `.select().eq().eq().maybeSingle()`
 * chain here made TypeScript match a real `SupabaseClient` against a
 * four-level nested interface and give up with "type instantiation is
 * excessively deep". The chain is asserted once, locally, in
 * `readIndexState()` instead — the same shape, checked in one place rather
 * than imposed on every caller's type.
 */
type IndexStateDb = {
  from(table: string): {
    select: (columns: string) => unknown;
    upsert: (
      values: Record<string, unknown>,
      options: { onConflict: string },
    ) => PromiseLike<{ error: { message: string } | null }>;
  };
};

/** The narrow slice of the PostgREST builder `readIndexState` walks. */
type SingleRowQuery = {
  eq(column: string, value: string): {
    eq(column: string, value: string): {
      maybeSingle(): PromiseLike<{
        data: Record<string, unknown> | null;
        error: { message: string } | null;
      }>;
    };
  };
};

/** What is already stored for a record, as the overwrite rule needs it. */
export type ExistingState = {
  status: IndexStatus;
  failureKind: FailureKind | null;
  attemptCount: number;
};

/** Read the current row, or null when there is none. Never throws. */
export async function readIndexState(
  db: IndexStateDb,
  recordType: PageRecordType,
  recordId: string,
): Promise<ExistingState | null> {
  try {
    const query = db
      .from("resource_index_state")
      .select("status, failure_kind, attempt_count") as SingleRowQuery;
    const { data, error } = await query
      .eq("record_type", recordType)
      .eq("record_id", recordId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      status: data.status as IndexStatus,
      failureKind: (data.failure_kind as FailureKind | null) ?? null,
      attemptCount: Number(data.attempt_count ?? 0) || 0,
    };
  } catch {
    // A read failure must not stop the write path: the worst case is that we
    // lose the attempt counter for one record, which the next pass restores.
    return null;
  }
}

/**
 * Record the outcome of an indexing attempt. Never throws.
 *
 * Two things happen here that did not in 0133, and both exist because of the
 * same production incident.
 *
 * 1. The attempt is CLASSIFIED (transient / permanent / config) and given a
 *    retry schedule, so a Gemini daily-quota stop is queued work rather than a
 *    broken book.
 *
 * 2. A `config` verdict is REFUSED when the stored state is not itself a
 *    config failure. A process whose storage allow-list cannot reach the
 *    files it is asked about has learned nothing about those files, and must
 *    not be allowed to overwrite what a correctly configured run established.
 *    That single rule is the difference between the laptop incident being a
 *    no-op and it being 203 false verdicts in production.
 *
 * This is bookkeeping about a background job that itself must not fail a
 * user's save, so a bookkeeping failure must not either — but it is logged at
 * error level, because a database that cannot accept this row means the admin
 * screen is about to under-report.
 */
export async function writeIndexState(
  db: IndexStateDb,
  state: IndexStateRecord,
  now: Date = new Date(),
): Promise<void> {
  const safeId = state.recordId.replace(/[^\w-]/g, "");
  const existing = await readIndexState(db, state.recordType, state.recordId);
  const kind = classifyFailure(state.status, sanitizeDetail(state.detail));

  if (!shouldOverwrite(kind, existing)) {
    console.warn(
      "[index-state] %s:%s — refusing to overwrite %s with a config failure (%s). " +
        "This process cannot reach the files it was asked about; fix the environment, not the data.",
      state.recordType,
      safeId,
      existing?.status ?? "an absent state",
      sanitizeDetail(state.detail) ?? "no detail",
    );
    return;
  }

  try {
    const { error } = await db
      .from("resource_index_state")
      .upsert(
        toRow({ ...state, previousAttempts: existing?.attemptCount ?? 0 }, now),
        { onConflict: "record_type,record_id" },
      );
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error(
      "[index-state] %s:%s — could not record status %s:",
      state.recordType,
      safeId,
      state.status,
      err instanceof Error ? err.message : err,
    );
  }
}
