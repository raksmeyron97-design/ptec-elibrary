import { describe, it, expect, vi, beforeEach } from "vitest";

// The thesis inline-preview route must NEVER serve an attachment download: doing
// so bypasses the gated /download route (auth + Download Profile + Top-10/admin
// policy). It is also gated itself now — inline viewing requires an
// authenticated reader and enforces the same content restriction (Top-10 /
// admin-block) as the download route. These tests lock those invariants.

const {
  maybeSingle,
  createServiceClient,
  createClient,
  getUser,
  zimaFetch,
  evaluateThesisDownload,
  isVerifiedGoogleCrawler,
} = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const createServiceClient = vi.fn(() => ({ from }));
  const getUser = vi.fn();
  const createClient = vi.fn(async () => ({ auth: { getUser } }));
  const zimaFetch = vi.fn();
  const evaluateThesisDownload = vi.fn();
  const isVerifiedGoogleCrawler = vi.fn();
  return { maybeSingle, createServiceClient, createClient, getUser, zimaFetch, evaluateThesisDownload, isVerifiedGoogleCrawler };
});

vi.mock("@/lib/supabase/server", () => ({ createServiceClient, createClient }));
vi.mock("@/lib/zima", () => ({ zimaFetch }));
vi.mock("@/lib/theses/download-permission", () => ({ evaluateThesisDownload }));
vi.mock("@/lib/security/crawler", () => ({ isVerifiedGoogleCrawler }));
vi.mock("@/lib/client-ip", () => ({ clientIp: () => "203.0.113.9" }));
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
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  maybeSingle.mockResolvedValue({
    data: {
      id: "abc-123",
      title: "A Thesis",
      file_url: "https://cdn.example/thesis.pdf",
      is_published: true,
      status: "published",
      download_override: "inherit",
    },
    error: null,
  });
  evaluateThesisDownload.mockResolvedValue({ allowed: true, reason: "ALLOWED", effectivePolicy: "allowed" });
  isVerifiedGoogleCrawler.mockResolvedValue(false);
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
    // Relative, with no origin — an absolute one built from `request.url`
    // resolves to the container's internal address behind the tunnel.
    expect(res.headers.get("location")).toBe("/api/theses/abc-123/download");
    expect(res.headers.get("location")).not.toMatch(/^https?:\/\//);
    // The bypass is closed: no DB read, no storage fetch, no file bytes served.
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(zimaFetch).not.toHaveBeenCalled();
  });

  it("rejects an anonymous (non-crawler) inline request with 401 and never touches storage", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(req("/api/theses/abc-123/file"), { params: params("abc-123") });
    expect(res.status).toBe(401);
    expect(zimaFetch).not.toHaveBeenCalled();
  });

  it("serves a published, unrestricted thesis to a DNS-verified Google crawler", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    isVerifiedGoogleCrawler.mockResolvedValue(true);
    const res = await GET(req("/api/theses/abc-123/file"), { params: params("abc-123") });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("inline");
  });

  it("still blocks a restricted thesis even for a verified crawler", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    isVerifiedGoogleCrawler.mockResolvedValue(true);
    evaluateThesisDownload.mockResolvedValue({
      allowed: false,
      reason: "ADMIN_BLOCKED",
      effectivePolicy: "blocked",
    });
    const res = await GET(req("/api/theses/abc-123/file"), { params: params("abc-123") });
    expect(res.status).toBe(403);
    expect(zimaFetch).not.toHaveBeenCalled();
  });

  it("blocks a content-restricted (Top-10 / admin-block) thesis with 403", async () => {
    evaluateThesisDownload.mockResolvedValue({
      allowed: false,
      reason: "TOP_TEN_RESTRICTED",
      effectivePolicy: "blocked",
    });
    const res = await GET(req("/api/theses/abc-123/file"), { params: params("abc-123") });
    expect(res.status).toBe(403);
    expect(zimaFetch).not.toHaveBeenCalled();
  });

  it("returns 404 for an unpublished thesis", async () => {
    evaluateThesisDownload.mockResolvedValue({
      allowed: false,
      reason: "THESIS_UNPUBLISHED",
      effectivePolicy: "allowed",
    });
    const res = await GET(req("/api/theses/abc-123/file"), { params: params("abc-123") });
    expect(res.status).toBe(404);
    expect(zimaFetch).not.toHaveBeenCalled();
  });

  it("serves the inline preview to an authed reader as a non-cacheable stream", async () => {
    const res = await GET(req("/api/theses/abc-123/file"), { params: params("abc-123") });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("inline");
    // Thesis PDFs must never enter a shared/CDN cache.
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("cache-control")).toContain("private");
  });

  it("allows viewing even when the download profile is incomplete (view is not a download)", async () => {
    evaluateThesisDownload.mockResolvedValue({
      allowed: false,
      reason: "PROFILE_INCOMPLETE",
      effectivePolicy: "allowed",
    });
    const res = await GET(req("/api/theses/abc-123/file"), { params: params("abc-123") });
    expect(res.status).toBe(200);
  });
});
