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
export const INDEX_STATUSES = ["indexed", "no_text_layer", "unfetchable", "failed"] as const;
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
export function toRow(state: IndexStateRecord): Record<string, unknown> {
  return {
    record_type: state.recordType,
    record_id: state.recordId,
    status: state.status,
    pages: Math.max(0, Math.trunc(state.pages)),
    chunks: Math.max(0, Math.trunc(state.chunks)),
    detail: sanitizeDetail(state.detail) ?? null,
    source_digest: state.sourceDigest ?? null,
    attempted_at: new Date().toISOString(),
  };
}

/** Minimal surface of the Supabase client this module needs. */
type IndexStateDb = {
  from(table: string): {
    upsert(
      values: Record<string, unknown>,
      options: { onConflict: string },
    ): PromiseLike<{ error: { message: string } | null }>;
  };
};

/**
 * Record the outcome of an indexing attempt. Never throws.
 *
 * This is bookkeeping about a background job that itself must not fail a
 * user's save, so a bookkeeping failure must not either — but it is logged at
 * error level, because a database that cannot accept this row means the admin
 * screen is about to under-report, which is the failure mode this whole change
 * exists to remove.
 */
export async function writeIndexState(db: IndexStateDb, state: IndexStateRecord): Promise<void> {
  try {
    const { error } = await db
      .from("resource_index_state")
      .upsert(toRow(state), { onConflict: "record_type,record_id" });
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error(
      "[index-state] %s:%s — could not record status %s:",
      state.recordType,
      state.recordId.replace(/[^\w-]/g, ""),
      state.status,
      err instanceof Error ? err.message : err,
    );
  }
}
