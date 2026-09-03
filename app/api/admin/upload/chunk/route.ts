/**
 * Chunked upload protocol for large admin files.
 *
 * WHAT CHANGED AND WHY
 *
 * The previous version of this route had one verb. Every request was a chunk,
 * and the LAST chunk implicitly triggered assembly, hashing, a malware lookup,
 * a duplicate query and a full upload to storage — all inside the same request
 * that carried the final 5 MB. Four defects followed from that single design
 * choice, and every symptom operators reported is one of them:
 *
 *   1. "It reaches 100% and stays there." The browser's progress bar measures
 *      the request BODY. On the final chunk the body finishes in a second and
 *      then the server works for up to four minutes with nothing to report it.
 *      Finalization is now its own request with its own state, and the client
 *      polls the session rather than staring at a finished upload stream.
 *
 *   2. "Missing chunk 0 during final assembly." The client's 180 s timeout on
 *      the final chunk fired while the server was still finalizing. It retried,
 *      the retry ran a SECOND finalization concurrently, and whichever finished
 *      first deleted the staging directory out from under the other — which
 *      then reported chunk 0 as missing. Finalization is now a compare-and-set
 *      on the session row: the second attempt is told the first is in progress,
 *      or replayed the first's result. Nothing deletes staged bytes until a
 *      finalization has actually succeeded.
 *
 *   3. Unbounded memory. Assembly read every part with `readFileSync`, then
 *      `Buffer.concat`ed them, then sliced the result, then wrapped it in a
 *      `File`, which `fetch` then serialized into a multipart body — five
 *      simultaneous copies of the whole file, in a container with a 1 GB
 *      memory limit. Nothing here now holds more than a 1 MB window: the hash
 *      is streamed, and the file is streamed into storage by
 *      `zimaUploadStream()`.
 *
 *   4. No ownership on the session. Any staff account could finalize any other
 *      account's staged bytes by guessing an id. The session row records its
 *      owner and every verb checks it.
 *
 * THE VERBS
 *
 *   POST  action=chunk     stage one part (implicitly creates the session)
 *   POST  action=init      create the session up front (optional)
 *   POST  action=finalize  assemble, verify, store — idempotent
 *   GET   ?uploadId=…      session state + exactly which parts are missing
 *   DELETE ?uploadId=…     cancel and reclaim
 *
 * Finalization is never implicit. That is the load-bearing change: a chunk
 * request now does one small thing and says so, and every expensive, failure-
 * prone step happens in a request the client asked for and can retry safely.
 */

import { NextRequest, NextResponse } from "next/server";

import { isAdminAuthError, requirePermission, requireStaff } from "@/lib/auth/requireAdmin";
import { uploadPermissionResource } from "@/lib/storage/permission-resource";
import { resolveUploadType } from "@/lib/mime-validation";
import { findDuplicatePdf } from "@/lib/content-hash";
import { zimaUpload, zimaUploadStream, isZimaUploadError } from "@/lib/zima";
import { optimizeImage, BOOK_COVER_OPTS, POST_IMAGE_OPTS } from "@/lib/image-optimize";
import { logSecurityEvent } from "@/lib/security-log";
import { describeStorageKeyError } from "@/lib/storage/folder-name";
import { checkFileHashReputation, isVirusScanFailClosed } from "@/lib/virus-scan";
import { uploadLog, uploadEvent } from "@/lib/uploads/log";
import {
  assembleStream,
  digestSession,
  discardSessionStaging,
  inspectChunks,
  instanceId,
  openSessionStaging,
  readHead,
  stagingIsEphemeral,
  writeChunk,
} from "@/lib/uploads/staging";
import {
  createSession,
  getSession,
  requireOwnedSession,
  transition,
  failSession,
  setProgressPhase,
  type UploadSession,
} from "@/lib/uploads/session";
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  UploadSessionError,
  isUploadSessionError,
  isValidUploadId,
  stageForState,
} from "@/lib/uploads/state";

