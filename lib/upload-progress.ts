/**
 * Byte-level upload progress for admin file uploads.
 *
 * `fetch` with a FormData body reports nothing while the bytes go out — the
 * promise simply sits there until the server answers. On a 40 MB PDF over a
 * Cambodian mobile link that is a minute of silence, which is the interval in
 * which librarians reload the page and upload the book twice. `XMLHttpRequest`
 * is the only transport that reports request-body progress everywhere (the
 * streamed-`fetch` alternative needs `duplex: "half"`, HTTP/2 and Chromium),
 * so it is what this uses. The request itself is unchanged: same URL, same
 * FormData, same same-origin cookies, same JSON response.
 *
 * Two states come out of it, and the difference matters to what the UI may
 * claim:
 *
 *   "sending"    — bytes are leaving the browser. Measurable, so the bar is
 *                  determinate and the readout is true.
 *   "processing" — the last byte is gone and the server is now hashing,
 *                  virus-checking, optimizing and storing the file. Nothing
 *                  reports that; the UI must go indeterminate rather than
 *                  park a determinate bar at 99%, which reads as a hang.
 *
 * Browser-only. Import it from client components.
 *
 * It sits in `lib/` rather than in `lib/admin/` for two reasons: nothing in it
 * is admin-specific (the thesis and publication forms have the same problem),
 * and an admin-scoped path beginning with "upload" reads to
 * `lib/admin/book-routes-canonical.test.ts` as a link to the retired upload
 * page it exists to forbid. Do not move it back.
 */

export type UploadStage = "sending" | "processing";

export type UploadProgress = {
  /** Bytes handed to the network so far. */
  loaded: number;
  /** Total bytes, or 0 when the browser declines to say (rare, but real). */
  total: number;
  /** 0–1, clamped and monotonic. 1 for the whole of "processing". */
  fraction: number;
  stage: UploadStage;
};

export type UploadOptions = {
  /** Called on every progress tick and once when the stage flips. */
  onProgress?: (progress: UploadProgress) => void;
  /** Message for an HTTP failure whose body carried no `error` field. */
  fallbackError?: (status: number) => string;
  /** Aborts the request; the promise rejects with an `AbortError`. */
  signal?: AbortSignal;
};

/** A rejection carrying the status, so callers can branch on 413 vs 500. */
export class UploadHttpError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "UploadHttpError";
    this.status = status;
  }
}

export function uploadWithProgress<T = unknown>(
  url: string,
  body: FormData,
  { onProgress, fallbackError, signal }: UploadOptions = {},
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Upload aborted", "AbortError"));
      return;
    }

    const xhr = new XMLHttpRequest();
    /* The last total we were told. `upload.onload` carries no reliable size of
       its own, and the readout must not blank out at the moment it fires. */
    let total = 0;
    let stage: UploadStage = "sending";

    const emit = (loaded: number, next: UploadStage) => {
      stage = next;
      onProgress?.({
        loaded,
        total,
        fraction: next === "processing" ? 1 : total > 0 ? Math.min(1, loaded / total) : 0,
        stage: next,
      });
    };

    const onAbort = () => xhr.abort();
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    signal?.addEventListener("abort", onAbort);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) total = e.total;
      emit(e.loaded, "sending");
    });
    /* Every byte is out. Anything after this is server work we cannot measure. */
    xhr.upload.addEventListener("load", () => emit(total, "processing"));

    xhr.addEventListener("load", () => {
      cleanup();
      /* A response can arrive without `upload.load` ever firing — an early
         rejection (413, auth) closes the request mid-body. Flip anyway so the
         UI never freezes mid-bar behind an error. */
      if (stage === "sending") emit(total, "processing");

      let payload: unknown = null;
      try {
        payload = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        payload = null;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload as T);
        return;
      }
      const serverMessage =
        payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error
          : null;
      reject(
        new UploadHttpError(
          serverMessage ?? fallbackError?.(xhr.status) ?? `Upload failed (${xhr.status})`,
          xhr.status,
        ),
      );
    });

    xhr.addEventListener("error", () => {
      cleanup();
      /* XHR reports network failures with no detail at all, by design — the
         status is 0 and the body is empty. Saying "the connection failed" is
         the honest reading and points at the thing the user can act on. */
      reject(new Error("Connection lost during upload. Check your network and try again."));
    });
    xhr.addEventListener("timeout", () => {
      cleanup();
      reject(new Error("The upload timed out. Try again."));
    });
    xhr.addEventListener("abort", () => {
      cleanup();
      reject(new DOMException("Upload aborted", "AbortError"));
    });

    xhr.open("POST", url, true);
    xhr.send(body);
  });
}
