// lib/home/payload.test.ts
//
// The mandatory duplicate check, plus the composition rules around it.
//
// The homepage's defining defect was that five shelves drew from one ~114-item
// collection and showed the same titles repeatedly — /books/pisa-d appeared
// FOUR times, and 33 resource links resolved to only 19 distinct resources.
// composeHomePayload() is the single place that can now happen, so this is the
// single place it is asserted.
import { describe, it, expect } from "vitest";
import {
  composeHomePayload,
  hrefOf,
  HERO_BOOKS,
  FEATURED_ITEMS,
  ARRIVAL_ITEMS,
  type RawHomeData,
  type HomePayload,
} from "./payload";
import { resourceKey } from "./exclusions";
import type { Book } from "@/lib/book-utils";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function book(slug: string, over: Partial<Book> = {}): Book {
  return {
    slug,
    title: `Title ${slug}`,
    author: "A. Author",
    isbn: "",
    department: "Pedagogy",
    category: "Pedagogy",
    language: "English",
    year: 2024,
    format: "PDF",
    availability: "Digital",
    rating: 0,
    pages: 0,
    summary: "",
    cover: "#1E3A8A",
    tags: [],
    viewCount: 10,
    downloadCount: 2,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function raw(over: Partial<RawHomeData> = {}): RawHomeData {
  return {
    trendingBooks: [],
    mostViewedBooks: [],
    recentBooks: [],
    theses: [],
    publications: [],
    posts: [],
    recentAdditions: [],
    departments: [],
    trendingTerms: [],
    paths: [],
    stats: null,
    locale: "en",
    ...over,
  };
}

const thesisRow = (slug: string) => ({
  id: `t-${slug}`,
  slug,
  title: `Thesis ${slug}`,
  author_names: "S. Student",
  cohort: "2024",
  cover_url: null,
  view_count: 174,
  download_count: 8,
  score: 198,
});

const pubRow = (slug: string) => ({
  id: `p-${slug}`,
  slug,
  title: `Publication ${slug}`,
  title_km: `ការបោះពុម្ព ${slug}`,
  article_type: "article",
  journal_name: "Journal of Things",
  doi: null,
  publication_date: "2024-01-01",
  abstract: null,
  abstract_km: null,
  references: [],
  author_names: "R. Researcher",
});

const recent = (type: "book" | "thesis" | "publication", slug: string, addedAt: string) => ({
  id: `r-${type}-${slug}`,
  title: `Recent ${slug}`,
  author: null,
  type,
  coverUrl: null,
  addedAt,
  slug,
});

/** Every resource the composed page would link to, across every section. */
function allRenderedKeys(p: HomePayload): string[] {
  return [
    ...p.heroBooks.map((b) => resourceKey({ type: "book", slug: b.slug })),
    ...p.featured.map(resourceKey),
    ...p.arrivals.map(resourceKey),
  ];
}

// ── The rule ─────────────────────────────────────────────────────────────────

describe("no resource appears twice on the homepage", () => {
  it("holds when every section's ranking wants the same books", () => {
    // The worst realistic case, and close to the real one: a small collection
    // where downloads, views and recency all surface the same titles.
    const slugs = Array.from({ length: 20 }, (_, i) => `book-${i}`);
    const books = slugs.map((s) => book(s));

    const payload = composeHomePayload(
      raw({
        trendingBooks: books,
        mostViewedBooks: books, // identical ranking
        recentBooks: books, // identical ranking
        recentAdditions: slugs.map((s, i) =>
          recent("book", s, `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`),
        ),
      }),
    );

    const keys = allRenderedKeys(payload);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("holds when a book and a thesis share a slug", () => {
    // `research` is both a real book slug and the real thesis slug in this
    // collection; they are different resources at different URLs.
    const payload = composeHomePayload(
      raw({
        trendingBooks: [book("research")],
        mostViewedBooks: [book("research")],
        theses: [thesisRow("research")],
      }),
    );
    const urls = [
      ...payload.heroBooks.map((b) => hrefOf({ type: "book", slug: b.slug })),
      ...payload.featured.map(hrefOf),
    ];
    expect(urls).toContain("/books/research");
    expect(urls).toContain("/theses/research");
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("holds on the live collection's actual shape (112 books, 1 thesis, 1 publication)", () => {
    const books = Array.from({ length: 112 }, (_, i) => book(`b${i}`));
    const payload = composeHomePayload(
      raw({
        // The real fetch shapes: 12 by downloads, 24 by views, 12 by recency.
        // Views and downloads agree at the head on a small collection, so the
        // view pool deliberately starts where the hero does.
        trendingBooks: books.slice(0, 12),
        mostViewedBooks: books.slice(0, 24),
        recentBooks: books.slice(0, 12),
        theses: [thesisRow("research")],
        publications: [pubRow("journal-of-chemical-education")],
        recentAdditions: [
          recent("book", "b0", "2026-08-01T00:00:00Z"),
          recent("thesis", "research", "2026-07-01T00:00:00Z"),
          recent("publication", "journal-of-chemical-education", "2026-07-04T00:00:00Z"),
          recent("book", "b50", "2026-06-01T00:00:00Z"),
          recent("book", "b51", "2026-05-01T00:00:00Z"),
          recent("book", "b52", "2026-04-01T00:00:00Z"),
          recent("book", "b12", "2026-03-01T00:00:00Z"),
          recent("book", "b60", "2026-02-01T00:00:00Z"),
        ],
      }),
    );

    const keys = allRenderedKeys(payload);
    expect(new Set(keys).size).toBe(keys.length);
    expect(payload.heroBooks).toHaveLength(HERO_BOOKS);
    expect(payload.featured).toHaveLength(FEATURED_ITEMS);
    expect(payload.arrivals).toHaveLength(ARRIVAL_ITEMS);
    // b0, the thesis, the publication and b12 were all claimed upstream, so
    // Arrivals skipped every one of them and backfilled to b60 instead of
    // repeating or coming up short.
    expect(payload.arrivals.map((a) => a.slug)).toEqual(["b50", "b51", "b52", "b60"]);
    expect(payload.arrivals.every((a) => a.type === "book")).toBe(true);
  });
});

// ── Composition rules ────────────────────────────────────────────────────────

describe("composeHomePayload", () => {
  it("reserves a featured slot for the thesis and the publication", () => {
    const books = Array.from({ length: 40 }, (_, i) => book(`b${i}`));
    const payload = composeHomePayload(
      raw({
        trendingBooks: books.slice(0, 12),
        mostViewedBooks: books,
        theses: [thesisRow("research")],
        publications: [pubRow("jce")],
      }),
    );
    const types = payload.featured.map((f) => f.type);
    expect(payload.featured).toHaveLength(FEATURED_ITEMS);
    expect(types.filter((t) => t === "thesis")).toHaveLength(1);
    expect(types.filter((t) => t === "publication")).toHaveLength(1);
    expect(types.filter((t) => t === "book")).toHaveLength(FEATURED_ITEMS - 2);
    // Books lead, then thesis, then publication.
    expect(types.at(-2)).toBe("thesis");
    expect(types.at(-1)).toBe("publication");
  });

  it("gives the reserved slots back to books when there are no theses or publications", () => {
    const books = Array.from({ length: 40 }, (_, i) => book(`b${i}`));
    const payload = composeHomePayload(
      raw({ trendingBooks: books.slice(0, 12), mostViewedBooks: books }),
    );
    expect(payload.featured).toHaveLength(FEATURED_ITEMS);
    expect(payload.featured.every((f) => f.type === "book")).toBe(true);
  });

  it("backfills featured from the recency ranking when the view ranking runs short", () => {
    const payload = composeHomePayload(
      raw({
        trendingBooks: [book("hero1")],
        mostViewedBooks: [book("hero1"), book("viewed1")],
        recentBooks: [book("recent1"), book("recent2"), book("recent3")],
      }),
    );
    // hero1 is claimed by the hero, so featured starts at viewed1 and continues
    // into the recency list rather than stopping one short.
    expect(payload.featured.map((f) => f.slug)).toEqual([
      "viewed1",
      "recent1",
      "recent2",
      "recent3",
    ]);
  });

  it("drops rows with no slug rather than linking them by id", () => {
    const payload = composeHomePayload(
      raw({ theses: [{ ...thesisRow("x"), slug: null }], publications: [{ ...pubRow("y"), slug: null }] }),
    );
    expect(payload.featured).toEqual([]);
  });

  it("uses the Khmer publication title under the km locale", () => {
    const en = composeHomePayload(raw({ publications: [pubRow("jce")], locale: "en" }));
    const km = composeHomePayload(raw({ publications: [pubRow("jce")], locale: "km" }));
    expect(en.featured[0].title).toBe("Publication jce");
    expect(km.featured[0].title).toBe("ការបោះពុម្ព jce");
  });

  it("builds the right detail route for every type", () => {
    expect(hrefOf({ type: "book", slug: "a" })).toBe("/books/a");
    expect(hrefOf({ type: "thesis", slug: "a" })).toBe("/theses/a");
    expect(hrefOf({ type: "publication", slug: "a" })).toBe("/publications/a");
    expect(hrefOf({ type: "post", slug: "a" })).toBe("/posts/a");
    expect(hrefOf({ type: "path", slug: "a" })).toBe("/paths/a");
  });
});

// ── Stats ────────────────────────────────────────────────────────────────────

describe("the hero stat strip's figures", () => {
  const stats = {
    books: 112,
    theses: 1,
    publications: 1,
    physicalCatalogs: 7,
    learningPaths: 4,
    totalDigitalResources: 114,
    searchableResources: 113,
    calculatedAt: "2026-08-18T00:00:00.000Z",
  };

  it("takes the subject count from the very list the subject grid renders", () => {
    // These two disagreeing is exactly the "111 vs 114" defect: the grid was
    // truncated while a separate figure was not.
    const departments = Array.from({ length: 8 }, (_, i) => ({ name: `d${i}`, count: 14 }));
    const payload = composeHomePayload(raw({ stats, departments }));
    expect(payload.stats?.subjects).toBe(8);
    expect(payload.subjects).toHaveLength(8);
    expect(payload.stats?.subjects).toBe(payload.subjects.length);
  });

  it("carries the total and the physical count, and nothing per-type", () => {
    const payload = composeHomePayload(raw({ stats }));
    expect(payload.stats).toEqual({
      digitalResources: 114,
      subjects: 0,
      physicalCatalogs: 7,
    });
    // The weak-signal figures ("1 theses", "1 publications") are structurally
    // absent, not merely hidden by a threshold.
    expect(Object.values(payload.stats!)).not.toContain(1);
  });

  it("reports null rather than zeros when the stats service is unavailable", () => {
    expect(composeHomePayload(raw({ stats: null })).stats).toBeNull();
  });
});