export const runtime = "nodejs";
export const maxDuration = 300;

const ROUTE = "/api/admin/upload/chunk";

const ALLOWED_PREFIXES = ["books/", "posts/", "research/", "reports/", "publications/", "paths/"];

/** One byte under 100 MiB — see MAX_UPLOAD_BYTES for why the byte matters. */
const MAX_TOTAL_UPLOAD_BYTES = MAX_UPLOAD_BYTES;
/** Smallest chunk we will accept, so a client cannot request 100k requests. */
const MIN_CHUNK_BYTES = 256 * 1024;
/** Derived, not guessed: enough parts to carry the cap at the smallest chunk. */
const MAX_CHUNKS = Math.ceil(MAX_TOTAL_UPLOAD_BYTES / MIN_CHUNK_BYTES);

function presetsForFolder(key: string) {
  if (key.startsWith("books/")) return BOOK_COVER_OPTS;
  if (key.startsWith("posts/")) return POST_IMAGE_OPTS;
  return {};
}

/** The public shape of a session. Never leaks the owner id or the raw error. */
function sessionView(session: UploadSession, extra: Record<string, unknown> = {}) {
  return {
    uploadId: session.id,
    state: session.state,
    stage: stageForState(session.state),
    totalChunks: session.totalChunks,
    chunkSize: session.chunkSize,
    phase: session.progressPhase,
    url: session.storedUrl,
    contentHash: session.contentHash,
    bytes: session.storedBytes,
    errorCode: session.errorCode,
    ...extra,
  };
}

function errorResponse(err: UploadSessionError) {
  return NextResponse.json(
    {
      error: err.message,
      errorCode: err.code,
      retryable: err.retryable,
      ...(err.detail ?? {}),
    },
    { status: err.status },
  );
}

/**
 * Validate a destination key and confirm the caller may write there.
 *
 * Same rules as `/api/admin/upload`, applied at session creation rather than on
 * every chunk: the key is fixed for the life of the session (the session row
 * stores it), so re-deriving the permission resource from a client-supplied key
 * on request 14 of 20 would only create a way for it to disagree with request 1.
 */
async function assertDestinationAllowed(key: string): Promise<void> {
  if (!key) {
    throw new UploadSessionError("BAD_REQUEST", "Missing destination key");
  }
  if (key.startsWith("/") || key.startsWith("\\") || key.includes("..") || key.includes("\\")) {
    logSecurityEvent({ type: "upload_rejected", where: ROUTE, detail: "path traversal attempt in key" });
    throw new UploadSessionError("BAD_REQUEST", "Invalid file path");
  }
  if (!ALLOWED_PREFIXES.some((p) => key.startsWith(p))) {
    throw new UploadSessionError(
      "BAD_REQUEST",
      "File path must start with books/, posts/, research/, reports/, publications/, or paths/",
    );
  }
  const pathProblem = describeStorageKeyError(key);
  if (pathProblem) {
    throw new UploadSessionError("BAD_REQUEST", pathProblem);
  }
  await requirePermission(uploadPermissionResource(key), "write");
}

function intField(form: FormData, name: string): number {
  const raw = form.get(name);
  return typeof raw === "string" ? Number.parseInt(raw, 10) : Number.NaN;
}

