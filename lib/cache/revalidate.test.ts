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
    revalidateLocalizedPath("/admin/manage");
    expect(paths()).toEqual(["/admin/manage"]);
  });
});

describe("collection-stats invalidation (public counters)", () => {
  it("revalidateCollectionStats busts the stats tag and /home in both locales", () => {
    revalidateCollectionStats();
    expect(tags()).toContain(TAGS.collectionStats);
    expect(paths()).toEqual(expect.arrayContaining(["/en/home", "/km/home"]));
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
        "/en/home",
        "/km/home",
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
