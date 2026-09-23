import { describe, it, expect, vi, beforeEach } from "vitest";

// The per-book download policy (books.allow_download, migration 0131) is
// enforced HERE, on the server, for every request. These tests are the proof
// that the feature is authorization and not a hidden button: they never render
// a page, they call the route the way an attacker would — directly.

const {
  maybeSingle,
  downloadCountedWithinWindow,
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
  const downloadCountedWithinWindow = vi.fn(async () => false);
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
    downloadCountedWithinWindow,
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
  getViewerContext: vi.fn(async () => ({
    userId: "user-1",
    sessionHash: "hash",
    locale: "en",
    isBot: false,
    ip: "127.0.0.1",
  })),
}));
// The dedupe READ is exercised in lib/analytics/counting.test.ts and against a
// real database; here it is a switch, so these tests stay about the route.
vi.mock("@/lib/analytics/lifetime-counters", () => ({ downloadCountedWithinWindow }));

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
  downloadCountedWithinWindow.mockResolvedValue(false);
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

// ── 0151: catalogue record only ─────────────────────────────────────────────
//
// Behavioural, not a source scan. The boundary scans in
// lib/books/file-access-boundary.test.ts catch a gate that is MISSING or
// MISORDERED; they cannot catch one that is present and neutered
// (`if (false && !access.canServeBytes)` keeps every string they look for).
// These call the route and assert on what it does.

describe("GET /api/books/[slug]/download — file_access = catalogue_only", () => {
  const catalogueOnly = () =>
    maybeSingle.mockResolvedValue(
      bookRow({ file_access: "catalogue_only", allow_download: false }),
    );

  it("refuses a signed-in reader with 403 and fetches no bytes", async () => {
    catalogueOnly();
    const res = await GET(req(), { params: params("a-book") });

    expect(res.status).toBe(403);
    expect(zimaFetch).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.reason).toBe("catalogue-only");
    // Not "read it online instead" — there is no reader for this book.
    expect(body.canReadOnline).toBe(false);
  });

  it("refuses a LIBRARIAN too — there is no override on the public route", async () => {
    // read_online keeps its override (the test above this block proves it).
    // catalogue_only is usually a rights position, so the public route
    // answers the same way for everyone and staff use the admin path.
    catalogueOnly();
    canOverrideBookDownloadPolicy.mockResolvedValue({ allowed: true, role: "librarian" });

    const res = await GET(req(), { params: params("a-book") });

    expect(res.status).toBe(403);
    expect(zimaFetch).not.toHaveBeenCalled();
    // The override was never even consulted.
    expect(canOverrideBookDownloadPolicy).not.toHaveBeenCalled();
  });

  it("records the refusal rather than letting it pass silently", async () => {
    catalogueOnly();
    await GET(req(), { params: params("a-book") });

    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "download_blocked" }),
    );
    expect(logDownloadAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ status: "denied", reason: "DOWNLOAD_DISABLED" }),
    );
  });

  it("still serves a book whose file_access is absent — a partial select never restricts", async () => {
    // The 0131 rule carried onto the new column: a row read before 0151, or
    // a select that did not ask for it, stays downloadable.
    maybeSingle.mockResolvedValue(bookRow({ file_access: undefined }));
    const res = await GET(req(), { params: params("a-book") });
    expect(res.status).toBe(200);
    expect(zimaFetch).toHaveBeenCalled();
  });
});

// ── The lifetime counter ────────────────────────────────────────────────────
// This route serves the file every search result and every detail page links
// to, and until now it moved `books.download_count` on none of them: it called
// `increment_download_count({ book_id })`, and PostgREST resolves a function BY
// ARGUMENT NAME, so the call answered 404 rather than throwing — into a
// Promise.all whose result was discarded.
describe("GET /api/books/[slug]/download — download_count", () => {
  it("counts a first download, with the argument name the function declares", async () => {
    await GET(req(), { params: params("a-book") });
    expect(rpc).toHaveBeenCalledWith("increment_download_count", {
      row_id: "11111111-2222-3333-4444-555555555555",
    });
  });

  it("does not count a repeat inside the window, and still serves the file", async () => {
    downloadCountedWithinWindow.mockResolvedValue(true);
    const res = await GET(req(), { params: params("a-book") });
    expect(res.status).toBe(200);
    expect(zimaFetch).toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("logs the repeat anyway — the log is the history, and the dedupe reads it back", async () => {
    downloadCountedWithinWindow.mockResolvedValue(true);
    await GET(req(), { params: params("a-book") });
    expect(insert).toHaveBeenCalled();
  });

  it("asks about THIS book and THIS reader", async () => {
    await GET(req(), { params: params("a-book") });
    expect(downloadCountedWithinWindow).toHaveBeenCalledWith(
      "11111111-2222-3333-4444-555555555555",
      "user-1",
    );
  });
});
