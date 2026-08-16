import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  isAdminAuthError: vi.fn((error: unknown) => Boolean(error && typeof error === "object" && "status" in error)),
  rateLimit: vi.fn(),
  getDayBreakdown: vi.fn(),
}));

vi.mock("@/lib/auth/requireAdmin", () => ({
  requireStaff: mocks.requireStaff,
  isAdminAuthError: mocks.isAdminAuthError,
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/admin/intelligence", () => ({ getDayBreakdown: mocks.getDayBreakdown }));

import { NextRequest } from "next/server";
import { GET } from "./route";

const req = (bucket = "2026-07-20") =>
  new NextRequest(`http://localhost/api/admin/dashboard/day-breakdown?bucket=${encodeURIComponent(bucket)}`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStaff.mockResolvedValue({ userId: "admin-1" });
  mocks.rateLimit.mockResolvedValue({ success: true, remaining: 29, reset: 0 });
  mocks.getDayBreakdown.mockResolvedValue({
    bucket: "2026-07-20",
    granularity: "day",
    total: 1,
    items: [{ type: "book", id: "b1", title: "Legacy", views: 1, editHref: "/admin/edit/b1" }],
  });
});

describe("GET /api/admin/dashboard/day-breakdown legacy characterization", () => {
  it("retains the authorized legacy response and no-store policy", async () => {
    const response = await GET(req());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.rateLimit).toHaveBeenCalledWith("dashboard-drill:admin-1", 30, 60_000);
    expect(mocks.getDayBreakdown).toHaveBeenCalledWith("2026-07-20");
    expect(await response.json()).toMatchObject({ granularity: "day", items: [{ views: 1 }] });
  });

  it("keeps invalid buckets on the legacy 400 contract", async () => {
    mocks.getDayBreakdown.mockResolvedValue(null);
    const response = await GET(req("invalid"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid bucket" });
  });

  it("keeps the legacy per-user rate limit", async () => {
    mocks.rateLimit.mockResolvedValue({ success: false, remaining: 0, reset: 0 });
    const response = await GET(req());
    expect(response.status).toBe(429);
    expect(mocks.getDayBreakdown).not.toHaveBeenCalled();
  });
});
