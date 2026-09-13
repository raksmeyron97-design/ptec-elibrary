import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildMembershipIndex,
  pathTitle,
  pathsForBook,
  type ModuleRow,
  type PathRow,
  type StepRow,
} from "./membership";

const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const path = (over: Partial<PathRow> = {}): PathRow => ({
  id: "p1",
  slug: "early-grade-math",
  title: "Early Grade Mathematics",
  status: "published",
  position: 0,
  ...over,
});

function build(paths: PathRow[], modules: ModuleRow[], steps: StepRow[]) {
  return buildMembershipIndex({ paths, modules, steps });
}

describe("book → learning path membership", () => {
  it("links a book to the published path that teaches it", () => {
    const idx = build(
      [path()],
      [{ id: "m1", path_id: "p1" }],
      [{ module_id: "m1", resource_type: "book", resource_id: "b1" }],
    );
    expect(pathsForBook(idx, "b1").map((p) => p.slug)).toEqual(["early-grade-math"]);
  });

  it("counts a book used twice in one curriculum as ONE membership", () => {
    // A text read in week 1 and revisited in week 6 is one relationship, not
    // two identical chips on the book page.
    const idx = build(
      [path()],
      [{ id: "m1", path_id: "p1" }, { id: "m2", path_id: "p1" }],
      [
        { module_id: "m1", resource_type: "book", resource_id: "b1" },
        { module_id: "m2", resource_type: "book", resource_id: "b1" },
      ],
    );
    expect(pathsForBook(idx, "b1")).toHaveLength(1);
  });

  it("never leaks an unpublished path onto a public book page", () => {
    // A draft curriculum is not a claim about a book, and a book page is the
    // last place an unannounced course should appear.
    for (const status of ["draft", "scheduled", "archived", null, undefined]) {
      const idx = build(
        [path({ status: status as string })],
        [{ id: "m1", path_id: "p1" }],
        [{ module_id: "m1", resource_type: "book", resource_id: "b1" }],
      );
      expect(pathsForBook(idx, "b1"), `status=${String(status)}`).toEqual([]);
    }
  });

  it("drops a step whose module or path is missing", () => {
    // `resource_id` is an FK BY CONVENTION — the column is polymorphic and has
    // no foreign key, so every hop is checked rather than assumed.
    const orphanModule = build(
      [path()],
      [],
      [{ module_id: "gone", resource_type: "book", resource_id: "b1" }],
    );
    expect(pathsForBook(orphanModule, "b1")).toEqual([]);

    const orphanPath = build(
      [],
      [{ id: "m1", path_id: "p-gone" }],
      [{ module_id: "m1", resource_type: "book", resource_id: "b1" }],
    );
    expect(pathsForBook(orphanPath, "b1")).toEqual([]);
  });

  it("ignores steps that are not books", () => {
    // Production has only book steps today, but the column permits research,
    // catalog and external — and an external URL has no book id at all.
    const idx = build(
      [path()],
      [{ id: "m1", path_id: "p1" }],
      [
        { module_id: "m1", resource_type: "research", resource_id: "r1" },
        { module_id: "m1", resource_type: "catalog", resource_id: "c1" },
        { module_id: "m1", resource_type: "external", resource_id: null },
      ],
    );
    expect(pathsForBook(idx, "r1")).toEqual([]);
    expect(pathsForBook(idx, "c1")).toEqual([]);
    expect([...idx.keys()]).toEqual([]);
  });

  it("orders paths by position then title, so two books agree", () => {
    const idx = build(
      [
        path({ id: "p2", slug: "b-second", title: "B", position: 2 }),
        path({ id: "p1", slug: "a-first", title: "A", position: 1 }),
        path({ id: "p3", slug: "c-tie", title: "C", position: 1 }),
      ],
      [
        { id: "m1", path_id: "p1" },
        { id: "m2", path_id: "p2" },
        { id: "m3", path_id: "p3" },
      ],
      [
        { module_id: "m2", resource_type: "book", resource_id: "b1" },
        { module_id: "m3", resource_type: "book", resource_id: "b1" },
        { module_id: "m1", resource_type: "book", resource_id: "b1" },
      ],
    );
    expect(pathsForBook(idx, "b1").map((p) => p.slug)).toEqual(["a-first", "c-tie", "b-second"]);
  });

  it("answers [] for a book in no path, and for no book at all", () => {
    const idx = build([path()], [{ id: "m1", path_id: "p1" }], []);
    expect(pathsForBook(idx, "nobody")).toEqual([]);
    expect(pathsForBook(idx, null)).toEqual([]);
    expect(pathsForBook(idx, undefined)).toEqual([]);
  });

  it("shows the Khmer title only when there is one", () => {
    const ref = { id: "p1", slug: "s", title: "English", titleKm: null };
    expect(pathTitle(ref, "km")).toBe("English");
    expect(pathTitle({ ...ref, titleKm: "ខ្មែរ" }, "km")).toBe("ខ្មែរ");
    expect(pathTitle({ ...ref, titleKm: "ខ្មែរ" }, "en")).toBe("English");
    expect(pathTitle({ ...ref, titleKm: "   " }, "km")).toBe("English");
  });
});

// Source scans: the two rules that make this edge safe are in the server
// module and the component, neither of which a pure test can execute.
describe("the curriculum edge stays cheap and self-invalidating", () => {
  it("is cached under the tag path edits already fire", () => {
    // revalidateLearningPath() fires TAGS.paths on every save, status change
    // and archive. Tagging here means a removed step leaves the book page on
    // the next request — with no second revalidation call to keep in sync.
    const src = read("lib/learning-paths/membership-index.ts");
    expect(src).toContain("tags: [TAGS.paths, TAGS.books]");
    expect(read("lib/cache/revalidate.ts")).toContain("revalidateTag(TAGS.paths");
  });

  it("treats a failed read as unknown, never as 'taught nowhere'", () => {
    const src = read("lib/learning-paths/membership-index.ts");
    // Throwing keeps the bad answer out of the hour-long cache.
    expect(src).toContain("if (paths.error) throw new Error");
    expect(src).toContain("if (modules.error) throw new Error");
    expect(src).toContain("if (steps.error) throw new Error");
  });

  it("builds ONE index for the library rather than querying per book", () => {
    // 9 paths / 27 modules / 82 steps in production: a per-book query would be
    // three round trips to learn that 90% of books are taught in none.
    const src = read("lib/learning-paths/membership-index.ts");
    expect(src).toContain("unstable_cache");
    expect(src).not.toMatch(/\.eq\(\s*["']resource_id["']/);
  });

  it("renders nothing rather than an empty heading", () => {
    expect(read("components/seo/BookLearningPaths.tsx")).toContain(
      "if (paths.length === 0) return null;",
    );
  });
});
