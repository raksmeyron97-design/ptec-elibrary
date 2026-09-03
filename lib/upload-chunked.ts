import {
  UploadHttpError,
  type UploadOptions,
  type UploadProgress,
  type UploadStage,
} from "@/lib/upload-progress";

export const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB per chunk

export type ChunkedUploadOptions = UploadOptions & {
  /** Chunk size in bytes (default 5 MB). Must stay well below Cloudflare 100MB limit. */
  chunkSize?: number;
  /** Maximum retry attempts per failed chunk (default 3). */
  maxRetries?: number;
  /** Extra form fields forwarded with the chunk (e.g. excludeType, excludeId, target). */
  extraFields?: Record<string, string | null | undefined>;
};

/**
 * Uploads a large file in sequential chunks to bypass edge timeouts (e.g. Cloudflare 100s).
 *
 * Each chunk is uploaded via an independent HTTP request. If a chunk drops, it is retried
 * automatically without restarting the entire upload. The final chunk triggers server-side
 * assembly, malware check, duplicate check, and storage persistence.
 */
export async function uploadChunked<T = { url: string; contentHash?: string }>(
  endpoint: string,
  file: File,
  key: string,
  options: ChunkedUploadOptions = {},
): Promise<T> {
  const {
    chunkSize = DEFAULT_CHUNK_SIZE,
    maxRetries = 3,
    onProgress,
    fallbackError = (status) => `Upload failed with status ${status}`,
    signal,
    extraFields = {},
  } = options;

  if (signal?.aborted) {
    throw new DOMException("Upload aborted", "AbortError");
  }

  const uploadId = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const totalBytes = file.size;
  const totalChunks = Math.max(1, Math.ceil(totalBytes / chunkSize));

  let overallLoaded = 0;
  let currentStage: UploadStage = "sending";

  const emit = (loaded: number, stage: UploadStage) => {
    currentStage = stage;
    onProgress?.({
      loaded,
      total: totalBytes,
      fraction: stage === "processing" ? 1 : totalBytes > 0 ? Math.min(1, loaded / totalBytes) : 0,
      stage,
    });
  };

  // Initial 0% tick
  emit(0, "sending");

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    if (signal?.aborted) {
      throw new DOMException("Upload aborted", "AbortError");
    }

    const start = chunkIndex * chunkSize;
    const end = Math.min(totalBytes, start + chunkSize);
    const chunkBlob = file.slice(start, end);
    const isLastChunk = chunkIndex === totalChunks - 1;

    let attempt = 0;
    let success = false;
    let responsePayload: unknown = null;

    while (attempt <= maxRetries && !success) {
      if (signal?.aborted) {
        throw new DOMException("Upload aborted", "AbortError");
      }

      try {
        responsePayload = await sendSingleChunk({
          endpoint,
          uploadId,
          chunkIndex,
          totalChunks,
          fileName: file.name,
          fileSize: totalBytes,
          key,
          chunkBlob,
          isLastChunk,
          extraFields,
          signal,
          onChunkProgress: (chunkLoaded) => {
            overallLoaded = Math.min(totalBytes, start + chunkLoaded);
            emit(overallLoaded, "sending");
          },
        });

        success = true;
      } catch (err) {
        attempt++;
        if (err instanceof DOMException && err.name === "AbortError") {
          throw err;
        }

        // Self-healing: if the server reports missing chunks during final assembly,
        // automatically re-upload the missing chunks before retrying final assembly
        const errPayload = (err as { payload?: { missingChunks?: unknown } })?.payload;
        if (
          isLastChunk &&
          errPayload &&
          Array.isArray(errPayload.missingChunks) &&
          errPayload.missingChunks.length > 0
        ) {
          const missing = errPayload.missingChunks as number[];
          try {
            for (const mIdx of missing) {
              const mStart = mIdx * chunkSize;
              const mEnd = Math.min(totalBytes, mStart + chunkSize);
              const mBlob = file.slice(mStart, mEnd);
              await sendSingleChunk({
                endpoint,
                uploadId,
                chunkIndex: mIdx,
                totalChunks,
                fileName: file.name,
                fileSize: totalBytes,
                key,
                chunkBlob: mBlob,
                isLastChunk: false,
                extraFields,
                signal,
              });
            }
            // Recovered missing chunks! Reset attempt and immediately retry assembly
            attempt = 0;
            continue;
          } catch {
            // If recovery fails, fall through to normal retry backoff
          }
        }

        if (attempt > maxRetries) {
          throw err;
        }

        // Wait before retrying failed chunk (exponential backoff)
        const delayMs = 1000 * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    if (isLastChunk) {
      emit(totalBytes, "processing");
      return responsePayload as T;
    }
  }

  throw new Error("Upload completed without final server response.");
}

function sendSingleChunk(params: {
  endpoint: string;
  uploadId: string;
  chunkIndex: number;
  totalChunks: number;
  fileName: string;
  fileSize: number;
  key: string;
  chunkBlob: Blob;
  isLastChunk: boolean;
  extraFields: Record<string, string | null | undefined>;
  signal?: AbortSignal;
  onChunkProgress?: (loaded: number) => void;
}): Promise<unknown> {
  const {
    endpoint,
    uploadId,
    chunkIndex,
    totalChunks,
    fileName,
    fileSize,
    key,
    chunkBlob,
    extraFields,
    signal,
    onChunkProgress,
  } = params;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Upload aborted", "AbortError"));
      return;
    }

    const xhr = new XMLHttpRequest();
    // 90 second timeout per 5MB chunk (well within Cloudflare 100s, generous for slow links)
    xhr.timeout = 90_000;

    const fd = new FormData();
    fd.set("uploadId", uploadId);
    fd.set("chunkIndex", String(chunkIndex));
    fd.set("totalChunks", String(totalChunks));
    fd.set("fileName", fileName);
    fd.set("fileSize", String(fileSize));
    fd.set("key", key);

    for (const [k, v] of Object.entries(extraFields)) {
      if (v !== undefined && v !== null) {
        fd.set(k, v);
      }
    }

    fd.set("chunk", chunkBlob, fileName);

    const onAbort = () => xhr.abort();
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    signal?.addEventListener("abort", onAbort);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onChunkProgress?.(e.loaded);
      }
    });

    xhr.addEventListener("load", () => {
      cleanup();
      let payload: unknown = null;
      try {
        payload = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        payload = null;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload);
        return;
      }

      const serverMessage =
        payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
          ? ((payload as { error: string }).error).trim()
          : null;

      const fallback = `Chunk ${chunkIndex + 1}/${totalChunks} upload failed (${xhr.status})`;
      const err = new UploadHttpError(serverMessage || fallback, xhr.status);
      (err as unknown as { payload?: unknown }).payload = payload;
      reject(err);
    });

    xhr.addEventListener("error", () => {
      cleanup();
      reject(new Error(`Network error uploading chunk ${chunkIndex + 1}/${totalChunks}.`));
    });

    xhr.addEventListener("timeout", () => {
      cleanup();
      reject(new Error(`Chunk ${chunkIndex + 1}/${totalChunks} timed out after 90s.`));
    });

    xhr.addEventListener("abort", () => {
      cleanup();
      reject(new DOMException("Upload aborted", "AbortError"));
    });

    xhr.open("POST", endpoint, true);
    xhr.send(fd);
  });
}
