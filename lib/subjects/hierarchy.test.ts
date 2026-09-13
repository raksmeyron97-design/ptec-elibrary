import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The subject hierarchy is written once, in SQL, by
// supabase/migrations/0146_subjects_canonical_backfill.sql. There is no
// TypeScript copy to compare it against — so this reads the migration itself
// and pins the PROPERTIES that make the tree defensible, not its contents.
//
// Why bother: the pairs are not taxonomy taste, they are the strongest
// measured tag co-occurrences in the collection
// (docs/SEO-3.3-TOPIC-AUTHORITY-AUDIT.md §10.1). A later edit that adds a pair
// because it "reads right" is exactly the drift this phase was created to
// avoid, and SQL in a migration is invisible to every other test here.

const migration = readFileSync(
  join(__dirname, "..", "..", "supabase", "migrations", "0146_subjects_canonical_backfill.sql"),
  "utf8",
);

/** The `c_tree` literal, as [child, parent] pairs. */
function treePairs(): [string, string][] {
  const block = migration.match(/c_tree constant text\[\]\[\] := ARRAY\[([\s\S]*?)\];/);
  if (!block) throw new Error("c_tree literal not found — did the migration change shape?");
  return [...block[1].matchAll(/\['([^']+)',\s*'([^']+)'\]/g)].map(
    (m) => [m[1], m[2]] as [string, string],
  );
}

describe("the canonical subject hierarchy", () => {
  const pairs = treePairs();

  it("is the 3-parent / 7-child tree the co-occurrence data supports", () => {
    expect(pairs).toHaveLength(7);
    expect(new Set(pairs.map(([, parent]) => parent)).size).toBe(3);
  });

  it("carries no cycle — nothing is both a parent and a child", () => {
    // `parent_id` is a self-reference with ON DELETE SET NULL, which cannot
    // untangle a cycle; a two-level tree is the only shape that is safe by
    // construction here.
    const parents = new Set(pairs.map(([, p]) => p));
    const children = new Set(pairs.map(([c]) => c));
    const both = [...children].filter((c) => parents.has(c));
    expect(both, "a subject may not be both parent and child").toEqual([]);
  });

  it("names each child exactly once", () => {
    // A child with two parents is not a tree, and `parent_id` can only hold
    // one — the second assignment would silently overwrite the first.
    const children = pairs.map(([c]) => c);
    expect(new Set(children).size).toBe(children.length);
  });

  it("does NOT encode the strongest pair in the data as containment", () => {
    // គណិតវិទ្យា ⇄ គរុកោសល្យ shares 18 tags, more than any pair in the tree.
    // It is a cross-link — "maths is taught" — and making it parentage would
    // assert that pedagogy CONTAINS mathematics. The measurement being the
    // largest is not what makes a relation hierarchical.
    const names = pairs.flat();
    expect(names).not.toContain("គរុកោសល្យ");
  });

  it("only ever links a subject to a category that exists in the same file", () => {
    // Every name must be resolved through `categories.name`; a pair naming
    // something else could never resolve and would silently do nothing.
    expect(migration).toContain("WHERE c.name = c_tree[i][1]");
    expect(migration).toContain("WHERE c.name = c_tree[i][2]");
  });

  it("reports an unresolved pair instead of failing or guessing", () => {
    // A category renamed after this file was written must not block a deploy,
    // and must not look like success either.
    expect(migration).toContain("v_missing := v_missing ||");
    expect(migration).toContain("did NOT resolve and were skipped");
    expect(migration).not.toMatch(/RAISE\s+EXCEPTION/i);
  });

  it("refuses to make a subject its own parent", () => {
    expect(migration).toContain("SELF-PARENT REFUSED");
  });
});

describe("the backfill's classification rules", () => {
  it("writes an edge for every book with a category, published or not", () => {
    // A subject is a classification fact; publication is a separate one.
    // Filtering on is_published here would leave a book with no canonical
    // subject the moment it is published.
    const insert = migration.slice(migration.indexOf("SELECT 'book', b.id, s.id, true, 0"));
    const stmt = insert.slice(0, insert.indexOf("ON CONFLICT"));
    expect(stmt).not.toMatch(/is_published/);
  });

  it("credits PISA from the title, as a SECONDARY subject", () => {
    // `books.category_id` is a single FK, so the primary shelf must survive
    // untouched — this table is where a book gets to be both.
    expect(migration).toContain("b.title ILIKE '%PISA%'");
    expect(migration).toContain("SELECT 'book', b.id, s.id, false, 1");
  });

  it("invents no English name for a Khmer subject", () => {
    // `categories` holds one Khmer name column and nothing else. name_km gets
    // the Khmer name; name_en keeps the only name the library has.
    expect(migration).toContain("CASE WHEN c.name ~ '[ក-៿]' THEN c.name ELSE NULL END");
  });

  it("stays additive — it never writes to the legacy tables", () => {
    const writes = [...migration.matchAll(/\b(UPDATE|INSERT INTO|DELETE FROM)\s+public\.(\w+)/g)];
    const touched = new Set(writes.map((m) => m[2]));
    expect([...touched].sort()).toEqual(["resource_subjects", "subjects"]);
  });
});
