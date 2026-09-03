import {
  UploadHttpError,
  type UploadOptions,
  type UploadProgress,
} from "@/lib/upload-progress";
import type { UploadErrorCode, UploadStage } from "@/lib/uploads/state";

export const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB per chunk

/**
 * Client half of the chunked upload protocol.
 *
 * WHAT THE OLD ONE GOT WRONG, AND WHY IT LOOKED LIKE A HANG
 *
 * It had no concept of the upload existing on the server. It sent N chunks and
 * treated the Nth request's response as the whole result, which made three
 * things impossible:
 *
 *   * It could not distinguish "the server is still working" from "the server
 *     is gone". So its 180 s timeout on the last chunk fired while a legitimate
 *     finalize was in progress, it retried, and the retry raced the original —
 *     which is how one upload became two objects in storage and, when the
 *     winner cleaned up, "Missing chunk 0 during final assembly".
 *   * It could not resume. A dropped connection meant re-sending everything.
 *   * It could not report anything past "the last byte left the browser", so it
 *     showed 100% for the whole of the server's work. That is the reported
 *     symptom "progress reaches 100% but the UI stays loading" — the bar was
 *     telling the truth about the wrong thing.
 *
 * Now: an explicit session, chunks that can be re-sent individually, a separate
 * finalize call that is safe to repeat, and — the part that matters for the
 * hang — a timeout on finalize that ASKS THE SERVER what happened instead of
 * assuming failure.
 */

export type ChunkedUploadResult = {
  url: string;
  contentHash?: string | null;
  uploadId: string;
  bytes?: number | null;
};

export type ChunkedUploadOptions = Omit<UploadOptions, "onProgress"> & {
  onProgress?: (progress: UploadProgress) => void;
  /** Chunk size in bytes (default 5 MB). */
  chunkSize?: number;
  /** Retry attempts per chunk (default 3). */
  maxRetries?: number;
  /** Extra form fields forwarded with every request (excludeType, excludeId…). */
  extraFields?: Record<string, string | null | undefined>;
  /**
   * Reuse an id from a previous attempt to resume it. Only the parts the
   * server is missing are re-sent.
   */
  uploadId?: string;
};

/** A failure that carries the server's error class, so callers can branch. */
export class ChunkedUploadError extends UploadHttpError {
  readonly errorCode?: UploadErrorCode;
  readonly uploadId: string;
  readonly serverRetryable: boolean;
  /**
   * Which parts the server says it does not have.
   *
   * Carried on the ERROR rather than left in an untyped `payload` bag: this is
   * the list the client has to act on, and reaching it through a cast is how
   * the previous implementation ended up ignoring it and retrying the finalize
   * unchanged — forever, against a server that would answer identically every
   * time.
   */
  readonly missingChunks?: number[];

  constructor(
    message: string,
    status: number,
    uploadId: string,
    errorCode?: UploadErrorCode,
    retryable = false,
    missingChunks?: number[],
  ) {
    super(message, status);
    this.name = "ChunkedUploadError";
    this.errorCode = errorCode;
    this.uploadId = uploadId;
    this.serverRetryable = retryable;
    this.missingChunks = missingChunks;
  }
}

type ServerPayload = {
  error?: string;
  errorCode?: UploadErrorCode;
  retryable?: boolean;
  state?: string;
  phase?: string | null;
  url?: string | null;
  contentHash?: string | null;
  bytes?: number | null;
  missing?: number[];
  missingChunks?: number[];
  present?: number[];
  duplicate?: unknown;
};

/** How long to keep asking the server about a finalize that stopped answering. */
const FINALIZE_WATCH_MS = 10 * 60 * 1000;
const FINALIZE_POLL_MS = 2_000;

