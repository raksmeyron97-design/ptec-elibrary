/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// The reading-position endpoint exists so a save survives the tab closing
// (keepalive), which means it is a real, unauthenticated-by-default write
// surface. These tests call it the way an attacker would — directly — and
// prove the four things that keep it safe: the session decides whose row is
// written, a cross-origin POST is refused, the body is validated before any
// query runs, and the service client is never opened for an anonymous caller.

const { getUser, createClient, createServiceClient, upsertReadingProgress, rateLimit } = vi.hoisted(() => {
  const getUser = vi.fn();
  return {
    getUser,
    createClient: vi.fn(async () => ({ auth: { getUser } })),
    createServiceClient: vi.fn(),
    upsertReadingProgress: vi.fn(async () => true),
    rateLimit: vi.fn(async () => ({ success: true, remaining: 59, reset: 0 })),
  };
});

vi.mock("@/lib/supabase/server", () => ({ createClient, createServiceClient }));
vi.mock("@/lib/reading-progress", () => ({ upsertReadingProgress }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit }));
vi.mock("@/lib/rate-limit-policy", () => ({ ratePolicy: () => ({ limit: 60, windowMs: 60_000 }) }));

import { POST } from "./route";

const BOOK = "33333333-3333-4333-8333-333333333301";
const USER = "44444444-4444-4444-4444-444444444444";

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/reader/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json", host: "localhost:3000", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: USER } } });
  upsertReadingProgress.mockResolvedValue(true);
  rateLimit.mockResolvedValue({ success: true, remaining: 59, reset: 0 });
});

describe("POST /api/reader/progress", () => {
  it("saves the signed-in reader's position and answers 204 with no body", async () => {
    const res = await POST(post({ bookId: BOOK, progressPct: 42 }));
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(upsertReadingProgress).toHaveBeenCalledWith(USER, BOOK, 42);
  });

  it("takes the user from the SESSION, never from the body", async () => {
    await POST(post({ bookId: BOOK, progressPct: 10, userId: "11111111-1111-4111-8111-111111111111" }));
    expect(upsertReadingProgress).toHaveBeenCalledWith(USER, BOOK, 10);
  });

  it("refuses an anonymous caller without opening a service client", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(post({ bookId: BOOK, progressPct: 42 }));
    expect(res.status).toBe(401);
    expect(upsertReadingProgress).not.toHaveBeenCalled();
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("refuses a cross-origin POST before authenticating", async () => {
    const res = await POST(post({ bookId: BOOK, progressPct: 42 }, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(getUser).not.toHaveBeenCalled();
    expect(upsertReadingProgress).not.toHaveBeenCalled();
  });

  it("accepts the page's own origin", async () => {
    const res = await POST(post({ bookId: BOOK, progressPct: 42 }, { origin: "http://localhost:3000" }));
    expect(res.status).toBe(204);
  });

  it("validates the body before any query runs", async () => {
    for (const body of [
      { bookId: "not-a-uuid", progressPct: 10 },
      { bookId: BOOK, progressPct: "10" },
      { bookId: BOOK, progressPct: Number.NaN },
      { bookId: BOOK },
      {},
    ]) {
      const res = await POST(post(body));
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    const malformed = await POST(post("{ not json"));
    expect(malformed.status).toBe(400);
    expect(upsertReadingProgress).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("refuses an oversized body on the declared length alone", async () => {
    const res = await POST(post({ bookId: BOOK, progressPct: 42 }, { "content-length": "99999" }));
    expect(res.status).toBe(413);
    expect(upsertReadingProgress).not.toHaveBeenCalled();
  });

  it("rate limits per user", async () => {
    rateLimit.mockResolvedValue({ success: false, remaining: 0, reset: 0 });
    const res = await POST(post({ bookId: BOOK, progressPct: 42 }));
    expect(res.status).toBe(429);
    expect(rateLimit).toHaveBeenCalledWith(`reader-progress:${USER}`, 60, 60_000);
    expect(upsertReadingProgress).not.toHaveBeenCalled();
  });

  it("reports a failed write rather than claiming success", async () => {
    upsertReadingProgress.mockResolvedValue(false);
    const res = await POST(post({ bookId: BOOK, progressPct: 42 }));
    expect(res.status).toBe(500);
  });
});