function strField(form: FormData, name: string): string {
  const raw = form.get(name);
  return typeof raw === "string" ? raw.trim() : "";
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Establishes who is asking before any body is read, exactly as
    // /api/admin/upload does and for the same reason: an anonymous or reader
    // request must be refused without buffering a 5 MB part first.
    const { user } = await requireStaff();

    const form = await request.formData();
    const action = strField(form, "action") || (form.get("chunk") ? "chunk" : "");
    const uploadId = strField(form, "uploadId");

    if (!isValidUploadId(uploadId)) {
      throw new UploadSessionError("BAD_REQUEST", "Invalid or missing uploadId");
    }

    switch (action) {
      case "init":
        return await handleInit(form, uploadId, user.id);
      case "chunk":
        return await handleChunk(form, uploadId, user.id);
      case "finalize":
        return await handleFinalize(form, uploadId, user.id);
      default:
        throw new UploadSessionError(
          "BAD_REQUEST",
          'Unknown upload action. Expected "init", "chunk" or "finalize".',
        );
    }
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * Create (or re-attach to) the session.
 *
 * Refusing an ephemeral filesystem HERE rather than at finalization is the
 * point: on a platform where consecutive requests do not share a disk, the old
 * design accepted twenty chunks and only discovered the loss at the end, as
 * "Missing chunk 0" — a message that blames the browser for a property of the
 * deployment. This says so before a byte is sent.
 */
async function handleInit(form: FormData, uploadId: string, ownerId: string) {
  if (stagingIsEphemeral()) {
    throw new UploadSessionError(
      "CHUNK_STORAGE_UNAVAILABLE",
      "Chunked upload needs a persistent staging directory. Set UPLOAD_STAGING_DIR to a mounted volume on this deployment.",
    );
  }

  const key = strField(form, "key");
  await assertDestinationAllowed(key);

  const fileName = strField(form, "fileName") || "upload";
  const declaredSize = intField(form, "fileSize");
  const chunkSize = intField(form, "chunkSize");
  const totalChunks = intField(form, "totalChunks");
  const contentType = strField(form, "contentType") || null;

  if (!Number.isFinite(declaredSize) || declaredSize <= 0) {
    throw new UploadSessionError("BAD_REQUEST", "Missing or invalid fileSize");
  }
  if (declaredSize > MAX_TOTAL_UPLOAD_BYTES) {
    throw new UploadSessionError(
      "UPLOAD_LIMIT",
      `File exceeds the ${MAX_UPLOAD_LABEL} maximum (${declaredSize} bytes; the limit is ${MAX_TOTAL_UPLOAD_BYTES}).`,
    );
  }
  if (!Number.isFinite(totalChunks) || totalChunks < 1 || totalChunks > MAX_CHUNKS) {
    throw new UploadSessionError("BAD_REQUEST", `Invalid totalChunks (1–${MAX_CHUNKS}).`);
  }
  if (!Number.isFinite(chunkSize) || chunkSize < MIN_CHUNK_BYTES) {
    throw new UploadSessionError("BAD_REQUEST", "Invalid chunkSize.");
  }
  // The client's own arithmetic must be self-consistent; a mismatch means the
  // two sides disagree about how the file is cut, and every downstream size
  // check would then be checking the wrong thing.
  if (Math.ceil(declaredSize / chunkSize) !== totalChunks) {
    throw new UploadSessionError("BAD_REQUEST", "fileSize, chunkSize and totalChunks disagree.");
  }

  const lastSlash = key.lastIndexOf("/");
  const folder = lastSlash > 0 ? key.slice(0, lastSlash) : key;

  const session = await createSession({
    id: uploadId,
    ownerId,
    storageKey: key,
    folder,
    fileName,
    contentType,
    declaredSize,
    chunkSize,
    totalChunks,
  });
  await openSessionStaging(uploadId);

  uploadLog({
    event: "session_created",
    uploadId,
    userId: ownerId,
    fileName,
    declaredSize,
    totalChunks,
    state: session.state,
  });

  const presence = await inspectChunks(uploadId, session.totalChunks);
  return NextResponse.json(
    sessionView(session, { present: presence.present, missing: presence.missing }),
  );
}

/**
 * Stage one part.
 *
 * The session is created implicitly when it does not exist, so a lost `init`
 * (a dropped connection, a client that never sent one) costs a round-trip
 * rather than the whole upload. Everything else about the session is then
 * immutable: a later chunk naming a different destination is refused.
 */
async function handleChunk(form: FormData, uploadId: string, ownerId: string) {
  const chunk = form.get("chunk");
  if (!(chunk instanceof File) || chunk.size === 0) {
    throw new UploadSessionError("BAD_REQUEST", "Missing or empty chunk");
  }

  let session = await requireOwnedSessionOrCreate(form, uploadId, ownerId);

  if (session.state === "COMPLETED" || session.state === "STORED" || session.state === "SAVING_DB") {
    // The file is already stored. A late-arriving chunk is a retransmission
    // from a client that has not seen the result yet; hand it the result rather
    // than re-opening a finished session.
    uploadLog({ event: "chunk_duplicate", uploadId, userId: ownerId, state: session.state });
    return NextResponse.json(sessionView(session, { alreadyStored: true }));
  }
  if (session.state === "FAILED" || session.state === "CANCELLED") {
    throw new UploadSessionError(
      "SESSION_NOT_FOUND",
      "This upload was cancelled or failed. Start it again.",
    );
  }
  if (session.instanceId && session.instanceId !== instanceId()) {
    // Only reachable on a multi-instance deployment. Saying this is the whole
    // reason `instance_id` is recorded: the alternative is reporting the other
    // instance's chunks as missing and asking the client to re-send 95 MB.
    throw new UploadSessionError(
      "CHUNK_STORAGE_UNAVAILABLE",
      "This upload is staged on a different server instance. Start it again.",
    );
  }

  const chunkIndex = intField(form, "chunkIndex");
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= session.totalChunks) {
    throw new UploadSessionError("BAD_REQUEST", "Invalid chunkIndex");
  }
  // A part may only be as large as the session said its parts are, and the last
  // one only as large as the remainder. Without this the declared size is
  // advisory and a client could stage far more than the cap allows.
  const expectedMax =
    chunkIndex === session.totalChunks - 1
      ? session.declaredSize - chunkIndex * session.chunkSize
      : session.chunkSize;
  if (chunk.size > expectedMax) {
    throw new UploadSessionError(
      "UPLOAD_LIMIT",
      `Chunk ${chunkIndex} is larger than this session declared.`,
    );
  }

  await openSessionStaging(uploadId);
  const { bytes } = await writeChunk(uploadId, chunkIndex, chunk.stream());

  if (session.state === "CREATED") {
    session = (await transition(uploadId, "CREATED", "UPLOADING", { claimInstance: true })) ?? session;
  }

  const presence = await inspectChunks(uploadId, session.totalChunks);
  // Belt and braces against a client that lies about `fileSize`: the staged
  // total can never exceed what the session declared.
  if (presence.bytes > session.declaredSize) {
    await discardSessionStaging(uploadId);
    await failSession(uploadId, ["CREATED", "UPLOADING"], "UPLOAD_LIMIT", "Staged bytes exceeded the declared size.");
    throw new UploadSessionError("UPLOAD_LIMIT", "The upload sent more data than it declared.");
  }

  uploadLog({
    event: "chunk_received",
    uploadId,
    userId: ownerId,
    chunkIndex,
    totalChunks: session.totalChunks,
    receivedChunks: presence.present.length,
    storedBytes: bytes,
  });

  return NextResponse.json(
    sessionView(session, {
      chunkIndex,
      received: presence.present.length,
      missing: presence.missing,
      stagedBytes: presence.bytes,
    }),
  );
}

