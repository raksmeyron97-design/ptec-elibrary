import { afterEach, describe, expect, it, vi } from "vitest";

import { ChunkedUploadError, uploadChunked, DEFAULT_CHUNK_SIZE } from "./upload-chunked";
import type { UploadProgress } from "./upload-progress";

/**
 * Protocol tests for the client half of the chunked upload.
 *
 * The fake server below is a state machine, not a script of canned responses,
 * because every bug this protocol replaced was a state bug: a retry racing a
 * finalize, a finalize replaying instead of re-running, a client re-sending a
 * chunk the server already had. A stubbed sequence of replies would pass
 * against code that still had all of them.
 */

const ENDPOINT = "/api/admin/upload/chunk";
const MB = 1024 * 1024;

type Behaviour = {
  /** Drop these chunk indexes the first time they are staged. */
  loseOnFirstWrite?: Set<number>;
  /** Fail the Nth finalize attempt (1-based) with this transport outcome. */
  finalizeTransportFailAt?: number;
  /** Answer the Nth finalize attempt (1-based) with SESSION_BUSY. */
  finalizeBusyAt?: number;
  /** How many GET polls before the session reports STORED. */
  pollsBeforeStored?: number;
};

class FakeServer {
  chunks = new Set<number>();
  state = "CREATED";
  finalizeCalls = 0;
  chunkWrites: number[] = [];
  storeCalls = 0;
  polls = 0;
  totalChunks = 0;
  declaredContentType = "";
  chunkPartTypes: string[] = [];
  private lost = new Set<number>();

  constructor(private behaviour: Behaviour = {}) {
    this.lost = new Set(behaviour.loseOnFirstWrite ?? []);
  }

  post(form: FormData): { status: number; body: Record<string, unknown> } {
    const action = form.get("action");

    if (action === "init") {
      this.totalChunks = Number(form.get("totalChunks"));
      this.declaredContentType = String(form.get("contentType") ?? "");
      if (this.state === "COMPLETED") {
        return { status: 200, body: this.storedBody() };
      }
      return {
        status: 200,
        body: { uploadId: form.get("uploadId"), state: this.state, present: [...this.chunks] },
      };
    }

    if (action === "chunk") {
      const index = Number(form.get("chunkIndex"));
      this.chunkWrites.push(index);
      this.chunkPartTypes.push((form.get("chunk") as File).type);
      this.state = "UPLOADING";
      if (this.lost.has(index)) {
        // Staged, then lost — a restart between requests, or a tmpfs wipe.
        this.lost.delete(index);
      } else {
        this.chunks.add(index);
      }
      return { status: 200, body: { state: this.state, chunkIndex: index } };
    }

    if (action === "finalize") {
      this.finalizeCalls++;

      if (this.behaviour.finalizeBusyAt === this.finalizeCalls) {
        return {
          status: 409,
          body: { error: "already being finalized", errorCode: "SESSION_BUSY", retryable: true },
        };
      }
      if (this.state === "COMPLETED") {
        // Idempotent replay: the work is done, so say so rather than redo it.
        return { status: 200, body: { ...this.storedBody(), replayed: true } };
      }

      const missing: number[] = [];
      for (let i = 0; i < this.totalChunks; i++) {
        if (!this.chunks.has(i)) missing.push(i);
      }
      if (missing.length > 0) {
        this.state = "UPLOADING";
        return {
          status: 409,
          body: {
            error: `missing ${missing.length}`,
            errorCode: "CHUNK_MISSING",
            retryable: true,
            missingChunks: missing,
          },
        };
      }

      this.storeCalls++;
      this.state = "COMPLETED";
      return { status: 200, body: { ...this.storedBody(), success: true } };
    }

    return { status: 400, body: { error: "unknown action", errorCode: "BAD_REQUEST" } };
  }

  get(): Record<string, unknown> {
    this.polls++;
    if (this.behaviour.pollsBeforeStored != null && this.polls <= this.behaviour.pollsBeforeStored) {
      return { state: "FINALIZING", phase: this.polls > 1 ? "storing" : "verifying" };
    }
    if (this.state === "COMPLETED") return this.storedBody();
    const missing: number[] = [];
    for (let i = 0; i < this.totalChunks; i++) {
      if (!this.chunks.has(i)) missing.push(i);
    }
    return { state: this.state, present: [...this.chunks], missing };
  }

