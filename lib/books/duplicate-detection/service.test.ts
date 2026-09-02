// The server half: candidate generation, degradation, and the one thing a
// duplicate gate must never do — report a failed lookup as a clean result.
//
// The Supabase client is a stub rather than a live database because what is
// being tested is the CONTRACT between this module and the RPC: which
// arguments go out (both ISBN spellings, the hash, the exclusion), and what
// happens when the answer is an error, a missing function, or nothing at all.
// The RPC's own SQL is exercised against a real Postgres by the e2e stack.

import { describe, expect, it, vi } from "vitest";
import { findBookDuplicates, searchCanonicalAuthors, CANDIDATE_LIMIT } from "./service";

type RpcResult = { data: unknown; error: { code?: string; message: string } | null };

/** Minimal stand-in for the service-role client these functions are handed. */
function stubDb(rpc: (name: string, args: Record<string, unknown>) => RpcResult, from?: unknown) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const db = {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return rpc(name, args);
    }),
    from: vi.fn(() => from),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: db as any, calls };
}

const candidateRow = (partial: Record<string, unknown> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  slug: "classroom-management-basics",
  title: "Classroom Management Basics",
  author: "Chan Sophea",
  isbn: "978-0-306-40615-7",
  publisher: null,
  year: 2022,
  content_hash: null,
  status: "published",
  is_published: true,
  cover_url: null,
  match_source: "exact_title",
  ...partial,
});

describe("findBookDuplicates", () => {
  it("sends BOTH ISBN spellings, so a legacy ISBN-10 row is still found", async () => {
    const { db, calls } = stubDb(() => ({ data: [], error: null }));
    await findBookDuplicates(db, { title: "Anything", isbn: "978-0-306-40615-7" });
    const keys = calls[0].args.p_isbn_keys as string[];
    expect(keys).toContain("9780306406157");
    expect(keys).toContain("0306406152");
  });

  it("passes the content hash and the exclusion through", async () => {
    const { db, calls } = stubDb(() => ({ data: [], error: null }));
    await findBookDuplicates(db, {
      title: "Anything",
      contentHash: "a".repeat(64),
      excludeBookId: "22222222-2222-4222-8222-222222222222",
    });
    expect(calls[0].args.p_content_hash).toBe("a".repeat(64));
    expect(calls[0].args.p_exclude_id).toBe("22222222-2222-4222-8222-222222222222");
    expect(calls[0].args.p_limit).toBe(CANDIDATE_LIMIT);
  });

  it("does not query at all when there is nothing identifiable to match on", async () => {
    const { db, calls } = stubDb(() => ({ data: [], error: null }));
    const assessment = await findBookDuplicates(db, { title: "   ", isbn: "N/A" });
    expect(calls).toHaveLength(0);
    expect(assessment.matches).toEqual([]);
    expect(assessment.blocked).toBe(false);
    // Examined zero — the caller can tell "we did not look" from "we looked".
    expect(assessment.examined).toBe(0);
  });

  it("drops a placeholder author rather than searching the shelf for 'Unknown'", async () => {
    const { db, calls } = stubDb(() => ({ data: [], error: null }));
    await findBookDuplicates(db, { title: "Anything", author: "Unknown" });
    expect(calls[0].args.p_author).toBeNull();
  });

  it("blocks on a byte-identical file returned by the hash branch", async () => {
    const hash = "b".repeat(64);
    const { db } = stubDb(() => ({
      data: [candidateRow({ content_hash: hash, match_source: "content_hash" })],
      error: null,
    }));
    const assessment = await findBookDuplicates(db, {
      title: "Some Other Title Entirely",
      contentHash: hash,
    });
    expect(assessment.blocked).toBe(true);
    expect(assessment.top?.signals).toContain("content_hash");
  });

  it("blocks on a shared ISBN", async () => {
    const { db } = stubDb(() => ({ data: [candidateRow()], error: null }));
    const assessment = await findBookDuplicates(db, {
      title: "A Different Title",
      isbn: "0306406152",
    });
    expect(assessment.blocked).toBe(true);
    expect(assessment.top?.signals).toContain("isbn");
  });

  it("warns, but does not block, on a title + author match", async () => {
    const { db } = stubDb(() => ({ data: [candidateRow({ isbn: null })], error: null }));
    const assessment = await findBookDuplicates(db, {
      title: "Classroom Management Basics",
      author: "Chan Sophea",
      year: 2022,
    });
    expect(assessment.blocked).toBe(false);
    expect(assessment.top?.confidence).toBe("high");
  });

  it("does not report a second edition as the same book", async () => {
    const { db } = stubDb(() => ({ data: [candidateRow({ isbn: null })], error: null }));
    const assessment = await findBookDuplicates(db, {
      title: "Classroom Management Basics, 2nd Edition",
      author: "Chan Sophea",
      year: 2022,
    });
    expect(assessment.blocked).toBe(false);
    expect(assessment.top?.reasons).toContain("differentEdition");
    expect(assessment.top?.confidence).not.toBe("high");
  });

  it("THROWS on a broken lookup — a failed check must never read as clean", async () => {
    const { db } = stubDb(() => ({ data: null, error: { code: "57014", message: "canceling statement" } }));
    await expect(
      findBookDuplicates(db, { title: "Classroom Management Basics" }),
    ).rejects.toThrow(/Duplicate check failed/);
  });

  it("falls back to a reduced query when migration 0130 is not applied yet", async () => {
    const fallbackRows = [
      {
        id: "33333333-3333-4333-8333-333333333333",
        slug: "classroom-management-basics",
        title: "Classroom Management Basics",
        isbn: null,
        publisher: null,
        published_at: "2022-01-01",
        status: "published",
        is_published: true,
        cover_url: null,
        authors: { name: "Chan Sophea" },
        book_files: [{ content_hash: null }],
      },
    ];
    const chain = {
      select: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: fallbackRows }),
    };
    const { db } = stubDb(
      () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.find_book_duplicate_candidates" } }),
      chain,
    );
    const assessment = await findBookDuplicates(db, {
      title: "Classroom Management Basics",
      author: "Chan Sophea",
      year: 2022,
    });
    expect(assessment.top?.title).toBe("Classroom Management Basics");
    expect(assessment.blocked).toBe(false);
  });

  it("flags a capped sweep instead of implying the whole collection was seen", async () => {
    const rows = Array.from({ length: CANDIDATE_LIMIT }, (_, index) =>
      candidateRow({ id: `id-${index}`, isbn: null, title: `Classroom Management Basics ${index}` }),
    );
    const { db } = stubDb(() => ({ data: rows, error: null }));
    const assessment = await findBookDuplicates(db, { title: "Classroom Management Basics" });
    expect(assessment.truncated).toBe(true);
  });
});

