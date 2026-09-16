/**
 * The curation rule, and the three things it must never do.
 *
 * Half of this exercises the pure decisions; the other half is a source scan,
 * in the tradition of this repo's other invariant tests, because the failures
 * that matter here are not wrong return values — they are a mutation that
 * writes one column too many, or a control drawn where the server refuses.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  FEATURED_BOOKS_MAX,
  PUBLIC_FEATURED_RENDER_LIMIT,
  assessFeatureEligibility,
  featuredRowWarning,
  isReorderOf,
  moveItem,
  positionLabel,
  sameOrder,
} from "./featured";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("eligibility: published AND verified, both", () => {
  it("accepts a published, verified book", () => {
    expect(assessFeatureEligibility({ status: "published", verifiedAt: "2026-09-01T00:00:00Z" })).toEqual({
      eligible: true,
      blockers: [],
    });
  });

  it("refuses a verified draft — the shelf is a public surface", () => {
    const { eligible, blockers } = assessFeatureEligibility({
      status: "draft",
      verifiedAt: "2026-09-01T00:00:00Z",
    });
    expect(eligible).toBe(false);
    expect(blockers).toContain("not_published");
  });

  it("refuses a published but unverified book — its citation box still warns readers", () => {
    const { eligible, blockers } = assessFeatureEligibility({ status: "published", verifiedAt: null });
    expect(eligible).toBe(false);
    expect(blockers).toContain("not_verified");
  });

  it("reports both blockers when both apply, so one fix does not look like the last one", () => {
    expect(assessFeatureEligibility({ status: "draft", verifiedAt: null }).blockers).toEqual([
      "not_published",
      "not_verified",
    ]);
  });

  it("treats an absent status or stamp as ineligible rather than defaulting to allow", () => {
    expect(assessFeatureEligibility({}).eligible).toBe(false);
    expect(assessFeatureEligibility({ status: undefined, verifiedAt: undefined }).eligible).toBe(false);
  });

  it("flags — never evicts — a featured row that has since lost its qualification", () => {
    expect(featuredRowWarning({ status: "draft", verifiedAt: "2026-09-01" })).toBe("not_published");
    expect(featuredRowWarning({ status: "published", verifiedAt: null })).toBe("not_verified");
    expect(featuredRowWarning({ status: "published", verifiedAt: "2026-09-01" })).toBeNull();
  });
});

describe("ordering", () => {
  const ids = ["a", "b", "c", "d"];

  it("moves an item and returns a new array", () => {
    const next = moveItem(ids, 0, 2);
    expect(next).toEqual(["b", "c", "a", "d"]);
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });

  it("moves backwards too", () => {
    expect(moveItem(ids, 3, 0)).toEqual(["d", "a", "b", "c"]);
  });

  it("is a no-op outside the list — a drag ending off the list is a gesture, not an error", () => {
    expect(moveItem(ids, 0, 9)).toEqual(ids);
    expect(moveItem(ids, -1, 0)).toEqual(ids);
    expect(moveItem(ids, 1, 1)).toEqual(ids);
  });

  it("keyboard and drag produce the same order — one function, so they cannot diverge", () => {
    // "Move c up twice" and "drag c to index 0" must agree.
    const viaKeyboard = moveItem(moveItem(ids, 2, 1), 1, 0);
    const viaDrag = moveItem(ids, 2, 0);
    expect(viaKeyboard).toEqual(viaDrag);
  });

  it("sameOrder detects a real change and ignores a no-op", () => {
    expect(sameOrder(ids, ["a", "b", "c", "d"])).toBe(true);
    expect(sameOrder(ids, ["b", "a", "c", "d"])).toBe(false);
    expect(sameOrder(ids, ["a", "b", "c"])).toBe(false);
  });

  it("isReorderOf accepts a permutation and refuses anything else", () => {
    expect(isReorderOf(ids, ["d", "c", "b", "a"])).toBe(true);
    expect(isReorderOf(ids, ["a", "b", "c"])).toBe(false); // dropped
    expect(isReorderOf(ids, ["a", "b", "c", "e"])).toBe(false); // substituted
    expect(isReorderOf(ids, ["a", "a", "b", "c"])).toBe(false); // duplicated
    expect(isReorderOf([], [])).toBe(true);
  });

  it("positions are 1-based and zero-padded, matching what the page prints", () => {
    expect(positionLabel(0)).toBe("01");
    expect(positionLabel(11)).toBe("12");
  });
});

describe("no fabricated product cap", () => {
  it("there is no maximum on how many books may be featured", () => {
    expect(FEATURED_BOOKS_MAX).toBeNull();
  });

  it("the public render bound is separate from the (absent) product cap", () => {
    expect(PUBLIC_FEATURED_RENDER_LIMIT).toBeGreaterThan(0);
    // Stated so a future reader does not mistake one for the other.
    expect(read("lib/books/featured.ts")).toMatch(/RENDER bound[\s\S]{0,200}not a product cap/);
  });
});

// ── Source scans ────────────────────────────────────────────────────────────

describe("the curation mutations cannot become something else", () => {
  const actions = read("app/actions/featured-books.ts");

  it("every mutation is gated through the registry, not by a role check", () => {
    // The three mutations share one opener, and that opener is the guard.
    expect(actions).toMatch(/async function openMutation\([\s\S]{0,160}requireAction\(actionId\)/);
    expect(actions.match(/openMutation\("books\.feature"\)/g) ?? []).toHaveLength(3);
    expect(actions).toContain('requireAction("books.featured.view")');
    // The shapes this replaces: a hand-rolled role comparison, or a level
    // comparison that skips the super-admin short-circuit.
    expect(actions).not.toMatch(/role\s*===\s*["'](admin|librarian|super_admin)["']/);
    expect(actions).not.toMatch(/perms(?:\.\w+|\[["'`][^"'`]+["'`]\])\s*===\s*["']write["']/);
  });

  it("unfeaturing never touches publication or verification", () => {
    const unfeature = actions.slice(
      actions.indexOf("export async function unfeatureBook"),
      actions.indexOf("// ── Reorder"),
    );
    expect(unfeature).toContain("featured_at: null");
    // The contract in one assertion: the only columns this writes are the
    // three curation ones.
    expect(unfeature).not.toMatch(/\bstatus:/);
    expect(unfeature).not.toMatch(/is_published/);
    expect(unfeature).not.toMatch(/verified_at:/);
  });

  it("featuring re-decides eligibility on the server from the live row", () => {
    expect(actions).toContain("assessFeatureEligibility");
    expect(actions).toMatch(/\.from\("books"\)[\s\S]{0,200}status, verified_at/);
  });

  it("all three mutations are audited through the one audit helper", () => {
    for (const action of ["book.featured", "book.unfeatured", "book.feature_reordered"]) {
      expect(actions, `${action} is not logged`).toContain(`"${action}"`);
    }
    expect(actions).toContain("logAdminAction");
    // No second audit mechanism.
    expect(actions).not.toMatch(/\.from\("admin_audit_log"\)/);
  });

  it("reordering refuses a stale order rather than applying it", () => {
    expect(actions).toContain("isReorderOf");
    expect(actions).toContain("stale_order");
    // And the database re-checks it, which is where the guarantee lives.
    expect(read("supabase/migrations/0149_books_featured.sql")).toContain("featured_set_changed");
  });

  it("the shelf is invalidated through the central helper, never a raw revalidatePath('/books')", () => {
    expect(actions).toContain("revalidateBook");
    // revalidatePath("/books") is a silent no-op — public routes are keyed
    // /en/books and /km/books. See lib/cache/revalidate.ts.
    expect(actions).not.toMatch(/revalidatePath\(["']\/books["']\)/);
  });
});

describe("the public shelf reads the canonical order and nothing else", () => {
  const data = read("lib/books-data.ts");
  const shelf = data.slice(data.indexOf("export const getFeaturedBooks"), data.indexOf("// ── Cached filter lists"));

  it("orders by featured_position", () => {
    expect(shelf).toContain('order("featured_position", { ascending: true })');
  });

  it("has no recency or popularity fallback ordering", () => {
    expect(shelf).not.toContain("created_at");
    expect(shelf).not.toContain("download_count");
  });

  it("still requires the book to be published", () => {
    expect(shelf).toContain('eq("is_published", true)');
  });

  it("is cached under the tag every curation mutation already busts", () => {
    expect(shelf).toContain('tags: ["books"]');
  });
});

describe("the public surface exposes curation, not the curator", () => {
  const migration = read("supabase/migrations/0149_books_featured.sql");

  it("books_with_stats carries the timestamp and position but never featured_by", () => {
    const view = migration.slice(migration.indexOf("create view public.books_with_stats"));
    expect(view).toContain("b.featured_at, b.featured_position");
    expect(view).not.toContain("featured_by");
  });

  it("the renumber function is service-role only", () => {
    expect(migration).toMatch(
      /revoke all on function public\.set_featured_book_order\(uuid\[\]\) from public, anon, authenticated/,
    );
  });

  it("a position cannot exist without the timestamp that explains it", () => {
    expect(migration).toContain("books_featured_consistent");
  });

  it("two books cannot hold one slot", () => {
    expect(migration).toMatch(/create unique index books_featured_position_key[\s\S]{0,120}where featured_at is not null/);
  });
});
