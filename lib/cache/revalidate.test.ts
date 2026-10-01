// lib/cache/revalidate.test.ts
//
// Pins the invalidation map: which tags and localized paths each mutation
// helper busts. A helper silently dropping a tag is exactly how a published
// record stays invisible (or a stale count keeps rendering) for up to an
// hour — so the map is asserted, not assumed.
import { describe, it, expect, vi, beforeEach } from "vitest";

const revalidateTag = vi.fn();
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

const announcePublicChange = vi.fn();
vi.mock("@/lib/seo/indexnow.server", () => ({
  announcePublicChange: (...args: unknown[]) => announcePublicChange(...args),
}));

import {
  TAGS,
  revalidateBook,
  revalidateBookSlugChange,
  revalidateCatalogBook,
  revalidateThesis,
  revalidatePublication,
  revalidateLearningPath,
  revalidateCollectionStats,
  revalidateLocalizedPath,
  revalidatePost,
  revalidateJournals,
  revalidateAuthorProfile,
  revalidateTeam,
  revalidateTaxonomy,
} from "./revalidate";

const tags = () => revalidateTag.mock.calls.map((c) => c[0]);
const paths = () => revalidatePath.mock.calls.map((c) => c[0]);

beforeEach(() => {
  revalidateTag.mockClear();
  revalidatePath.mockClear();
});

describe("revalidateLocalizedPath", () => {
  it("expands public paths to every locale (bare /books would match nothing)", () => {
    revalidateLocalizedPath("/books");
    expect(paths()).toEqual(["/en/books", "/km/books"]);
  });

  it("passes admin paths through un-prefixed", () => {
    revalidateLocalizedPath("/admin/books");
    expect(paths()).toEqual(["/admin/books"]);
  });
});

describe("collection-stats invalidation (public counters)", () => {
  it("revalidateCollectionStats busts the stats tag and the homepage in both locales", () => {
    revalidateCollectionStats();
    expect(tags()).toContain(TAGS.collectionStats);
    // Homepage prerender keys are the locale roots — /en and /km, never
    // "/en/" or the retired /home route.
    expect(paths()).toEqual(expect.arrayContaining(["/en", "/km"]));
  });

  // Publishing/unpublishing/creating/deleting ANY counted entity must move
  // the shared counters — each entity helper carries the stats bust.
  it.each([
    ["revalidateBook", () => revalidateBook("some-slug")],
    ["revalidateCatalogBook", () => revalidateCatalogBook("some-slug")],
    ["revalidateThesis", () => revalidateThesis("some-slug")],
    ["revalidatePublication", () => revalidatePublication("some-slug")],
    ["revalidateLearningPath", () => revalidateLearningPath("some-slug")],
  ])("%s includes the collection-stats tag", (_name, run) => {
    run();
    expect(tags()).toContain(TAGS.collectionStats);
  });
});

describe("entity helpers", () => {
  it("revalidateBook busts list tag, entity tag, detail + listing in both locales", () => {
    revalidateBook("my-book", { affectsHome: true });
    expect(tags()).toEqual(
      expect.arrayContaining([TAGS.books, TAGS.book("my-book"), TAGS.homeBooks]),
    );
    expect(paths()).toEqual(
      expect.arrayContaining([
        "/en/books/my-book",
        "/km/books/my-book",
        "/en/books",
        "/km/books",
        "/en",
        "/km",
      ]),
    );
  });

  it("slug change busts BOTH the old and the new detail page", () => {
    revalidateBookSlugChange("old-slug", "new-slug");
    expect(tags()).toEqual(
      expect.arrayContaining([TAGS.book("old-slug"), TAGS.book("new-slug")]),
    );
    expect(paths()).toEqual(
      expect.arrayContaining(["/en/books/old-slug", "/en/books/new-slug"]),
    );
  });

  it("revalidateThesis busts the research_reports tag (review-approval regression)", () => {
    revalidateThesis();
    expect(tags()).toContain(TAGS.theses);
    expect(paths()).toEqual(expect.arrayContaining(["/en/theses", "/km/theses"]));
  });
});

// SEO Phase 7.2 — a publish reaches the sitemaps on the next request, and,
// only when the owner has switched IndexNow on, the engines that use it.
describe("sitemaps follow every record change", () => {
  it.each([
    ["revalidateBook", () => revalidateBook("b")],
    ["revalidateThesis", () => revalidateThesis("t")],
    ["revalidatePublication", () => revalidatePublication("a")],
    ["revalidateJournals", () => revalidateJournals("j")],
    ["revalidatePost", () => revalidatePost("p")],
    ["revalidateLearningPath", () => revalidateLearningPath("l")],
    ["revalidateAuthorProfile", () => revalidateAuthorProfile("x")],
    ["revalidateTeam", () => revalidateTeam()],
    ["revalidateTaxonomy", () => revalidateTaxonomy()],
  ])("%s fires the sitemap tag", (_name, run) => {
    run();
    expect(tags()).toContain(TAGS.sitemap);
  });

  it("the sitemap entry cache is tagged with that same tag", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(__dirname, "../seo/sitemap-entries.ts"), "utf8");
    expect(src).toMatch(/tags: \[TAGS\.sitemap\]/);
  });
});

describe("IndexNow announcements", () => {
  const settle = () => new Promise((r) => setTimeout(r, 0));
  beforeEach(() => announcePublicChange.mockClear());

  it("load nothing and send nothing while INDEXNOW_KEY is unset", async () => {
    vi.stubEnv("INDEXNOW_KEY", "");
    revalidateBook("b");
    revalidateThesis("t");
    await settle();
    expect(announcePublicChange).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("announce each record's own locale-free path when a key is set", async () => {
    vi.stubEnv("INDEXNOW_KEY", "0123456789abcdef");
    revalidateBook("b");
    revalidateThesis("t");
    revalidatePublication("a");
    revalidatePost("p");
    revalidateLearningPath("l");
    revalidateBook(null); // a listing-only change names no record
    await vi.waitFor(() => expect(announcePublicChange).toHaveBeenCalledTimes(5));
    await settle();
    expect(announcePublicChange.mock.calls.map((c) => c[0]).sort()).toEqual([
      ["/books/b"],
      ["/journals/articles/a"],
      ["/paths/l"],
      ["/posts/p"],
      ["/theses/t"],
    ]);
    vi.unstubAllEnvs();
  });
});