/**
 * The session for this chunk, created if the client never sent an `init`.
 *
 * A lost init — a dropped connection, a client that skipped the step — should
 * cost a round-trip, not the upload. `handleInit` is reused rather than
 * duplicated so the destination validation, the permission check and the
 * arithmetic consistency check happen exactly once, wherever the session is
 * born.
 */
async function requireOwnedSessionOrCreate(
  form: FormData,
  uploadId: string,
  ownerId: string,
): Promise<UploadSession> {
  const existing = await getSession(uploadId);
  if (!existing) await handleInit(form, uploadId, ownerId);
  return await requireOwnedSession(uploadId, ownerId);
}

/**
 * Assemble, verify and store. Idempotent, and safe to call concurrently.
 *
 * The order of the checks is chosen so that the cheapest refusal happens first
 * and nothing expensive runs twice:
 *
 *   claim → parts present → magic bytes (4 KB) → hash (streamed) → malware →
 *   duplicate → storage
 *
 * A duplicate PDF is refused after the hash, which is unavoidable — the hash IS
 * the identity — but before the upload, which is the expensive half. The head
 * sniff reads 4 KB rather than the 100 MB the old code had already
 * concatenated by this point.
 */
async function handleFinalize(form: FormData, uploadId: string, ownerId: string) {
  const started = Date.now();
  const session = await requireOwnedSession(uploadId, ownerId);

  // ── Replay: the work is already done ──────────────────────────────────────
  // This is what makes a client timeout harmless. The old route had no way to
  // answer "you already did this", so a retry after a 180 s timeout ran the
  // entire pipeline a second time and uploaded the file to storage twice.
  if (session.state === "STORED" || session.state === "SAVING_DB" || session.state === "COMPLETED") {
    uploadLog({ event: "finalize_replayed", uploadId, userId: ownerId, state: session.state });
    return NextResponse.json(sessionView(session, { replayed: true }));
  }
  if (session.state === "FAILED" || session.state === "CANCELLED") {
    throw new UploadSessionError(
      "SESSION_NOT_FOUND",
      session.errorMessage ?? "This upload already ended. Start it again.",
    );
  }

  await assertDestinationAllowed(session.storageKey);

  // Same reason as in handleChunk: on a multi-instance deployment the staged
  // parts live on ONE instance's disk. Reaching a different one and reporting
  // every part missing would send the client back to re-upload the whole file
  // — over and over, since the next attempt is just as likely to land wrong.
  if (session.instanceId && session.instanceId !== instanceId()) {
    throw new UploadSessionError(
      "CHUNK_STORAGE_UNAVAILABLE",
      "This upload is staged on a different server instance. Start it again.",
    );
  }

  // ── Claim: compare-and-set is the concurrency control ─────────────────────
  const claimed = await transition(uploadId, ["CREATED", "UPLOADING"], "FINALIZING", {
    bumpFinalizeAttempts: true,
    claimInstance: false,
    progressPhase: "verifying",
  });
  if (!claimed) {
    throw new UploadSessionError(
      "SESSION_BUSY",
      "This upload is already being finalized. Wait for it to finish.",
    );
  }

  uploadLog({
    event: "finalize_start",
    uploadId,
    userId: ownerId,
    fileName: session.fileName,
    totalChunks: session.totalChunks,
    retryCount: claimed.finalizeAttempts,
  });

  try {
    // 1. Every part present? Hand the session back if not — this is recoverable
    //    and must NOT be a failure: the chunks we do hold are still good.
    const presence = await inspectChunks(uploadId, session.totalChunks);
    if (presence.missing.length > 0) {
      await transition(uploadId, "FINALIZING", "UPLOADING", {
        errorCode: "CHUNK_MISSING",
        errorMessage: `Missing ${presence.missing.length} of ${session.totalChunks} parts.`,
      });
      uploadLog({
        event: "finalize_chunks_missing",
        uploadId,
        userId: ownerId,
        totalChunks: session.totalChunks,
        receivedChunks: presence.present.length,
        errorCode: "CHUNK_MISSING",
      });
      throw new UploadSessionError(
        "CHUNK_MISSING",
        `The server is missing ${presence.missing.length} of ${session.totalChunks} parts. They are being re-sent.`,
        { missingChunks: presence.missing, received: presence.present.length },
      );
    }

    if (presence.bytes > MAX_TOTAL_UPLOAD_BYTES) {
      throw new UploadSessionError("UPLOAD_LIMIT", `Assembled file exceeds the ${MAX_UPLOAD_LABEL} limit.`);
    }

    // 2. Content type, from 4 KB of the first part.
    const head = await readHead(uploadId);
    const declaredType = session.contentType ?? "application/octet-stream";
    const { ok: contentOk, effectiveType } = resolveUploadType(head.buffer.slice(head.byteOffset, head.byteOffset + head.byteLength) as ArrayBuffer, declaredType);
    if (!contentOk) {
      logSecurityEvent({
        type: "upload_rejected",
        where: ROUTE,
        detail: `content does not match declared type ${declaredType}`,
      });
      throw new UploadSessionError(
        "CONTENT_REJECTED",
        `Invalid file: content does not match allowed file types (${declaredType}).`,
      );
    }

    // 3. Hash, streamed. `bytes` is the file's true length — the only size any
    //    later step is allowed to act on.
    const { hash: fileHash, bytes } = await digestSession(uploadId, session.totalChunks);
    if (bytes > MAX_TOTAL_UPLOAD_BYTES) {
      throw new UploadSessionError("UPLOAD_LIMIT", `Assembled file exceeds the ${MAX_UPLOAD_LABEL} limit.`);
    }
    uploadLog({
      event: "finalize_hashed",
      uploadId,
      userId: ownerId,
      storedBytes: bytes,
      durationMs: Date.now() - started,
    });

    // 4. Malware reputation, by hash. Unchanged posture: fails open unless
    //    FAIL_CLOSED_VIRUS_SCAN says otherwise.
    const scan = await checkFileHashReputation(fileHash);
    if (scan.verdict === "malicious") {
      logSecurityEvent({
        type: "virus_scan_blocked",
        where: ROUTE,
        detail: `${scan.detections} AV engines flagged this file's hash`,
      });
      throw new UploadSessionError(
        "MALWARE_BLOCKED",
        "This file was flagged as malicious by security scanning and cannot be uploaded.",
      );
    }
    if (!scan.scanned && isVirusScanFailClosed()) {
      throw new UploadSessionError(
        "MALWARE_BLOCKED",
        "Malware scanning is unavailable and this deployment requires it. Try again shortly.",
      );
    }

    // 5. Duplicate, for PDFs only.
    let contentHash: string | null = null;
    if (effectiveType === "application/pdf") {
      contentHash = fileHash;
      const excludeType = strField(form, "excludeType");
      const excludeId = strField(form, "excludeId");
      const exclude: { type: "book" | "research"; id: string } | undefined =
        excludeId && (excludeType === "book" || excludeType === "research")
          ? { type: excludeType, id: excludeId }
          : undefined;
      const duplicate = await findDuplicatePdf(contentHash, exclude);
      if (duplicate) {
        throw new UploadSessionError(
          "DUPLICATE_FILE",
          `This PDF is already in the library as "${duplicate.title}" (${duplicate.url}). Upload cancelled.`,
          { duplicate },
        );
      }
    }

    // 6. Store.
    await setProgressPhase(uploadId, "storing");
    uploadLog({ event: "storage_start", uploadId, userId: ownerId, storedBytes: bytes });
    const storageStarted = Date.now();
    const url = await storeFinalizedFile(session, effectiveType, bytes);
    uploadLog({
      event: "storage_done",
      uploadId,
      userId: ownerId,
      storedBytes: bytes,
      durationMs: Date.now() - storageStarted,
    });

    // 7. Record the result BEFORE reclaiming the staged bytes. If the process
    //    dies between the two, the reconciler finds a STORED session whose
    //    staging directory is stale — recoverable. The other order loses the
    //    only record that the file reached storage at all.
    const stored = await transition(uploadId, "FINALIZING", "STORED", {
      storedUrl: url,
      storedBytes: bytes,
      contentHash,
      progressPhase: null,
    });
    if (!stored) {
      // Something else moved the row — a cancel, or the reconciler. The bytes
      // are in storage either way, so say so rather than pretending otherwise.
      throw new UploadSessionError(
        "FINALIZATION_FAILED",
        "The upload finished but its session had already ended. The file is in storage; check /admin/books before retrying.",
      );
    }

    await discardSessionStaging(uploadId);

    uploadLog({
      event: "finalize_done",
      uploadId,
      userId: ownerId,
      storedBytes: bytes,
      durationMs: Date.now() - started,
      state: "STORED",
    });
    uploadEvent({
      event: "finalize_done",
      status: "ok",
      route: ROUTE,
      latencyMs: Date.now() - started,
      bytes,
      totalChunks: session.totalChunks,
      retryCount: claimed.finalizeAttempts,
    });

    return NextResponse.json(sessionView(stored, { success: true }));
  } catch (err) {
    await recordFinalizationFailure(uploadId, err, started, session.totalChunks);
    throw err;
  }
}

