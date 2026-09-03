import { describe, it, expect, vi, beforeEach } from "vitest";

// The per-book download policy (books.allow_download, migration 0131) is
// enforced HERE, on the server, for every request. These tests are the proof
// that the feature is authorization and not a hidden button: they never render
// a page, they call the route the way an attacker would — directly.

const {
  maybeSingle,
  from,
  createServiceClient,
  createClient,
  getUser,
  zimaFetch,
  canOverrideBookDownloadPolicy,
  logDownloadAttempt,
  logSecurityEvent,
  logAdminAction,
  rpc,
  insert,
} = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const insert = vi.fn(async () => ({ error: null }));
  const rpc = vi.fn(async () => ({ error: null }));
  // books: .select().eq().eq().maybeSingle();  download_logs: .insert()
  const eqPublished = vi.fn(() => ({ maybeSingle }));
  const eqKey = vi.fn(() => ({ eq: eqPublished }));
  const select = vi.fn(() => ({ eq: eqKey }));
  const from = vi.fn(() => ({ select, insert }));
  const createServiceClient = vi.fn(() => ({ from, rpc }));
  const getUser = vi.fn();
  const createClient = vi.fn(async () => ({ auth: { getUser } }));
  return {
    maybeSingle,
    from,
    createServiceClient,
    createClient,
    getUser,
    zimaFetch: vi.fn(),
    canOverrideBookDownloadPolicy: vi.fn(),
    logDownloadAttempt: vi.fn(async () => {}),
    logSecurityEvent: vi.fn(),
    logAdminAction: vi.fn(async () => {}),
    rpc,
    insert,
  };
});

vi.mock("@/lib/supabase/server", () => ({ createServiceClient, createClient }));
vi.mock("@/lib/zima", () => ({ zimaFetch }));
vi.mock("@/lib/books/download-authority", () => ({ canOverrideBookDownloadPolicy }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ success: true, reset: 0 })) }));
vi.mock("@/lib/rate-limit-policy", () => ({ ratePolicy: () => ({ limit: 100, windowMs: 60000 }) }));
vi.mock("@/lib/security-log", () => ({ logSecurityEvent }));
vi.mock("@/lib/security/lockdown", () => ({ lockdownResponse: () => null }));
vi.mock("@/app/actions/audit", () => ({ logAdminAction }));
vi.mock("@/lib/analytics/events", () => ({
  logDownloadAttempt,
  logAppEvent: vi.fn(),
  getViewerContext: vi.fn(async () => ({ sessionHash: "hash" })),
}));

import { GET } from "./route";

const req = () => new Request("http://localhost/api/books/a-book/download");
const params = (slug: string) => Promise.resolve({ slug });

/** A published book row, downloadable unless overridden. */
function bookRow(over: Record<string, unknown> = {}) {
  return {
    data: {
      id: "11111111-2222-3333-4444-555555555555",
      slug: "a-book",
      title: "A Book",
      allow_download: true,
      download_disabled_reason: null,
      book_files: [{ id: "file-1", file_url: "https://cdn.example/a.pdf", format: "pdf" }],
      ...over,
    },
    error: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  maybeSingle.mockResolvedValue(bookRow());
  canOverrideBookDownloadPolicy.mockResolvedValue({ allowed: false, role: null });
  zimaFetch.mockResolvedValue({
    ok: true,
    status: 200,
    body: null,
    headers: new Headers({ "content-length": "10" }),
  });
});

describe("GET /api/books/[slug]/download", () => {
  it("serves a downloadable book as an attachment", async () => {
    const res = await GET(req(), { params: params("a-book") });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(zimaFetch).toHaveBeenCalled();
  });

  it("refuses an unauthenticated caller before reading anything", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(req(), { params: params("a-book") });
    expect(res.status).toBe(401);
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(zimaFetch).not.toHaveBeenCalled();
  });

  // ── The feature ────────────────────────────────────────────────────────
  it("refuses a reader with 403 when the book is read-online-only, and serves no bytes", async () => {
    maybeSingle.mockResolvedValue(bookRow({ allow_download: false }));

    const res = await GET(req(), { params: params("a-book") });

    expect(res.status).toBe(403);
    // The refusal happens BEFORE storage is touched — nothing is fetched and
    // then discarded, so there is no window in which the file exists in the
    // response pipeline at all.
    expect(zimaFetch).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.reason).toBe("policy");
    // The reader is told what they CAN do, not what went wrong internally.
    expect(body.readUrl).toBe("/books/a-book/read");
    expect(JSON.stringify(body)).not.toContain("cdn.example");
  });

  it("does not count a refused attempt as a download", async () => {
    maybeSingle.mockResolvedValue(bookRow({ allow_download: false }));
    await GET(req(), { params: params("a-book") });

    expect(rpc).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    // It is recorded as a denial instead, so /admin/logs shows why.
    expect(logDownloadAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ status: "denied", reason: "DOWNLOAD_DISABLED" }),
    );
    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "download_blocked" }),
    );
  });

  it("shows the librarian's own wording when one was recorded", async () => {
    maybeSingle.mockResolvedValue(
      bookRow({ allow_download: false, download_disabled_reason: "Licence covers reading only." }),
    );
    const body = await (await GET(req(), { params: params("a-book") })).json();
    expect(body.error).toBe("Licence covers reading only.");
  });

  it("lets a librarian with books:write through, and audits that it happened", async () => {
    maybeSingle.mockResolvedValue(bookRow({ allow_download: false }));
    canOverrideBookDownloadPolicy.mockResolvedValue({ allowed: true, role: "librarian" });

    const res = await GET(req(), { params: params("a-book") });

    expect(res.status).toBe(200);
    expect(logAdminAction).toHaveBeenCalledWith(
      "user-1",
      "book.download_override",
      "books",
      expect.any(String),
      expect.objectContaining({ role: "librarian" }),
    );
  });

  // ── Backward compatibility ─────────────────────────────────────────────
  it.each([
    ["a row from before the migration (column absent)", {} as Record<string, unknown>],
    ["an explicitly null column", { allow_download: null }],
  ])("keeps serving %s", async (_label, over) => {
    const row = bookRow(over);
    if (!("allow_download" in over)) delete (row.data as Record<string, unknown>).allow_download;
    maybeSingle.mockResolvedValue(row);

    const res = await GET(req(), { params: params("a-book") });
    expect(res.status).toBe(200);
  });

  it("404s a book with no file rather than reporting a policy denial", async () => {
    maybeSingle.mockResolvedValue(bookRow({ allow_download: false, book_files: [] }));
    const res = await GET(req(), { params: params("a-book") });
    expect(res.status).toBe(404);
  });
});