  private storedBody() {
    return {
      state: "STORED",
      url: "https://cdn.example.test/files/books/x/book.pdf",
      contentHash: "abc123",
      bytes: 1234,
    };
  }
}

/** Minimal XHR that routes through the fake server. */
function installTransport(server: FakeServer, behaviour: Behaviour = {}) {
  let finalizeAttempts = 0;

  class FakeXhr {
    upload = new EventTarget();
    private listeners = new EventTarget();
    status = 0;
    responseText = "";
    timeout = 0;
    private form: FormData | null = null;

    open() {}
    send(body: FormData) {
      this.form = body;
      queueMicrotask(() => this.respond());
    }
    abort() {
      this.listeners.dispatchEvent(new Event("abort"));
    }
    addEventListener(type: string, fn: EventListener) {
      this.listeners.addEventListener(type, fn);
    }

    private respond() {
      const form = this.form!;
      const action = form.get("action");

      if (action === "chunk") {
        const blob = form.get("chunk") as Blob;
        const e = new Event("progress") as Event & {
          lengthComputable: boolean;
          loaded: number;
          total: number;
        };
        Object.assign(e, { lengthComputable: true, loaded: blob.size, total: blob.size });
        this.upload.dispatchEvent(e);
      }

      if (action === "finalize") {
        finalizeAttempts++;
        if (behaviour.finalizeTransportFailAt === finalizeAttempts) {
          // The response never arrives — a proxy timeout, a dropped link. The
          // server keeps working. This is the case that used to produce a
          // second finalize and, with it, "Missing chunk 0".
          server.post(form);
          this.listeners.dispatchEvent(new Event("error"));
          return;
        }
      }

      const { status, body } = server.post(form);
      this.status = status;
      this.responseText = JSON.stringify(body);
      this.listeners.dispatchEvent(new Event("load"));
    }
  }

  vi.stubGlobal("XMLHttpRequest", FakeXhr as unknown as typeof XMLHttpRequest);
  vi.stubGlobal("fetch", async () =>
    new Response(JSON.stringify(server.get()), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

function fileOf(bytes: number, name = "book.pdf"): File {
  return new File([new Uint8Array(bytes)], name, { type: "application/pdf" });
}

afterEach(() => vi.unstubAllGlobals());

describe("chunk protocol", () => {
  it.each([
    ["1 chunk", 3 * MB, 1],
    ["2 chunks", 8 * MB, 2],
    ["10 chunks", 50 * MB - 1, 10],
    ["20 chunks", 100 * MB, 20],
  ])("sends %s exactly once each and finalizes once", async (_label, size, expectedChunks) => {
    const server = new FakeServer();
    installTransport(server);

    const result = await uploadChunked(ENDPOINT, fileOf(size), "books/x/book.pdf");

    expect(server.chunkWrites).toHaveLength(expectedChunks);
    expect(new Set(server.chunkWrites).size).toBe(expectedChunks);
    expect(server.finalizeCalls).toBe(1);
    expect(server.storeCalls).toBe(1);
    expect(result.url).toContain("book.pdf");
    expect(result.uploadId).toBeTruthy();
  });

  it("uses a 5 MB chunk by default", () => {
    expect(DEFAULT_CHUNK_SIZE).toBe(5 * MB);
  });

  it("re-sends only chunk 0 when the server reports chunk 0 missing", async () => {
    // The reported error, verbatim. What it must NOT do is re-upload the file.
    const server = new FakeServer({ loseOnFirstWrite: new Set([0]) });
    installTransport(server);

    await uploadChunked(ENDPOINT, fileOf(20 * MB), "books/x/book.pdf");

    const zeroWrites = server.chunkWrites.filter((i) => i === 0);
    const otherWrites = server.chunkWrites.filter((i) => i !== 0);
    expect(zeroWrites).toHaveLength(2);
    expect(otherWrites).toHaveLength(3);
    expect(server.storeCalls).toBe(1);
  });

  it("re-sends only a missing middle chunk", async () => {
    const server = new FakeServer({ loseOnFirstWrite: new Set([2]) });
    installTransport(server);

    await uploadChunked(ENDPOINT, fileOf(25 * MB), "books/x/book.pdf");

    expect(server.chunkWrites.filter((i) => i === 2)).toHaveLength(2);
    expect(server.storeCalls).toBe(1);
  });

  it("gives up after a bounded number of missing-chunk rounds", async () => {
    // A chunk that vanishes every time is a broken staging area, not a flake.
    // Looping on it forever is what turns a fault into a hang.
    const lossy = new FakeServer();
    // Re-lose index 1 on every write.
    const origPost = lossy.post.bind(lossy);
    lossy.post = (form: FormData) => {
      const res = origPost(form);
      lossy.chunks.delete(1);
      return res;
    };
    installTransport(lossy);

    await expect(
      uploadChunked(ENDPOINT, fileOf(12 * MB), "books/x/book.pdf", { maxRetries: 2 }),
    ).rejects.toThrow(/missing/i);
  });

  it("does not re-send chunks the server already holds when resuming", async () => {
    const server = new FakeServer();
    server.chunks.add(0);
    server.chunks.add(1);
    server.state = "UPLOADING";
    installTransport(server);

    await uploadChunked(ENDPOINT, fileOf(15 * MB), "books/x/book.pdf", {
      uploadId: "resume-session-0001",
    });

    expect(server.chunkWrites).toEqual([2]);
  });

  it("replays a completed session instead of uploading again", async () => {
    // A browser refresh after a successful finalize. The old client would have
    // re-sent the whole file and been refused as its own duplicate.
    const server = new FakeServer();
    server.state = "COMPLETED";
    installTransport(server);

    const result = await uploadChunked(ENDPOINT, fileOf(30 * MB), "books/x/book.pdf", {
      uploadId: "already-finished-01",
    });

    expect(server.chunkWrites).toEqual([]);
    expect(server.storeCalls).toBe(0);
    expect(result.url).toContain("book.pdf");
  });

  it("asks the server what happened when the finalize response is lost", async () => {
    // THE HANG, AND THE DOUBLE UPLOAD. The finalize succeeds server-side but
    // its response never arrives. The client must discover the result, not
    // assume failure and start a second finalize.
    const server = new FakeServer();
    installTransport(server, { finalizeTransportFailAt: 1 });

    const result = await uploadChunked(ENDPOINT, fileOf(10 * MB), "books/x/book.pdf");

    expect(server.storeCalls).toBe(1);
    expect(result.url).toContain("book.pdf");
  });

  it("waits out a finalize that is already running rather than starting a second", async () => {
    const server = new FakeServer({ pollsBeforeStored: 0 });
    installTransport(server, { finalizeBusyAt: 1 });

    const result = await uploadChunked(ENDPOINT, fileOf(10 * MB), "books/x/book.pdf");
    expect(result.url).toContain("book.pdf");
    // The busy reply must not have caused a second store.
    expect(server.storeCalls).toBeLessThanOrEqual(1);
  });
});

describe("content type", () => {
  it("declares the FILE's type, never the slice's", async () => {
    /*
     * THE DEFECT THIS PINS, verified against Node's own FormData:
     *
     *   file.type          "application/pdf"
     *   file.slice().type  ""                 <- a slice inherits no type
     *   what a server sees "application/octet-stream"
     *
     * The old client sent only slices and the old route validated the content
     * against `chunk.type`. `application/octet-stream` is not in ALLOWED_MIMES
     * (lib/mime-validation.ts), so `validateMimeType` returned false and EVERY
     * chunked upload was refused at the final step with "content does not match
     * allowed file types". The client then retried the final chunk, whose
     * previous attempt had already deleted the staging directory — which is
     * where "Missing chunk 0 during final assembly" actually came from.
     *
     * So the type must travel from the File, once, at init.
     */
    const server = new FakeServer();
    installTransport(server);

    await uploadChunked(ENDPOINT, fileOf(12 * MB), "books/x/book.pdf");

    expect(server.declaredContentType).toBe("application/pdf");
    // The parts themselves are still typeless — that is a property of Blob
    // slicing and nothing should depend on it.
    expect(server.chunkPartTypes.every((t) => t !== "application/pdf")).toBe(true);
  });
});

describe("progress reporting", () => {
  it("never reports a stage past sending as measurable", async () => {
    const server = new FakeServer();
    installTransport(server);
    const seen: UploadProgress[] = [];

    await uploadChunked(ENDPOINT, fileOf(12 * MB), "books/x/book.pdf", {
      onProgress: (p) => seen.push(p),
    });

    expect(seen.some((p) => p.stage === "sending")).toBe(true);
    // The bar must go indeterminate the moment the bytes are gone. Reporting
    // "100% sending" for the whole of the server's work is what made a working
    // finalize look identical to a hang.
    expect(seen.some((p) => p.stage === "finalizing")).toBe(true);
    const last = seen.at(-1)!;
    expect(last.stage).not.toBe("sending");
  });

  it("reports monotonic byte progress across chunk boundaries", async () => {
    const server = new FakeServer();
    installTransport(server);
    const sending: number[] = [];

    await uploadChunked(ENDPOINT, fileOf(12 * MB), "books/x/book.pdf", {
      onProgress: (p) => {
        if (p.stage === "sending") sending.push(p.loaded);
      },
    });

    for (let i = 1; i < sending.length; i++) {
      expect(sending[i]).toBeGreaterThanOrEqual(sending[i - 1]);
    }
    expect(sending.at(-1)).toBe(12 * MB);
  });

  it("surfaces the server's stage while it is finalizing", async () => {
    const server = new FakeServer({ pollsBeforeStored: 2 });
    installTransport(server, { finalizeTransportFailAt: 1 });
    const stages: string[] = [];

    await uploadChunked(ENDPOINT, fileOf(6 * MB), "books/x/book.pdf", {
      onProgress: (p) => stages.push(p.stage),
    });

    expect(stages).toContain("storing");
  });
});

describe("failures the client must not retry", () => {
  it("stops on a duplicate instead of uploading again", async () => {
    const server = new FakeServer();
    installTransport(server);
    server.post = () => ({
      status: 409,
      body: {
        error: 'This PDF is already in the library as "Algebra I".',
        errorCode: "DUPLICATE_FILE",
        retryable: false,
      },
    });

    await expect(uploadChunked(ENDPOINT, fileOf(6 * MB), "books/x/book.pdf")).rejects.toThrow(
      /already in the library/,
    );
  });

  it("carries the server's error class so callers can branch", async () => {
    const server = new FakeServer();
    installTransport(server);
    server.post = () => ({
      status: 413,
      body: { error: "too big", errorCode: "UPLOAD_LIMIT", retryable: false },
    });

    await expect(
      uploadChunked(ENDPOINT, fileOf(6 * MB), "books/x/book.pdf"),
    ).rejects.toMatchObject({ errorCode: "UPLOAD_LIMIT", status: 413 });
  });

  it("aborts promptly when the caller cancels", async () => {
    const server = new FakeServer();
    installTransport(server);
    const controller = new AbortController();
    controller.abort();

    await expect(
      uploadChunked(ENDPOINT, fileOf(6 * MB), "books/x/book.pdf", { signal: controller.signal }),
    ).rejects.toThrow(/abort/i);
    expect(server.chunkWrites).toEqual([]);
  });

  it("exposes ChunkedUploadError with its upload id for the retry path", async () => {
    const server = new FakeServer();
    installTransport(server);
    server.post = () => ({
      status: 400,
      body: { error: "nope", errorCode: "BAD_REQUEST", retryable: false },
    });

    const err = await uploadChunked(ENDPOINT, fileOf(1 * MB), "books/x/book.pdf").catch((e) => e);
    expect(err).toBeInstanceOf(ChunkedUploadError);
    expect((err as ChunkedUploadError).uploadId).toBeTruthy();
  });
});