/**
 * Move the file into storage.
 *
 * PDFs — everything large — stream straight from the staged parts into the
 * multipart request, so peak memory is a 1 MB window regardless of file size.
 * Images take the buffered path because `sharp` needs the whole image anyway;
 * they are capped at 5 MB by every form that sends one.
 */
async function storeFinalizedFile(
  session: UploadSession,
  effectiveType: string,
  bytes: number,
): Promise<string> {
  const isImage = effectiveType.startsWith("image/");

  if (!isImage) {
    return await zimaUploadStream(
      assembleStream(session.id, session.totalChunks),
      bytes,
      session.folder,
      session.fileName,
      effectiveType,
    );
  }

  const parts: Buffer[] = [];
  for await (const piece of assembleStream(session.id, session.totalChunks)) {
    parts.push(piece as Buffer);
  }
  const buffer = Buffer.concat(parts);
  const optimized = await optimizeImage(
    buffer,
    session.fileName,
    effectiveType,
    presetsForFolder(session.storageKey),
  );
  return await zimaUpload(
    new File([optimized.buffer as BlobPart], optimized.filename, { type: optimized.contentType }),
    session.folder,
    optimized.filename,
  );
}

/**
 * Turn a finalization failure into the right session state.
 *
 * The distinction that matters: a failure BEFORE storage leaves nothing behind
 * and the session is simply FAILED; CHUNK_MISSING has already handed the
 * session back to UPLOADING and must not be overwritten. Staged bytes are kept
 * for a failure the operator can retry — deleting them was what turned one
 * transient duplicate check into "now re-upload the whole 80 MB".
 */
