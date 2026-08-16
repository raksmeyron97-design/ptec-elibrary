import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  isAdminAuthError: vi.fn((error: unknown) => Boolean(error && typeof error === "object" && "status" in error)),
  rateLimit: vi.fn(),
  getEngagementBreakdown: vi.fn(),
}));

vi.mock("@/lib/auth/requireAdmin", () => ({
  requireStaff: mocks.requireStaff,
  isAdminAuthError: mocks.isAdminAuthError,
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/admin/engagement-breakdown.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/engagement-breakdown.server")>();
  return { ...actual, getEngagementBreakdown: mocks.getEngagementBreakdown };
});

import { NextRequest } from "next/server";
import { BreakdownTimeoutError } from "@/lib/admin/engagement-breakdown.server";
import { GET } from "./route";

const query = new URLSearchParams({
  metric: "views",
  grain: "day",
  bucket: "2026-07-20",
  range: "30d",
  contentType: "all",
  contentLanguage: "all",
  asOf: "2026-07-22T11:00:00.000Z",
});
const req = (params: URLSearchParams = query) =>
  new NextRequest(`http://localhost/api/admin/dashboard/engagement-breakdown?${params}`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStaff.mockResolvedValue({ userId: "admin-1" });
  mocks.rateLimit.mockResolvedValue({ success: true, remaining: 29, reset: 0 });
  mocks.getEngagementBreakdown.mockResolvedValue({
    metric: "views",
    grain: "day",
    scope: { bucket: "2026-07-20", start: "x", end: "y", aggregationScope: "fullBucket" },
    total: 2,
    partial: false,
    rowsScanned: 2,
    ranking: { status: "metric", basis: "views", items: [] },
    unattributed: 0,
  });
});

describe("GET /api/admin/dashboard/engagement-breakdown", () => {
  it("authorizes, rate-limits, validates, and returns private canonical data", async () => {
    const response = await GET(req());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("server-timing")).toContain("engagement-breakdown;dur=");
    expect(mocks.rateLimit).toHaveBeenCalledWith("dashboard-engagement-breakdown:admin-1", 30, 60_000);
    expect(mocks.getEngagementBreakdown).toHaveBeenCalledWith(
      expect.objectContaining({ metric: "views", grain: "day", contentLanguage: "all" }),
      expect.objectContaining({ deadlineAt: expect.any(Number) }),
    );
  });

  it("rejects invalid canonical input before querying", async () => {
    const invalid = new URLSearchParams(query);
    invalid.set("grain", "quarter");
    const response = await GET(req(invalid));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid_grain" });
    expect(mocks.getEngagementBreakdown).not.toHaveBeenCalled();
  });

  it("returns 429 without querying when the per-user limit is exhausted", async () => {
    mocks.rateLimit.mockResolvedValue({ success: false, remaining: 0, reset: 0 });
    const response = await GET(req());
    expect(response.status).toBe(429);
    expect(mocks.getEngagementBreakdown).not.toHaveBeenCalled();
  });

  it("preserves staff authorization errors", async () => {
    mocks.requireStaff.mockRejectedValue({ status: 403, message: "Forbidden" });
    const response = await GET(req());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden" });
  });

  it("returns an explicit timeout response", async () => {
    mocks.getEngagementBreakdown.mockRejectedValue(new BreakdownTimeoutError());
    const response = await GET(req());
    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({ code: "timeout" });
  });
});
