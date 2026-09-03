import { describe, it, expect, vi, beforeEach } from "vitest";

// The book inline-preview route must NEVER serve an attachment download.
// Doing so bypasses the gated /download route, which is where the per-book
// download policy (allow_download, migration 0131) is enforced and where a
// download is counted. `?download=1` used to be answered here with
// `Content-Disposition: attachment` — this suite locks that bypass closed.

const {
  createServiceClient,
  createClient,
  getUser,
  zimaFetch,
  isVerifiedGoogleCrawler,
  maybeSingle,
  rateLimit,
  ratePolicy,
} = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const eqPublished = vi.fn(() => ({ maybeSingle }));
  const eqId = vi.fn(() => ({ eq: eqPublished }));
  const select = vi.fn(() => ({ eq: eqId }));
  const from = vi.fn(() => ({ select }));
  const createServiceClient = vi.fn(() => ({ from }));
  const getUser = vi.fn();
  const createClient = vi.fn(async () => ({ auth: { getUser } }));
  return {
    createServiceClient,
    createClient,
    getUser,
    zimaFetch: vi.fn(),
    isVerifiedGoogleCrawler: vi.fn(),
    maybeSingle,
    rateLimit: vi.fn(async (..._args: unknown[]) => ({ success: true, reset: 0 })),
    ratePolicy: vi.fn((..._args: unknown[]) => ({ limit: 100, windowMs: 60000 })),
  };
});

vi.mock("@/lib/supabase/server", () => ({ createServiceClient, createClient }));
vi.mock("@/lib/zima", () => ({ zimaFetch }));
vi.mock("@/lib/security/crawler", () => ({ isVerifiedGoogleCrawler }));
vi.mock("@/lib/client-ip", () => ({ clientIp: () => "203.0.113.9" }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit }));
vi.mock("@/lib/rate-limit-policy", () => ({ ratePolicy }));
vi.mock("@/lib/security-log", () => ({ logSecurityEvent: vi.fn() }));
vi.mock("@/lib/security/lockdown", () => ({ lockdownResponse: () => null }));
// unstable_cache wraps the book lookup. In these tests it must be a
// pass-through so each case controls the row it gets back.
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));

import { GET } from "./route";

const req = (url: string) => new Request(new URL(url, "http://localhost"));
const params = (slug: string) => Promise.resolve({ slug });

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  isVerifiedGoogleCrawler.mockResolvedValue(false);
  rateLimit.mockResolvedValue({ success: true, reset: 0 });
  ratePolicy.mockReturnValue({ limit: 100, windowMs: 60000 });
  maybeSingle.mockResolvedValue({
    data: {
      title: "A Book",
      book_files: [{ file_url: "https://cdn.example/a.pdf", format: "pdf" }],
    },
    error: null,
  });
  zimaFetch.mockResolvedValue({
    ok: true,
    status: 206,
    body: null,
    headers: new Headers({ "content-length": "1024", "content-range": "bytes 0-1023/9999" }),
  });
});

