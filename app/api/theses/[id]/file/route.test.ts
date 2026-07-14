import { describe, it, expect, vi, beforeEach } from "vitest";

// The thesis inline-preview route must NEVER serve an attachment download: doing
// so bypasses the gated /download route (auth + Download Profile + Top-10/admin
// policy). These tests lock that invariant in place.

const { single, createServiceClient, zimaFetch } = vi.hoisted(() => {
  const single = vi.fn();
  const eq2 = vi.fn(() => ({ single }));
  const eq1 = vi.fn(() => ({ eq: eq2 }));
  const select = vi.fn(() => ({ eq: eq1 }));
  const from = vi.fn(() => ({ select }));
  const createServiceClient = vi.fn(() => ({ from }));
  const zimaFetch = vi.fn();
  return { single, createServiceClient, zimaFetch };
});

vi.mock("@/lib/supabase/server", () => ({ createServiceClient }));
vi.mock("@/lib/zima", () => ({ zimaFetch }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ success: true, reset: 0 })) }));
vi.mock("@/lib/rate-limit-policy", () => ({ ratePolicy: () => ({ limit: 100, windowMs: 60000 }) }));
vi.mock("@/lib/security-log", () => ({ logSecurityEvent: vi.fn() }));

import { GET } from "./route";
import { NextRequest } from "next/server";

function req(url: string) {
  return new NextRequest(new URL(url, "http://localhost"));
}
const params = (id: string) => Promise.resolve({ id });

beforeEach(() => {
  vi.clearAllMocks();
  single.mockResolvedValue({
    data: { title: "A Thesis", file_url: "https://cdn.example/thesis.pdf" },
    error: null,
  });
  zimaFetch.mockResolvedValue({
    ok: true,
    status: 200,
    body: null,
    headers: new Headers({ "content-length": "10" }),
  });
});

describe("GET /api/theses/[id]/file", () => {
  it("redirects ?download=1 to the gated /download route without touching storage", async () => {
    const res = await GET(req("/api/theses/abc-123/file?download=1"), { params: params("abc-123") });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/api/theses/abc-123/download");
    // The bypass is closed: no DB read, no storage fetch, no file bytes served.
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(zimaFetch).not.toHaveBeenCalled();
  });

  it("serves the inline preview (no download param) as a non-cacheable stream", async () => {
    const res = await GET(req("/api/theses/abc-123/file"), { params: params("abc-123") });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("inline");
    // Thesis PDFs must never enter a shared/CDN cache.
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("cache-control")).toContain("private");
  });
});