describe("searchCanonicalAuthors", () => {
  it("returns nothing for an empty needle without querying", async () => {
    const { db, calls } = stubDb(() => ({ data: [], error: null }));
    expect(await searchCanonicalAuthors(db, "   ")).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("maps rows and keeps the match kind the database reported", async () => {
    const { db } = stubDb(() => ({
      data: [
        { id: "a1", name: "John Smith", book_count: 42, match_kind: "prefix" },
        { id: "a2", name: "J. Smith", book_count: 3, match_kind: "fuzzy" },
      ],
      error: null,
    }));
    const authors = await searchCanonicalAuthors(db, "John Sm");
    expect(authors).toEqual([
      { id: "a1", name: "John Smith", bookCount: 42, matchKind: "prefix" },
      { id: "a2", name: "J. Smith", bookCount: 3, matchKind: "fuzzy" },
    ]);
  });

  it("treats an unrecognised match kind as fuzzy rather than trusting it", async () => {
    const { db } = stubDb(() => ({
      data: [{ id: "a1", name: "John Smith", book_count: 1, match_kind: "definitely-the-same-person" }],
      error: null,
    }));
    expect((await searchCanonicalAuthors(db, "John"))[0].matchKind).toBe("fuzzy");
  });

  it("surfaces a real failure rather than an empty list", async () => {
    const { db } = stubDb(() => ({ data: null, error: { code: "42501", message: "permission denied" } }));
    await expect(searchCanonicalAuthors(db, "John")).rejects.toThrow(/Author lookup failed/);
  });
});