async function recordFinalizationFailure(
  uploadId: string,
  err: unknown,
  started: number,
  totalChunks: number,
): Promise<void> {
  const code = isUploadSessionError(err)
    ? err.code
    : isZimaUploadError(err)
      ? "ZIMA_UPLOAD_FAILED"
      : "FINALIZATION_FAILED";
  const message = err instanceof Error ? err.message : "Finalization failed";

  if (code !== "CHUNK_MISSING") {
    const terminal =
      code === "DUPLICATE_FILE" || code === "MALWARE_BLOCKED" || code === "CONTENT_REJECTED" ||
      code === "UPLOAD_LIMIT";
    if (terminal) {
      // Nothing about retrying this file will change the answer, so end the
      // session and give the disk back.
      await failSession(uploadId, "FINALIZING", code, message);
      await discardSessionStaging(uploadId);
    } else {
      // Transient: hand the session back so the SAME staged bytes can be
      // finalized again without re-uploading them.
      await transition(uploadId, "FINALIZING", "UPLOADING", {
        errorCode: code,
        errorMessage: message.slice(0, 500),
      }).catch(() => undefined);
    }
  }

  uploadLog({
    event: "session_failed",
    uploadId,
    totalChunks,
    durationMs: Date.now() - started,
    errorCode: code,
    message: message.slice(0, 300),
  });
  uploadEvent({
    event: "session_failed",
    status: "error",
    route: ROUTE,
    latencyMs: Date.now() - started,
    totalChunks,
    errorCode: code,
  });
}