export async function uploadChunked<T = ChunkedUploadResult>(
  endpoint: string,
  file: File,
  key: string,
  options: ChunkedUploadOptions = {},
): Promise<T> {
  const {
    chunkSize = DEFAULT_CHUNK_SIZE,
    maxRetries = 3,
    onProgress,
    signal,
    extraFields = {},
  } = options;

  throwIfAborted(signal);

  const uploadId = options.uploadId ?? newUploadId();
  const totalBytes = file.size;
  const totalChunks = Math.max(1, Math.ceil(totalBytes / chunkSize));

  const emit = (loaded: number, stage: UploadStage, phase?: string | null) => {
    onProgress?.({
      loaded,
      total: totalBytes,
      fraction: stage === "sending" && totalBytes > 0 ? Math.min(1, loaded / totalBytes) : 1,
      stage,
      phase: phase ?? null,
    });
  };

  emit(0, "sending");

  const base = () => {
    const fd = new FormData();
    fd.set("uploadId", uploadId);
    fd.set("key", key);
    fd.set("fileName", file.name);
    fd.set("fileSize", String(totalBytes));
    fd.set("chunkSize", String(chunkSize));
    fd.set("totalChunks", String(totalChunks));
    fd.set("contentType", file.type || "application/octet-stream");
    for (const [k, v] of Object.entries(extraFields)) {
      if (v !== undefined && v !== null) fd.set(k, v);
    }
    return fd;
  };

  // ── 1. Open the session ────────────────────────────────────────────────────
  // Explicit rather than implicit so a destination the caller may not write to,
  // or a deployment that cannot stage chunks at all, is refused BEFORE the
  // first 5 MB goes out instead of after the last one.
  const init = base();
  init.set("action", "init");
  const opened = await postForm(endpoint, init, uploadId, { signal });

  // Already finished on a previous attempt — nothing to send.
  if (opened.url) {
    emit(totalBytes, "complete");
    return { url: opened.url, contentHash: opened.contentHash, uploadId, bytes: opened.bytes } as T;
  }

  // ── 2. Send the parts the server does not already hold ─────────────────────
  const held = new Set(opened.present ?? []);
  let sentBytes = held.size > 0 ? Math.min(totalBytes, held.size * chunkSize) : 0;

  for (let index = 0; index < totalChunks; index++) {
    throwIfAborted(signal);
    if (held.has(index)) continue;

    const start = index * chunkSize;
    const end = Math.min(totalBytes, start + chunkSize);
    const already = sentBytes;

    await withRetries(maxRetries, signal, () =>
      sendChunk({
        endpoint,
        form: base(),
        uploadId,
        index,
        blob: file.slice(start, end),
        fileName: file.name,
        signal,
        onBytes: (loaded) => emit(Math.min(totalBytes, already + loaded), "sending"),
      }),
    );

    sentBytes = end;
    emit(sentBytes, "sending");
  }

  // ── 3. Finalize ────────────────────────────────────────────────────────────
  // Everything below this line is server work: assembling, hashing, malware
  // reputation, duplicate detection and the transfer into storage. The bar goes
  // indeterminate here and stays that way until the row exists — it must never
  // read as "done" because the browser's bytes are gone.
  emit(totalBytes, "finalizing");
  const result = await finalize({
    endpoint,
    form: base(),
    uploadId,
    file,
    chunkSize,
    totalChunks,
    signal,
    maxRetries,
    onStage: (stage, phase) => emit(totalBytes, stage, phase),
  });

  return {
    url: result.url as string,
    contentHash: result.contentHash ?? null,
    uploadId,
    bytes: result.bytes ?? null,
  } as T;
}

// ── Finalization, including the part that fixes the hang ─────────────────────

