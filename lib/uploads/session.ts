import "server-only";

/**
 * The durable half of an upload session: identity, ownership, state, result.
 *
 * Every state change here is a COMPARE-AND-SET against the row's current state,
 * expressed as `.eq("state", expected)` on the update. That is the whole
 * concurrency control, and it is what the previous implementation had no way to
 * express:
 *
 *   * Two finalize requests for one uploadId (the browser retried after its
 *     180 s timeout while the server was still working) both ran the full
 *     pipeline. Both hashed the file, both called VirusTotal, and both uploaded
 *     it to Zima — so a single book could leave two objects in storage, of
 *     which at most one would ever be referenced.
 *   * Two submits of the save form both inserted.
 *
 * With the CAS, the loser of either race is told SESSION_BUSY and the winner's
 * result is what everyone gets. An already-finished session replays its stored
 * result rather than redoing the work, which is what makes the protocol safe to
 * retry at every level: chunk, finalize, and database save.
 *
 * Service-role client throughout, matching book_import_runs (0129): the table
 * is not reachable from PostgREST at all, and every caller has already passed
 * requireStaff() plus the destination's permission check.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { instanceId } from "@/lib/uploads/staging";
import {
  UploadSessionError,
  canTransition,
  isValidUploadId,
  type UploadErrorCode,
  type UploadState,
} from "@/lib/uploads/state";

export type UploadSession = {
  id: string;
  ownerId: string;
  state: UploadState;
  storageKey: string;
  folder: string;
  fileName: string;
  contentType: string | null;
  declaredSize: number;
  chunkSize: number;
  totalChunks: number;
  storedUrl: string | null;
  storedBytes: number | null;
  contentHash: string | null;
  resourceType: string | null;
  resourceId: string | null;
  progressPhase: string | null;
  errorCode: UploadErrorCode | null;
  errorMessage: string | null;
  finalizeAttempts: number;
  instanceId: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapRow(row: any): UploadSession {
  return {
    id: row.id,
    ownerId: row.owner_id,
    state: row.state as UploadState,
    storageKey: row.storage_key,
    folder: row.folder,
    fileName: row.file_name,
    contentType: row.content_type ?? null,
    declaredSize: Number(row.declared_size ?? 0),
    chunkSize: Number(row.chunk_size ?? 0),
    totalChunks: Number(row.total_chunks ?? 0),
    storedUrl: row.stored_url ?? null,
    storedBytes: row.stored_bytes != null ? Number(row.stored_bytes) : null,
    contentHash: row.content_hash ?? null,
    resourceType: row.resource_type ?? null,
    resourceId: row.resource_id ?? null,
    progressPhase: row.progress_phase ?? null,
    errorCode: (row.error_code ?? null) as UploadErrorCode | null,
    errorMessage: row.error_message ?? null,
    finalizeAttempts: Number(row.finalize_attempts ?? 0),
    instanceId: row.instance_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const SELECT = "*";

/**
 * Create the session, or return the existing one unchanged.
 *
 * Idempotent by construction: the client generates the id, and a repeat of the
 * same init (a double-submit, a reconnect, a component remount) must reach the
 * same session rather than a second one. A repeat that names a DIFFERENT
 * destination is refused — the destination decides which permission row was
 * checked, so a session that could change key mid-flight would be a way to
 * finish a books-scoped upload inside publications/.
 */
