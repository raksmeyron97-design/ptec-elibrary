// The upload transport exists to answer "how far in is this?", so what is
// pinned here is the honesty of that answer rather than the plumbing: when the
// progress is real, when it stops being real, and that a server-side error
// message always beats the generic fallback the caller supplied.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  uploadWithProgress,
  UploadHttpError,
  type UploadProgress,
} from "./upload-progress";

/** Minimal controllable XHR. Only what the helper actually touches. */
class FakeXhr {
  static last: FakeXhr;
  upload = new EventTarget();
  private listeners = new EventTarget();
  status = 0;
  responseText = "";
  aborted = false;

  constructor() {
    FakeXhr.last = this;
  }
  open() {}
  send() {}
  abort() {
    this.aborted = true;
    this.listeners.dispatchEvent(new Event("abort"));
  }
  addEventListener(type: string, fn: EventListener) {
    this.listeners.addEventListener(type, fn);
  }

  /* Drivers, from the test's point of view. */
  sendBytes(loaded: number, total: number) {
    const e = new Event("progress") as Event & {
      lengthComputable: boolean;
      loaded: number;
      total: number;
    };
    Object.assign(e, { lengthComputable: true, loaded, total });
    this.upload.dispatchEvent(e);
  }
  finishSending() {
    this.upload.dispatchEvent(new Event("load"));
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
  vi.stubGlobal("XMLHttpRequest", FakeXhr as unknown as typeof XMLHttpRequest);
}
afterEach(() => vi.unstubAllGlobals());

describe("uploadWithProgress", () => {
  it("reports real byte progress, then stops claiming one", async () => {
    install();
    const seen: UploadProgress[] = [];
    const promise = uploadWithProgress<{ url: string }>("/api/admin/upload", new FormData(), {
      onProgress: (p) => seen.push(p),
    });

    FakeXhr.last.sendBytes(25, 100);
    FakeXhr.last.sendBytes(100, 100);
    FakeXhr.last.finishSending();
    FakeXhr.last.respond(200, { url: "https://cdn/x.pdf" });

    await expect(promise).resolves.toEqual({ url: "https://cdn/x.pdf" });
    expect(seen.map((p) => [p.stage, p.fraction])).toEqual([
      ["sending", 0.25],
      ["sending", 1],
      // The bytes are gone; the server is now hashing, scanning and storing,
      // and nothing reports that. The caller must be told to go indeterminate.
      ["processing", 1],
    ]);
  });

  it("leaves 'sending' even when the response beats the upload's own load event", async () => {
    install();
    const seen: UploadProgress[] = [];
    const promise = uploadWithProgress("/api/admin/upload", new FormData(), {
      onProgress: (p) => seen.push(p),
    });

    // A 413 closes the request mid-body: `upload.load` never fires. Without the
    // flip here the bar freezes part-filled behind the error banner.
    FakeXhr.last.sendBytes(10, 100);
    FakeXhr.last.respond(413, { error: "File too large (max 100 MB)." });

    await expect(promise).rejects.toThrow("File too large (max 100 MB).");
    expect(seen.at(-1)!.stage).toBe("processing");
  });

  it("prefers the server's message over the caller's fallback", async () => {
    install();
    const promise = uploadWithProgress("/api/admin/upload", new FormData(), {
      fallbackError: (s) => `PDF upload failed (${s})`,
    });
    FakeXhr.last.respond(400, { error: "content does not match declared type" });
    await expect(promise).rejects.toThrow("content does not match declared type");
  });

  it("falls back with the status when the body carries no message", async () => {
    install();
    const promise = uploadWithProgress("/api/admin/upload", new FormData(), {
      fallbackError: (s) => `PDF upload failed (${s})`,
    });
    FakeXhr.last.respond(502, undefined);
    await expect(promise).rejects.toMatchObject({
      message: "PDF upload failed (502)",
      status: 502,
    });
    await expect(promise).rejects.toBeInstanceOf(UploadHttpError);
  });

  it("names the connection when XHR reports nothing at all", async () => {
    install();
    const promise = uploadWithProgress("/api/admin/upload", new FormData());
    FakeXhr.last.failNetwork();
    await expect(promise).rejects.toThrow(/Connection lost/);
  });

  it("aborts on a signal", async () => {
    install();
    const controller = new AbortController();
    const promise = uploadWithProgress("/api/admin/upload", new FormData(), {
      signal: controller.signal,
    });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeXhr.last.aborted).toBe(true);
  });
});