describe("GET /api/books/[slug]/file", () => {
  it("redirects ?download=1 to the gated /download route without touching storage", async () => {
    const res = await GET(req("/api/books/abc-123/file?download=1"), { params: params("abc-123") });

    expect(res.status).toBe(307);
    // RELATIVE, with no origin. An absolute Location built from `request.url`
    // resolves to whatever the server sees, which behind the Cloudflare Tunnel
    // is the container's own bind address — production briefly served
    // `Location: https://0.0.0.0:3000/...`, which no browser can follow.
    expect(res.headers.get("location")).toBe("/api/books/abc-123/download");
    expect(res.headers.get("location")).not.toMatch(/^https?:\/\//);
    // The bypass is closed: no auth round-trip, no DB read, no storage fetch,
    // and above all no bytes. The refusal costs nothing.
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(zimaFetch).not.toHaveBeenCalled();
  });

  it("redirects before the auth check, so an anonymous caller cannot probe it either", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(req("/api/books/abc-123/file?download=1"), { params: params("abc-123") });
    expect(res.status).toBe(307);
    // RELATIVE, with no origin. An absolute Location built from `request.url`
    // resolves to whatever the server sees, which behind the Cloudflare Tunnel
    // is the container's own bind address — production briefly served
    // `Location: https://0.0.0.0:3000/...`, which no browser can follow.
    expect(res.headers.get("location")).toBe("/api/books/abc-123/download");
    expect(res.headers.get("location")).not.toMatch(/^https?:\/\//);
  });

  it("still refuses an anonymous reader on the inline path", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(req("/api/books/abc-123/file"), { params: params("abc-123") });
    expect(res.status).toBe(401);
    expect(zimaFetch).not.toHaveBeenCalled();
  });

  // ── Large-PDF delivery (docs/LARGE-PDF-PERFORMANCE-AUDIT.md) ───────────
  //
  // pdf.js reads a book in byte ranges, so this route is hit many times for one
  // book. Metering every chunk as a fresh "file read" made a reader exceed
  // their own 30/min limit before the first page of a large book finished.

  it("meters a ranged continuation against fileRange, not fileRead", async () => {
    const res = await GET(
      new Request(new URL("/api/books/abc-123/file", "http://localhost"), {
        headers: { Range: "bytes=0-524287" },
      }),
      { params: params("abc-123") },
    );

    expect(ratePolicy).toHaveBeenCalledWith("fileRange");
    expect(ratePolicy).not.toHaveBeenCalledWith("fileRead");
    // A separate bucket, so range traffic cannot exhaust the open-document one.
    expect(String(rateLimit.mock.calls[0][0])).toMatch(/^book-file-range:/);
    expect(res.status).toBe(206);
  });

  it("meters opening the document against fileRead", async () => {
    zimaFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
      headers: new Headers({ "content-length": "9999" }),
    });
    await GET(req("/api/books/abc-123/file"), { params: params("abc-123") });

    expect(ratePolicy).toHaveBeenCalledWith("fileRead");
    expect(String(rateLimit.mock.calls[0][0])).toMatch(/^book-file:/);
  });

  it("forwards the Range header to storage rather than fetching the whole file", async () => {
    await GET(
      new Request(new URL("/api/books/abc-123/file", "http://localhost"), {
        headers: { Range: "bytes=1048576-1572863" },
      }),
      { params: params("abc-123") },
    );
    expect(zimaFetch).toHaveBeenCalledWith("https://cdn.example/a.pdf", "bytes=1048576-1572863");
  });

  it("passes 206 and Content-Range straight through — pdf.js needs both", async () => {
    const res = await GET(
      new Request(new URL("/api/books/abc-123/file", "http://localhost"), {
        headers: { Range: "bytes=0-1023" },
      }),
      { params: params("abc-123") },
    );
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-1023/9999");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
  });

  it("still refuses a ranged request when its own bucket is exhausted", async () => {
    rateLimit.mockResolvedValue({ success: false, reset: Date.now() + 1000 });
    const res = await GET(
      new Request(new URL("/api/books/abc-123/file", "http://localhost"), {
        headers: { Range: "bytes=0-1023" },
      }),
      { params: params("abc-123") },
    );
    expect(res.status).toBe(429);
    expect(zimaFetch).not.toHaveBeenCalled();
  });

  it("never caches the session — auth is re-checked on every chunk", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(
      new Request(new URL("/api/books/abc-123/file", "http://localhost"), {
        headers: { Range: "bytes=0-1023" },
      }),
      { params: params("abc-123") },
    );
    expect(res.status).toBe(401);
    expect(zimaFetch).not.toHaveBeenCalled();
  });

  it("never emits an attachment disposition — the source string is inline only", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(
      join(process.cwd(), "app/api/books/[slug]/file/route.ts"),
      "utf8",
    );
    // A source scan, because the only way back to a download here is someone
    // reintroducing the disposition. There is exactly one Content-Disposition
    // value built in this file and it must be `inline`.
    expect(source).not.toMatch(/attachment; filename/);
  });
});
