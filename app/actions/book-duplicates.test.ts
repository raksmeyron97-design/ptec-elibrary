// The gate's server boundary: authorization, input hygiene, and failure shape.
//
// Everything below is about what a CLIENT can and cannot make this action do.
// The scoring is tested elsewhere; what matters here is that a reader cannot
// reach it, that a hostile payload cannot widen it, and that a failure is
// reported as a failure rather than as "no duplicates found".

import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermission = vi.fn();
const rateLimit = vi.fn();
const findBookDuplicates = vi.fn();
const searchCanonicalAuthors = vi.fn();

vi.mock("@/lib/auth/requireAdmin", () => ({ requirePermission }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit }));
vi.mock("@/lib/books/duplicate-detection/service", () => ({
  findBookDuplicates,
  searchCanonicalAuthors,
}));

const { checkBookDuplicates, searchBookAuthors } = await import("./book-duplicates");

const EMPTY_ASSESSMENT = { matches: [], top: null, blocked: false, examined: 0, truncated: false };

beforeEach(() => {
  vi.clearAllMocks();
  requirePermission.mockResolvedValue({ supabase: {}, user: { id: "u1" }, userId: "u1", role: "librarian" });
  rateLimit.mockResolvedValue({ success: true, remaining: 10, reset: 0 });
  findBookDuplicates.mockResolvedValue(EMPTY_ASSESSMENT);
  searchCanonicalAuthors.mockResolvedValue([]);
});

describe("checkBookDuplicates", () => {
  it("requires the same permission as creating a book", async () => {
    await checkBookDuplicates({ title: "Anything" });
    expect(requirePermission).toHaveBeenCalledWith("books", "write");
  });

  it("refuses a caller the guard rejects, and never touches the database", async () => {
    requirePermission.mockRejectedValue(new Error("Forbidden"));
    const result = await checkBookDuplicates({ title: "Anything" });
    expect(result).toEqual({ ok: false, error: "Forbidden" });
    expect(findBookDuplicates).not.toHaveBeenCalled();
  });

  it("is rate-limited per user, so the form cannot become a catalogue scanner", async () => {
    rateLimit.mockResolvedValue({ success: false, remaining: 0, reset: 0 });
    const result = await checkBookDuplicates({ title: "Anything" });
    expect(result.ok).toBe(false);
    expect(rateLimit).toHaveBeenCalledWith("book-dup-check:u1", 120, 60_000);
    expect(findBookDuplicates).not.toHaveBeenCalled();
  });

  it("clamps unbounded text instead of forwarding it", async () => {
    await checkBookDuplicates({ title: "x".repeat(5000), author: "y".repeat(5000) });
    const query = findBookDuplicates.mock.calls[0][1];
    expect(query.title.length).toBe(400);
    expect(query.author.length).toBe(200);
  });

  it("ignores a content hash that is not a sha256", async () => {
    await checkBookDuplicates({ title: "Anything", contentHash: "not-a-hash; drop table books" });
    expect(findBookDuplicates.mock.calls[0][1].contentHash).toBeNull();
  });

  it("ignores an exclusion id that is not a uuid — a client cannot hide a record", async () => {
    await checkBookDuplicates({ title: "Anything", excludeBookId: "' or 1=1 --" });
    expect(findBookDuplicates.mock.calls[0][1].excludeBookId).toBeNull();
  });

  it("rejects an implausible year rather than passing it down", async () => {
    await checkBookDuplicates({ title: "Anything", year: "99999" });
    expect(findBookDuplicates.mock.calls[0][1].year).toBeNull();
  });

  it("reports ISBN validity separately from duplicate matching", async () => {
    const valid = await checkBookDuplicates({ title: "Anything", isbn: "978-0-306-40615-7" });
    const invalid = await checkBookDuplicates({ title: "Anything", isbn: "9780306406150" });
    const absent = await checkBookDuplicates({ title: "Anything" });
    expect(valid.ok && valid.isbn).toEqual({ status: "valid", canonical: "9780306406157" });
    expect(invalid.ok && invalid.isbn.status).toBe("invalid");
    expect(absent.ok && absent.isbn.status).toBe("empty");
  });

  it("reports a detector failure as a failure, never as a clean result", async () => {
    findBookDuplicates.mockRejectedValue(new Error("Duplicate check failed: boom"));
    const result = await checkBookDuplicates({ title: "Anything" });
    expect(result).toEqual({ ok: false, error: "Duplicate check failed: boom" });
  });

  it("passes the blocking verdict through untouched", async () => {
    const top = {
      bookId: "11111111-1111-4111-8111-111111111111",
      slug: "existing",
      title: "Existing",
      author: null,
      year: null,
      isbn: null,
      status: "published",
      isPublished: true,
      coverUrl: null,
      score: 100,
      confidence: "exact" as const,
      signals: ["content_hash" as const],
      reasons: ["sameFile" as const],
    };
    findBookDuplicates.mockResolvedValue({
      matches: [top],
      top,
      blocked: true,
      examined: 1,
      truncated: false,
    });
    const result = await checkBookDuplicates({ title: "Anything" });
    expect(result.ok && result.blocked).toBe(true);
    expect(result.ok && result.top?.bookId).toBe(top.bookId);
  });
});

describe("searchBookAuthors", () => {
  it("requires books: write, like every other part of creating a book", async () => {
    await searchBookAuthors("John");
    expect(requirePermission).toHaveBeenCalledWith("books", "write");
  });

  it("refuses a caller the guard rejects", async () => {
    requirePermission.mockRejectedValue(new Error("Forbidden"));
    expect(await searchBookAuthors("John")).toEqual({ ok: false, error: "Forbidden" });
    expect(searchCanonicalAuthors).not.toHaveBeenCalled();
  });

  it("returns nothing for an empty needle, without spending a rate-limit token", async () => {
    expect(await searchBookAuthors("   ")).toEqual({ ok: true, authors: [] });
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it("is rate-limited per user", async () => {
    rateLimit.mockResolvedValue({ success: false, remaining: 0, reset: 0 });
    const result = await searchBookAuthors("John");
    expect(result.ok).toBe(false);
    expect(rateLimit).toHaveBeenCalledWith("book-author-search:u1", 180, 60_000);
  });

  it("surfaces a lookup failure instead of an empty author list", async () => {
    searchCanonicalAuthors.mockRejectedValue(new Error("Author lookup failed: down"));
    expect(await searchBookAuthors("John")).toEqual({
      ok: false,
      error: "Author lookup failed: down",
    });
  });
});
