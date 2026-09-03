/**
 * Structured logging for one upload session's whole life.
 *
 * Two sinks, on purpose:
 *
 *   stdout — one JSON line per event, so `docker logs` can reconstruct a
 *            session end to end by grepping a single uploadId. This is what an
 *            operator has at 22:00 when a librarian says "it stuck at 100%",
 *            and the previous code emitted exactly one line for the entire
 *            protocol (`console.warn` on an assembly gap).
 *   app_events — a durable row for the outcomes worth counting, under the
 *            existing `storage_operation` kind (migration 0090), so failure
 *            rate per error class is a query rather than a log trawl.
 *
 * NEVER LOGGED: file contents, storage API keys, session cookies, or the
 * caller's email. `userId` is the internal profile UUID, matching the privacy
 * rule the security pipeline already follows (docs/SECURITY-MONITORING.md).
 * Filenames ARE logged: they are operator-supplied metadata about library
 * material, they are the only way to tell two concurrent imports apart, and
 * they already appear in audit rows.
 */

import { logAppEvent } from "@/lib/analytics/events";
import type { UploadErrorCode, UploadState } from "@/lib/uploads/state";

export type UploadLogEvent = {
  /** What happened. Free-form but drawn from a small, stable vocabulary. */
  event:
    | "session_created"
    | "chunk_received"
    | "chunk_duplicate"
    | "finalize_start"
    | "finalize_chunks_missing"
    | "finalize_hashed"
    | "storage_start"
    | "storage_done"
    | "finalize_done"
    | "finalize_replayed"
    | "db_save_start"
    | "db_save_done"
    | "db_save_replayed"
    | "session_failed"
    | "session_cancelled"
    | "session_reclaimed"
    | "staging_swept";
  uploadId: string | null | undefined;
  userId?: string | null;
  fileName?: string | null;
  declaredSize?: number | null;
  chunkIndex?: number | null;
  totalChunks?: number | null;
  receivedChunks?: number | null;
  storedBytes?: number | null;
  state?: UploadState | null;
  durationMs?: number | null;
  retryCount?: number | null;
  errorCode?: UploadErrorCode | null;
  /** Short, operator-facing. Never a stack, never a payload. */
  message?: string | null;
};

/** One JSON line. Cheap enough to call on every chunk of every upload. */
export function uploadLog(entry: UploadLogEvent): void {
  const line: Record<string, unknown> = { tag: "upload", ts: new Date().toISOString() };
  for (const [key, value] of Object.entries(entry)) {
    if (value !== undefined && value !== null) line[key] = value;
  }
  // stdout, not stderr, for everything that is not a failure: a container's
  // stderr is what alerting watches, and a per-chunk line there would drown it.
  const serialized = JSON.stringify(line);
  if (entry.errorCode) console.error(serialized);
  else console.log(serialized);
}

/**
 * The durable counterpart, for outcomes only.
 *
 * Deliberately NOT called per chunk: a 100 MB book is twenty chunks, and
 * twenty analytics inserts per upload would cost more than the upload.
 */
export function uploadEvent(entry: {
  event: UploadLogEvent["event"];
  status: "ok" | "error" | "timeout" | "quota" | "fallback";
  route: string;
  latencyMs?: number;
  bytes?: number;
  totalChunks?: number;
  retryCount?: number;
  errorCode?: UploadErrorCode;
}): void {
  const detail: Record<string, string | number | boolean> = { event: entry.event };
  if (entry.bytes != null) detail.bytes = entry.bytes;
  if (entry.totalChunks != null) detail.total_chunks = entry.totalChunks;
  if (entry.retryCount != null) detail.retry_count = entry.retryCount;
  if (entry.errorCode) detail.error_code = entry.errorCode;
  logAppEvent({
    kind: "storage_operation",
    status: entry.status,
    route: entry.route,
    latencyMs: entry.latencyMs,
    detail,
  });
}