export async function createSession(input: {
  id: string;
  ownerId: string;
  storageKey: string;
  folder: string;
  fileName: string;
  contentType?: string | null;
  declaredSize: number;
  chunkSize: number;
  totalChunks: number;
  ttlMs?: number;
}): Promise<UploadSession> {
  if (!isValidUploadId(input.id)) {
    throw new UploadSessionError("BAD_REQUEST", "Malformed upload id.");
  }
  const db = createServiceClient();

  const existing = await db.from("upload_sessions").select(SELECT).eq("id", input.id).maybeSingle();
  if (existing.data) {
    const session = mapRow(existing.data);
    assertOwner(session, input.ownerId);
    if (session.storageKey !== input.storageKey) {
      throw new UploadSessionError(
        "BAD_REQUEST",
        "This upload id is already in use for a different destination.",
      );
    }
    return session;
  }

  const ttlMs = input.ttlMs ?? 24 * 60 * 60 * 1000;
  const { data, error } = await db
    .from("upload_sessions")
    .insert({
      id: input.id,
      owner_id: input.ownerId,
      state: "CREATED",
      storage_key: input.storageKey,
      folder: input.folder,
      file_name: input.fileName,
      content_type: input.contentType ?? null,
      declared_size: input.declaredSize,
      chunk_size: input.chunkSize,
      total_chunks: input.totalChunks,
      instance_id: instanceId(),
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
    })
    .select(SELECT)
    .single();

  if (error) {
    // 23505: another request created it between our select and our insert.
    if (error.code === "23505") {
      const raced = await db.from("upload_sessions").select(SELECT).eq("id", input.id).single();
      const session = mapRow(raced.data);
      assertOwner(session, input.ownerId);
      return session;
    }
    throw new UploadSessionError(
      "FINALIZATION_FAILED",
      `Upload session could not be created: ${error.message}`,
    );
  }
  return mapRow(data);
}

export async function getSession(id: string): Promise<UploadSession | null> {
  if (!isValidUploadId(id)) return null;
  const db = createServiceClient();
  const { data } = await db.from("upload_sessions").select(SELECT).eq("id", id).maybeSingle();
  return data ? mapRow(data) : null;
}

/**
 * Load a session the caller is allowed to act on, or throw.
 *
 * OWNERSHIP IS THE CONTROL. Staff authorization says the caller may upload;
 * it does not say which staged bytes are theirs. Without this check any staff
 * account could finalize, cancel or read the status of any other account's
 * upload just by guessing a uuid — and could publish a book from a PDF it never
 * sent. The permission check on the destination folder is separate and still
 * applies; this one is about the session.
 */
export async function requireOwnedSession(id: string, ownerId: string): Promise<UploadSession> {
  const session = await getSession(id);
  if (!session) {
    throw new UploadSessionError("SESSION_NOT_FOUND", "This upload session no longer exists.");
  }
  assertOwner(session, ownerId);
  return session;
}

function assertOwner(session: UploadSession, ownerId: string): void {
  if (session.ownerId !== ownerId) {
    // Deliberately the same wording a missing session would produce, so the
    // response cannot be used to probe which upload ids exist.
    throw new UploadSessionError("SESSION_NOT_FOUND", "This upload session no longer exists.");
  }
}

export type TransitionPatch = {
  storedUrl?: string | null;
  storedBytes?: number | null;
  contentHash?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  errorCode?: UploadErrorCode | null;
  errorMessage?: string | null;
  bumpFinalizeAttempts?: boolean;
  claimInstance?: boolean;
  progressPhase?: string | null;
  /**
   * Push the expiry out by this many milliseconds.
   *
   * Used when the reconciler RELEASES a session — a finalize that died with its
   * process, a save that never came back. Without it the release is pointless:
   * the same pass would find the just-released session past its original expiry
   * and fail it immediately, so the operator's retry would never happen. A
   * reclaimed session gets a fresh lease, and if nothing happens during it, the
   * next pass ends it for real.
   */
  extendExpiryMs?: number;
};

/**
 * Move the session, atomically, only if it is still where the caller thinks.
 *
 * Returns null when the CAS lost — the row moved underneath us. Callers turn
 * that into SESSION_BUSY or into "replay the existing result", never into a
 * second run of the work.
 */
