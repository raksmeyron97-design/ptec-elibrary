import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadChunked, DEFAULT_CHUNK_SIZE } from "./upload-chunked";
import type { UploadProgress } from "./upload-progress";

class FakeXhr {
  static instances: FakeXhr[] = [];
  upload = new EventTarget();
  private listeners = new EventTarget();
  status = 0;
  responseText = "";
  aborted = false;
  timeout = 0;
  sentFormData: FormData | null = null;

  constructor() {
    FakeXhr.instances.push(this);
  }
  open() {}
  send(data: FormData) {
    this.sentFormData = data;
  }
  abort() {
    this.aborted = true;
    this.listeners.dispatchEvent(new Event("abort"));
  }
  addEventListener(type: string, fn: EventListener) {
    this.listeners.addEventListener(type, fn);
  }

  sendBytes(loaded: number) {
    const e = new Event("progress") as Event & {
      lengthComputable: boolean;
      loaded: number;
      total: number;
    };
    Object.assign(e, { lengthComputable: true, loaded, total: loaded });
    this.upload.dispatchEvent(e);
  }
  respond(status: number, body: unknown) {
    this.status = status;
    this.responseText = body === undefined ? "" : JSON.stringify(body);
    this.listeners.dispatchEvent(new Event("load"));
  }
  failNetwork() {
    this.listeners.dispatchEvent(new Event("error"));
  }
}

function install() {
  FakeXhr.instances = [];
  vi.stubGlobal("XMLHttpRequest", FakeXhr as unknown as typeof XMLHttpRequest);
}
afterEach(() => vi.unstubAllGlobals());

describe("uploadChunked", () => {
  it("splits a multi-chunk file and reports overall progress smoothly", async () => {
    install();
    const seen: UploadProgress[] = [];

    // Create a 12 MB file (with chunkSize = 5MB, should create 3 chunks: 5MB, 5MB, 2MB)
    const fileBytes = new Uint8Array(12 * 1024 * 1024);
    const file = new File([fileBytes], "test-book.pdf", { type: "application/pdf" });

    const promise = uploadChunked<{ url: string; contentHash: string }>(
      "/api/admin/upload/chunk",
      file,
      "books/research/test-book.pdf",
      {
        chunkSize: 5 * 1024 * 1024,
        onProgress: (p) => seen.push(p),
      },
    );

    // Initial tick
    expect(seen[0]).toEqual({
      loaded: 0,
      total: 12 * 1024 * 1024,
      fraction: 0,
      stage: "sending",
    });

    // Chunk 0
    await vi.waitFor(() => expect(FakeXhr.instances.length).toBe(1));
    const xhr0 = FakeXhr.instances[0];
    expect(xhr0.sentFormData?.get("chunkIndex")).toBe("0");
    expect(xhr0.sentFormData?.get("totalChunks")).toBe("3");
    xhr0.sendBytes(5 * 1024 * 1024);
    xhr0.respond(200, { success: true, chunkIndex: 0, totalChunks: 3 });

    // Chunk 1
    await vi.waitFor(() => expect(FakeXhr.instances.length).toBe(2));
    const xhr1 = FakeXhr.instances[1];
    expect(xhr1.sentFormData?.get("chunkIndex")).toBe("1");
    xhr1.sendBytes(5 * 1024 * 1024);
    xhr1.respond(200, { success: true, chunkIndex: 1, totalChunks: 3 });

    // Chunk 2 (final chunk: 2MB)
    await vi.waitFor(() => expect(FakeXhr.instances.length).toBe(3));
    const xhr2 = FakeXhr.instances[2];
    expect(xhr2.sentFormData?.get("chunkIndex")).toBe("2");
    xhr2.sendBytes(2 * 1024 * 1024);
    xhr2.respond(200, {
      success: true,
      url: "https://storage/book.pdf",
      contentHash: "abcdef123456",
    });

    const result = await promise;
    expect(result).toEqual({
      success: true,
      url: "https://storage/book.pdf",
      contentHash: "abcdef123456",
    });

    // Check that final stage became "processing"
    const last = seen[seen.length - 1];
    expect(last.stage).toBe("processing");
    expect(last.fraction).toBe(1);
    expect(last.loaded).toBe(12 * 1024 * 1024);
  });

  it("handles single-chunk files directly", async () => {
    install();
    const fileBytes = new Uint8Array(2 * 1024 * 1024); // 2 MB < 5 MB
    const file = new File([fileBytes], "small.pdf", { type: "application/pdf" });

    const promise = uploadChunked<{ url: string }>(
      "/api/admin/upload/chunk",
      file,
      "books/small.pdf",
    );

    await vi.waitFor(() => expect(FakeXhr.instances.length).toBe(1));
    const xhr = FakeXhr.instances[0];
    expect(xhr.sentFormData?.get("chunkIndex")).toBe("0");
    expect(xhr.sentFormData?.get("totalChunks")).toBe("1");
    xhr.respond(200, { url: "https://storage/small.pdf" });

    await expect(promise).resolves.toEqual({ url: "https://storage/small.pdf" });
  });

  it("surfaces server error messages clearly", async () => {
    install();
    const file = new File([new Uint8Array(1024)], "error.pdf", { type: "application/pdf" });

    const promise = uploadChunked(
      "/api/admin/upload/chunk",
      file,
      "books/error.pdf",
      { maxRetries: 0 },
    );

    await vi.waitFor(() => expect(FakeXhr.instances.length).toBe(1));
    FakeXhr.instances[0].respond(400, { error: "Corrupted PDF header" });

    await expect(promise).rejects.toThrow("Corrupted PDF header");
  });
});
