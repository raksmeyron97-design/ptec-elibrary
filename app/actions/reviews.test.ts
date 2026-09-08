import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitReview } from "./reviews";

/*
 * A Server Action's arguments are as caller-controlled as a request body, and
 * submitReview does its work on the service client, which bypasses RLS. So
 * `bookId` has to be established against the database rather than trusted: a
 * signed-in reader could otherwise attach a rating and a public comment to any
 * uuid at all — including an unpublished draft, which would then carry them
 * the moment a librarian pressed publish.
 *
 * The fixture holds one published book and one draft, and the fake applies the
 * `.eq()` filters to the rows the way Postgres would, so "the draft is
 * refused" is decided by is_published rather than by the test.
 */

type BookRow = { id: string; slug: string; is_published: boolean };

let books: BookRow[];
let reviewRows: Array<{ book_id: string; user_id: string; rating: number }>;

const mockRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({ rateLimit: (...a: unknown[]) => mockRateLimit(...a) }));
vi.mock("@/lib/rate-limit-policy", () => ({ ratePolicy: () => ({ limit: 5, windowMs: 60_000 }) }));
vi.mock("@/lib/security-log", () => ({ logSecurityEvent: vi.fn() }));
const mockRevalidate = vi.fn();
vi.mock("@/lib/cache/revalidate", () => ({
  revalidateLocalizedPath: (...a: unknown[]) => mockRevalidate(...a),
}));

/** A filterable, awaitable query over an in-memory row set. */
function query<T extends Record<string, unknown>>(rows: () => T[], onInsert?: (row: T) => void) {
  const filters: Array<[string, unknown]> = [];
  const matched = () => rows().filter((r) => filters.every(([c, v]) => r[c] === v));
  const chain = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      filters.push([col, val]);
      return chain;
    },
    maybeSingle: async () => ({ data: matched()[0] ?? null, error: null }),
    update: () => chain,
    insert: async (row: T) => {
      onInsert?.(row);
      return { error: null };
    },
    // Awaiting the builder directly (the average recompute does this).
    then: (resolve: (v: { data: T[]; error: null }) => unknown) =>
      Promise.resolve({ data: matched(), error: null }).then(resolve),
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "reader-1" } } }) },
  }),
  createServiceClient: () => ({
    from(table: string) {
      if (table === "books") return query(() => books as unknown as Record<string, unknown>[]);
      if (table === "reviews") {
        return query(
          () => reviewRows as unknown as Record<string, unknown>[],
          (row) => reviewRows.push(row as unknown as (typeof reviewRows)[number]),
        );
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

function form(rating: number) {
  const fd = new FormData();
  fd.set("rating", String(rating));
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  books = [
    { id: "published-book", slug: "grade-4-science", is_published: true },
    { id: "draft-book", slug: "secret-draft", is_published: false },
  ];
  reviewRows = [];
  mockRateLimit.mockResolvedValue({ success: true, reset: Date.now() });
});

describe("submitReview establishes its target instead of trusting it", () => {
  it("accepts a review for a real published book", async () => {
    const res = await submitReview("published-book", "grade-4-science", form(5));

    expect(res).toEqual({ success: true });
    expect(reviewRows).toHaveLength(1);
  });

  it("refuses a book id that does not exist, and writes nothing", async () => {
    const res = await submitReview("00000000-0000-0000-0000-000000000000", "anything", form(5));

    expect(res.success).toBe(false);
    expect(reviewRows).toHaveLength(0);
  });

  it("refuses an unpublished draft — the case whose rating would outlive it", async () => {
    const res = await submitReview("draft-book", "secret-draft", form(5));

    expect(res.success).toBe(false);
    expect(reviewRows).toHaveLength(0);
  });

  it("revalidates the slug the database holds, not the one the caller sent", async () => {
    await submitReview("published-book", "attacker-supplied-slug", form(4));

    expect(mockRevalidate).toHaveBeenCalledWith("/books/grade-4-science");
  });

  it("still enforces the review rate limit", async () => {
    mockRateLimit.mockResolvedValue({ success: false, reset: Date.now() + 60_000 });

    const res = await submitReview("published-book", "grade-4-science", form(5));

    expect(res.success).toBe(false);
    expect(reviewRows).toHaveLength(0);
  });
});