export async function transition(
  id: string,
  from: UploadState | UploadState[],
  to: UploadState,
  patch: TransitionPatch = {},
): Promise<UploadSession | null> {
  const fromStates = Array.isArray(from) ? from : [from];
  for (const state of fromStates) {
    if (!canTransition(state, to)) {
      throw new UploadSessionError(
        "FINALIZATION_FAILED",
        `Illegal upload transition ${state} → ${to}.`,
      );
    }
  }

  const db = createServiceClient();
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const values: Record<string, any> = { state: to };
  /* eslint-enable @typescript-eslint/no-explicit-any */
  if (patch.storedUrl !== undefined) values.stored_url = patch.storedUrl;
  if (patch.storedBytes !== undefined) values.stored_bytes = patch.storedBytes;
  if (patch.contentHash !== undefined) values.content_hash = patch.contentHash;
  if (patch.resourceType !== undefined) values.resource_type = patch.resourceType;
  if (patch.resourceId !== undefined) values.resource_id = patch.resourceId;
  // Cleared on every successful forward move: a stale error message on a
  // session that has since recovered is worse than none.
  values.error_code = patch.errorCode ?? null;
  values.error_message = patch.errorMessage ?? null;
  if (patch.progressPhase !== undefined) values.progress_phase = patch.progressPhase;
  if (patch.extendExpiryMs) {
    values.expires_at = new Date(Date.now() + patch.extendExpiryMs).toISOString();
  }
  if (patch.claimInstance) values.instance_id = instanceId();
  if (to === "STORED") values.finalized_at = new Date().toISOString();
  if (to === "COMPLETED") values.completed_at = new Date().toISOString();

  let query = db.from("upload_sessions").update(values).eq("id", id);
  query = fromStates.length === 1 ? query.eq("state", fromStates[0]) : query.in("state", fromStates);
  const { data, error } = await query.select(SELECT).maybeSingle();

  if (error) {
    throw new UploadSessionError(
      "FINALIZATION_FAILED",
      `Upload session update failed: ${error.message}`,
    );
  }
  if (!data) return null;

  if (patch.bumpFinalizeAttempts) {
    // A counter, not a gate: it is how "this upload has been retried nine
    // times" becomes visible instead of being inferred from log volume. Read
    // back from the row the CAS just returned, so it cannot double-count a
    // transition that lost.
    await db
      .from("upload_sessions")
      .update({ finalize_attempts: mapRow(data).finalizeAttempts + 1 })
      .eq("id", id);
  }
  return mapRow(data);
}

/**
 * Advisory sub-phase, for the progress panel. Best-effort by design.
 *
 * Not a CAS and not awaited for correctness anywhere: it exists so the UI can
 * say "storing" rather than leaving a 95 MB transfer indistinguishable from a
 * hung hash. A lost write costs a less precise label and nothing else.
 */
export async function setProgressPhase(id: string, phase: string): Promise<void> {
  try {
    const db = createServiceClient();
    await db.from("upload_sessions").update({ progress_phase: phase }).eq("id", id).eq("state", "FINALIZING");
  } catch {
    // A label is never worth failing an upload for.
  }
}

/** Record a terminal failure with its class. Never throws. */
export async function failSession(
  id: string,
  from: UploadState | UploadState[],
  code: UploadErrorCode,
  message: string,
): Promise<void> {
  try {
    await transition(id, from, "FAILED", { errorCode: code, errorMessage: message.slice(0, 500) });
  } catch {
    // Recording a failure must never mask the failure being recorded.
  }
}

/** Every session that is not finished, for the staging sweeper's protect list. */
export async function liveSessionIds(): Promise<string[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("upload_sessions")
    .select("id")
    .in("state", ["CREATED", "UPLOADING", "FINALIZING", "STORED", "SAVING_DB"]);
  return (data ?? []).map((r: { id: string }) => r.id);
}

/** Sessions past their expiry in a given set of states. */
export async function expiredSessions(
  states: UploadState[],
  limit = 200,
): Promise<UploadSession[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("upload_sessions")
    .select(SELECT)
    .in("state", states)
    .lt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: true })
    .limit(limit);
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return (data ?? []).map((r: any) => mapRow(r));
}

/**
 * Sessions stuck in a transient state for longer than a run could take.
 *
 * FINALIZING has a real ceiling — `maxDuration` on the route is 300 s — so a
 * session that has been FINALIZING for an hour is not slow, it is a request
 * that died with the process. Reclaiming it is what lets the operator retry
 * instead of being told SESSION_BUSY forever.
 */
export async function stuckSessions(state: UploadState, olderThanMs: number, limit = 200) {
  const db = createServiceClient();
  const { data } = await db
    .from("upload_sessions")
    .select(SELECT)
    .eq("state", state)
    .lt("updated_at", new Date(Date.now() - olderThanMs).toISOString())
    .order("updated_at", { ascending: true })
    .limit(limit);
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return (data ?? []).map((r: any) => mapRow(r));
}