async function finalize(params: {
  endpoint: string;
  form: FormData;
  uploadId: string;
  file: File;
  chunkSize: number;
  totalChunks: number;
  signal?: AbortSignal;
  maxRetries: number;
  onStage: (stage: UploadStage, phase?: string | null) => void;
}): Promise<ServerPayload> {
  const { endpoint, uploadId, file, chunkSize, signal, maxRetries, onStage } = params;

  // Bounded, so a genuinely lost server cannot loop forever, but generous:
  // a legitimate 95 MB finalize on a slow link to storage is minutes, and
  // treating that as failure is precisely the bug being fixed.
  const deadline = Date.now() + FINALIZE_WATCH_MS;
  let missingRounds = 0;

  for (;;) {
    throwIfAborted(signal);

    const form = params.form;
    form.set("action", "finalize");

    let payload: ServerPayload;
    try {
      payload = await postForm(endpoint, form, uploadId, { signal, timeoutMs: 0 });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;

      // The server answered, and the answer is "I am missing these parts". It
      // is a complete answer — act on it directly. Polling the session here
      // instead would learn nothing new and cost two seconds a round.
      if (err instanceof ChunkedUploadError && err.errorCode === "CHUNK_MISSING") {
        const named = err.missingChunks ?? [];
        if (named.length === 0) throw err;
        payload = { missingChunks: named };
      } else if (
        err instanceof ChunkedUploadError &&
        !err.serverRetryable &&
        err.errorCode !== "SESSION_BUSY"
      ) {
        // A refusal that repetition cannot change: duplicate, oversize,
        // malware, wrong content type, bad destination.
        throw err;
      } else {
        // A TRANSPORT failure, or "someone else is finalizing". Neither says
        // anything about whether the work SUCCEEDED. The old client assumed it
        // had not, retried, and raced its own still-running finalize — which is
        // how one upload became two objects in storage. Ask the server instead.
        if (Date.now() > deadline) throw err;
        const observed = await watchSession(endpoint, uploadId, signal, onStage, deadline);
        if (observed?.url) return observed;
        if (observed?.state === "FAILED" || observed?.state === "CANCELLED") {
          throw new ChunkedUploadError(
            observed.error ?? "The upload failed on the server.",
            500,
            uploadId,
            observed.errorCode,
          );
        }
        payload = observed ?? {};
      }
    }

    if (payload.url) {
      onStage("saving");
      return payload;
    }

    const missing = payload.missingChunks ?? payload.missing ?? [];
    if (missing.length > 0) {
      if (++missingRounds > maxRetries) {
        throw new ChunkedUploadError(
          `The server is still missing ${missing.length} part(s) after ${maxRetries} attempts.`,
          409,
          uploadId,
          "CHUNK_MISSING",
        );
      }
      // Re-send exactly what is missing, then finalize again. This is the
      // "self-healing" behaviour the previous client had, kept — but now the
      // re-send cannot itself trigger a finalize, because finalize is a
      // separate verb.
      onStage("sending");
      for (const index of missing) {
        throwIfAborted(signal);
        const start = index * chunkSize;
        const end = Math.min(file.size, start + chunkSize);
        await withRetries(maxRetries, signal, () =>
          sendChunk({
            endpoint,
            form: cloneForm(params.form),
            uploadId,
            index,
            blob: file.slice(start, end),
            fileName: file.name,
            signal,
          }),
        );
      }
      onStage("finalizing");
      continue;
    }

    if (Date.now() > deadline) {
      throw new ChunkedUploadError(
        "The server did not finish processing this upload in time. Check /admin/books before retrying — the file may already be stored.",
        504,
        uploadId,
        "FINALIZATION_FAILED",
      );
    }
    await sleep(FINALIZE_POLL_MS, signal);
  }
}

/**
 * Ask the server what state the session is in, until it settles.
 *
 * This is the answer to "did my finalize actually fail, or did my connection
 * just die?" — a question the old protocol could not ask, and answered wrongly
 * by default. It also drives the sub-phase label, so the operator sees
 * "Checking file" become "Storing file" instead of an unchanging spinner.
 */
async function watchSession(
  endpoint: string,
  uploadId: string,
  signal: AbortSignal | undefined,
  onStage: (stage: UploadStage, phase?: string | null) => void,
  deadline: number,
): Promise<(ServerPayload & { error?: string }) | null> {
  for (;;) {
    throwIfAborted(signal);
    let payload: ServerPayload & { error?: string };
    try {
      const res = await fetch(`${endpoint}?uploadId=${encodeURIComponent(uploadId)}`, {
        method: "GET",
        signal,
      });
      payload = (await res.json()) as ServerPayload & { error?: string };
    } catch {
      if (Date.now() > deadline) return null;
      await sleep(FINALIZE_POLL_MS, signal);
      continue;
    }

    switch (payload.state) {
      case "STORED":
      case "SAVING_DB":
      case "COMPLETED":
        return payload;
      case "FAILED":
      case "CANCELLED":
        return payload;
      case "FINALIZING":
        onStage(payload.phase === "storing" ? "storing" : "finalizing", payload.phase);
        break;
      default:
        // Back to UPLOADING — the finalize found parts missing.
        return payload;
    }

    if (Date.now() > deadline) return payload;
    await sleep(FINALIZE_POLL_MS, signal);
  }
}

