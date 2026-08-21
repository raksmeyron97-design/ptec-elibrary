// lib/home-data.test.ts
//
// Pins the failure SHAPE of the homepage's Recent Additions strip.
//
// The bug these tests exist for: the publications slice selected
// `author_names` from the `publications` base table, where that column does
// not exist — it is the aggregated byline computed by the
// publications_with_stats view (migration 0114). PostgREST rejected the whole
// query, getRecentAdditions logged the error and returned [], and because
// "errored" and "empty" were the same value, <NewArrivals> just rendered one
// fewer type. It stayed broken in production because nothing could tell the
// difference.
//
// Two guards, deliberately of different kinds:
//   1. Behavioural — a source that ERRORS must be reported in `failed`, and
//      must never be laundered into a plain empty list.
//   2. A source scan — no query anywhere may ask the publications BASE TABLE
//      for author_names again, in this fetcher or any future one.
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("next/cache", () => ({
  // Pass-through: these tests exercise the fetcher, not Next's cache.
  unstable_cache: (fn: unknown) => fn,
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

type Result = { data: unknown[] | null; error: { message: string } | null };

/** What each table hands back this test run. */
let sources: Record<string, Result>;
/** Every from()/select() the fetcher issued, so a test can assert WHICH
 *  relation was read — table vs view is the whole point here. */
let queries: { table: string; select: string }[];

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from(table: string) {
      const q: Record<string, unknown> = {};
      const chain = () => q;
      Object.assign(q, {
        select(cols: string) {
          queries.push({ table, select: cols });
          return q;
        },
        eq: chain,
        order: chain,
        limit: chain,
        // Thenable, so `await db.from(...).select(...)…` resolves.
        then(resolve: (v: Result) => unknown, reject: (e: unknown) => unknown) {
          const result = sources[table] ?? { data: [], error: null };
          return Promise.resolve(result).then(resolve, reject);
        },
      });
      return q;
    },
  }),
}));

import { getRecentAdditions } from "./home-data";

function row(over: Record<string, unknown> = {}) {
  return {
    id: "id-1",
    title: "A Title",
    slug: "a-slug",
    cover_url: null,
    author_names: "An Author",
    created_at: "2026-08-01T00:00:00.000Z",
    ...over,
  };
}

const ok = (rows: unknown[]): Result => ({ data: rows, error: null });
const broken = (message: string): Result => ({ data: null, error: { message } });

beforeEach(() => {
  queries = [];
  sources = {
    books: ok([]),
    research_reports: ok([]),
    publications_with_stats: ok([]),
  };
});

describe("getRecentAdditions — which relation each slice reads", () => {
  it("reads publications from the VIEW, because author_names is not a base-table column", async () => {
    await getRecentAdditions(4);

    const pub = queries.find((q) => q.select.includes("author_names") && q.table.startsWith("publications"));
    expect(pub, "no publications query was issued").toBeDefined();
    expect(pub!.table).toBe("publications_with_stats");
    // The exact regression: this is the query that failed in production.
    expect(pub!.table).not.toBe("publications");
  });

  it("asks publications for a cover, like books and theses", async () => {
    await getRecentAdditions(4);
    const pub = queries.find((q) => q.table === "publications_with_stats");
    expect(pub!.select).toContain("cover_url");
  });
});

describe("getRecentAdditions — errored is not the same as empty", () => {
  it("reports no failures when every source simply has nothing", async () => {
    const res = await getRecentAdditions(4);
    expect(res.items).toEqual([]);
    expect(res.failed).toEqual([]);
  });

  it("names the source that errored instead of returning a bare empty list", async () => {
    sources.publications_with_stats = broken('column publications.author_names does not exist');

    const res = await getRecentAdditions(4);

    expect(res.failed).toContain("publication");
    // The property that was previously unrepresentable: a broken library and
    // an empty one must not produce the same value.
    const emptyButHealthy = { items: [], failed: [] };
    expect(res).not.toEqual(emptyButHealthy);
  });

  it("still returns the sources that worked when one slice is broken", async () => {
    sources.books = ok([row({ id: "b1", slug: "book-1", created_at: "2026-08-03T00:00:00.000Z" })]);
    sources.research_reports = ok([row({ id: "t1", slug: "thesis-1", created_at: "2026-08-02T00:00:00.000Z" })]);
    sources.publications_with_stats = broken("boom");

    const res = await getRecentAdditions(4);

    // Partial degradation is the intended behaviour — a broken publications
    // query must not take books and theses down with it.
    expect(res.items.map((i) => i.type)).toEqual(["book", "thesis"]);
    expect(res.failed).toEqual(["publication"]);
  });

  it("reports every failure when all three slices are broken", async () => {
    sources.books = broken("boom");
    sources.research_reports = broken("boom");
    sources.publications_with_stats = broken("boom");

    const res = await getRecentAdditions(4);

    expect(res.items).toEqual([]);
    expect(res.failed).toEqual(["book", "thesis", "publication"]);
  });
});

describe("getRecentAdditions — merging", () => {
  it("sorts across all three types by when the item joined the library", async () => {
    sources.books = ok([row({ id: "b1", slug: "b1", created_at: "2026-08-01T00:00:00.000Z" })]);
    sources.research_reports = ok([row({ id: "t1", slug: "t1", created_at: "2026-08-05T00:00:00.000Z" })]);
    sources.publications_with_stats = ok([row({ id: "p1", slug: "p1", created_at: "2026-08-03T00:00:00.000Z" })]);

    const res = await getRecentAdditions(4);

    expect(res.items.map((i) => i.type)).toEqual(["thesis", "publication", "book"]);
    expect(res.failed).toEqual([]);
  });

  it("drops rows that cannot be linked to, without calling it a failure", async () => {
    sources.books = ok([row({ slug: null }), row({ id: "b2", slug: "ok" })]);

    const res = await getRecentAdditions(4);

    expect(res.items).toHaveLength(1);
    expect(res.failed).toEqual([]);
  });
});

// ── Source scan ─────────────────────────────────────────────────────────────
// Behavioural tests only cover the call site they exercise. This one covers
// every call site there will ever be.

const ROOT = path.join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name))
    .map((e) => path.join(e.parentPath ?? dir, e.name));
}

/** Strip comments — a file that DOCUMENTS this rule in prose must not trip it. */
function code(file: string): string {
  return fs
    .readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("publications author_names comes from the view, everywhere", () => {
  it("no query selects author_names from the publications base table", () => {
    const offenders: string[] = [];

    for (const dir of ["lib", "app", "components"]) {
      for (const file of sourceFiles(path.join(ROOT, dir))) {
        const src = code(file);
        // Each `from("publications")` — the base table, not the view — followed
        // by the select chain it belongs to.
        const re = /\.from\(\s*["'`]publications["'`]\s*\)([\s\S]{0,400})/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src)) !== null) {
          if (/author_names/.test(m[1])) {
            offenders.push(path.relative(ROOT, file));
          }
        }
      }
    }

    expect(
      offenders,
      `author_names is not a column on public.publications — it is computed by the
publications_with_stats view (migration 0114). Selecting it from the base table
makes PostgREST reject the ENTIRE query, and a fetcher that swallows the error
returns an empty list that looks exactly like "nothing to show".
Query publications_with_stats instead. Offending file(s):`,
    ).toEqual([]);
  });
});