// ── GET: what does the server actually have? ─────────────────────────────────

/**
 * The question the old protocol could not answer.
 *
 * A client that lost its connection, was refreshed, or hit a timeout had no way
 * to ask "where are we?" — its only move was to re-send everything or to retry
 * the finalize and hope. This answers with the session's state and the exact
 * indexes missing from the staging area, read from the disk rather than from a
 * counter that could disagree with it.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireStaff();
    const uploadId = request.nextUrl.searchParams.get("uploadId")?.trim() ?? "";
    if (!isValidUploadId(uploadId)) {
      throw new UploadSessionError("BAD_REQUEST", "Invalid or missing uploadId");
    }
    const session = await requireOwnedSession(uploadId, user.id);
    const presence =
      session.state === "CREATED" || session.state === "UPLOADING" || session.state === "FINALIZING"
        ? await inspectChunks(uploadId, session.totalChunks)
        : { present: [], missing: [], bytes: 0, sizes: new Map<number, number>() };

    return NextResponse.json(
      sessionView(session, {
        present: presence.present,
        missing: presence.missing,
        stagedBytes: presence.bytes,
        error: session.errorMessage,
      }),
    );
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── DELETE: cancel ───────────────────────────────────────────────────────────

/**
 * Cancel an upload the operator abandoned.
 *
 * A session that has NOT stored anything is simply cancelled and its staged
 * bytes reclaimed. A session that HAS stored is left in STORED and reported as
 * such: the file exists, and deciding whether to delete it is the reconciler's
 * job, made against the database rather than against a UI event. That is the
 * rule the old client broke — it deleted the stored PDF whenever the save
 * request failed for any reason, including a timeout on a save that had
 * actually succeeded.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { user } = await requireStaff();
    const uploadId = request.nextUrl.searchParams.get("uploadId")?.trim() ?? "";
    if (!isValidUploadId(uploadId)) {
      throw new UploadSessionError("BAD_REQUEST", "Invalid or missing uploadId");
    }
    const session = await requireOwnedSession(uploadId, user.id);

    if (session.state === "COMPLETED") {
      return NextResponse.json(sessionView(session, { cancelled: false }));
    }
    if (session.state === "STORED" || session.state === "SAVING_DB") {
      return NextResponse.json(
        sessionView(session, {
          cancelled: false,
          note: "The file is already in storage. Use the review queue or the reconciler to remove it.",
        }),
      );
    }

    const cancelled = await transition(uploadId, ["CREATED", "UPLOADING", "FINALIZING"], "CANCELLED");
    await discardSessionStaging(uploadId);
    uploadLog({ event: "session_cancelled", uploadId, userId: user.id, state: "CANCELLED" });
    return NextResponse.json(sessionView(cancelled ?? session, { cancelled: true }));
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── Shared error mapping ─────────────────────────────────────────────────────

function handleRouteError(err: unknown) {
  if (isAdminAuthError(err)) {
    return NextResponse.json({ error: err.message, errorCode: "NOT_AUTHORIZED" }, { status: err.status });
  }
  if (isUploadSessionError(err)) {
    return errorResponse(err);
  }
  // A storage 429 or 5xx must reach the client AS a 429/5xx with its
  // Retry-After intact — the bulk importer decides to wait rather than fail the
  // row from exactly that.
  if (isZimaUploadError(err)) {
    if (err.status !== 400) {
      const headers = err.retryAfterSeconds
        ? { "Retry-After": String(err.retryAfterSeconds) }
        : undefined;
      return NextResponse.json(
        {
          error: err.message,
          errorCode: "ZIMA_UPLOAD_FAILED",
          retryAfterSeconds: err.retryAfterSeconds,
          retryable: err.retryable,
        },
        { status: err.status === 429 ? 429 : 503, headers },
      );
    }
    return NextResponse.json(
      { error: err.message, errorCode: "ZIMA_UPLOAD_FAILED", retryable: false },
      { status: 400 },
    );
  }
  console.error(`[${ROUTE}]`, err);
  return NextResponse.json(
    {
      error: err instanceof Error ? err.message : "Chunked upload failed",
      errorCode: "FINALIZATION_FAILED",
    },
    { status: 500 },
  );
}