// ── Transport ────────────────────────────────────────────────────────────────

function cloneForm(source: FormData): FormData {
  const copy = new FormData();
  source.forEach((value, key) => copy.set(key, value as string | Blob));
  return copy;
}

/**
 * One chunk, over `XMLHttpRequest` because it is the only transport that
 * reports request-body progress everywhere (see lib/upload-progress.ts).
 *
 * The timeout is per CHUNK and generous: 5 MB on a poor Cambodian mobile link
 * is minutes, and the previous 90 s cut off legitimate transfers. Nothing
 * expensive happens on the server during a chunk request any more, so a chunk
 * that has not answered in this long really is lost.
 */
function sendChunk(params: {
  endpoint: string;
  form: FormData;
  uploadId: string;
  index: number;
  blob: Blob;
  fileName: string;
  signal?: AbortSignal;
  onBytes?: (loaded: number) => void;
}): Promise<ServerPayload> {
  const { endpoint, form, uploadId, index, blob, fileName, signal, onBytes } = params;
  form.set("action", "chunk");
  form.set("chunkIndex", String(index));
  form.set("chunk", blob, fileName);
  return xhrPost(endpoint, form, uploadId, { signal, onBytes, timeoutMs: 300_000 });
}

function postForm(
  endpoint: string,
  form: FormData,
  uploadId: string,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<ServerPayload> {
  return xhrPost(endpoint, form, uploadId, opts);
}

function xhrPost(
  endpoint: string,
  form: FormData,
  uploadId: string,
  opts: { signal?: AbortSignal; onBytes?: (loaded: number) => void; timeoutMs?: number },
): Promise<ServerPayload> {
  const { signal, onBytes, timeoutMs = 120_000 } = opts;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Upload aborted", "AbortError"));
      return;
    }

    const xhr = new XMLHttpRequest();
    // 0 means "no timeout" in XHR. Finalize uses it deliberately: the server
    // has its own 300 s ceiling, and a client-side timeout shorter than the
    // server's real work is what produced the racing retries.
    xhr.timeout = timeoutMs;

    const onAbort = () => xhr.abort();
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    signal?.addEventListener("abort", onAbort);

    if (onBytes) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) onBytes(e.loaded);
      });
    }

    xhr.addEventListener("load", () => {
      cleanup();
      let payload: ServerPayload = {};
      try {
        payload = xhr.responseText ? (JSON.parse(xhr.responseText) as ServerPayload) : {};
      } catch {
        payload = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload);
        return;
      }
      reject(
        new ChunkedUploadError(
          payload.error?.trim() || `Upload failed (${xhr.status})`,
          xhr.status,
          uploadId,
          payload.errorCode,
          payload.retryable ?? false,
          payload.missingChunks ?? payload.missing,
        ),
      );
    });

    xhr.addEventListener("error", () => {
      cleanup();
      reject(new Error("Connection lost during upload. Check your network and try again."));
    });
    xhr.addEventListener("timeout", () => {
      cleanup();
      reject(new Error(`The request timed out after ${Math.round(timeoutMs / 1000)}s.`));
    });
    xhr.addEventListener("abort", () => {
      cleanup();
      reject(new DOMException("Upload aborted", "AbortError"));
    });

    xhr.open("POST", endpoint, true);
    xhr.send(form);
  });
}

// ── Small helpers ────────────────────────────────────────────────────────────

async function withRetries<T>(
  maxRetries: number,
  signal: AbortSignal | undefined,
  run: () => Promise<T>,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await run();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      // A 4xx that is not explicitly retryable will not become true by
      // repetition — a bad key, a duplicate, a refused type.
      if (
        err instanceof ChunkedUploadError &&
        err.status >= 400 &&
        err.status < 500 &&
        !err.serverRetryable
      ) {
        throw err;
      }
      if (++attempt > maxRetries) throw err;
      await sleep(1000 * 2 ** (attempt - 1), signal);
    }
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Upload aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Upload aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Upload aborted", "AbortError");
}

function newUploadId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
