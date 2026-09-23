import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { normalizeByline } from "@/lib/resources/contributor-identity";
import { authorSlug } from "@/lib/authors/slug";

const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const MIGRATION = "supabase/migrations/0147_composite_author_split.sql";

// The migration is GENERATED from normalizeByline() + authorSlug(). These
// assert that what was generated still agrees with what those functions say
// today — a change to the splitter that silently diverged from the shipped
// data is exactly the drift the generator exists to prevent.
describe("the generated split still matches the shipped splitter", () => {
  const sql = read(MIGRATION);

  /** (composite, person, slug, role, seq) tuples from the VALUES table. */
  const tuples = [...sql.matchAll(/^\s{4}\('((?:[^']|'')*)', '((?:[^']|'')*)', '([^']*)', '(\w+)', (\d+)\)/gm)].map(
    (m) => ({
      composite: m[1].replace(/''/g, "'"),
      person: m[2].replace(/''/g, "'"),
      slug: m[3],
      role: m[4],
      seq: Number(m[5]),
    }),
  );

  it("carries the split data", () => {
    expect(tuples.length).toBeGreaterThan(100);
  });

  it("every person is one the splitter actually names, in that order", () => {
    const byComposite = new Map<string, typeof tuples>();
    for (const t of tuples) {
      byComposite.set(t.composite, [...(byComposite.get(t.composite) ?? []), t]);
    }
    for (const [composite, rows] of byComposite) {
      const expected = normalizeByline(composite).contributors.map((c) => c.displayName.trim());
      expect(rows.sort((a, b) => a.seq - b.seq).map((r) => r.person), composite).toEqual(expected);
    }
  });

  it("every slug is the one authorSlug() derives", () => {
    for (const t of tuples) expect(authorSlug(t.person), t.person).toBe(t.slug);
  });

  it("credits the role the byline STATES, not always 'author'", () => {
    // 10 of the 43 composites end in "(Editors)". Crediting those scholars as
    // authors of a book they edited is a false bibliographic claim.
    for (const t of tuples) expect(t.role, t.composite).toBe(normalizeByline(t.composite).role);
    expect(tuples.some((t) => t.role === "editor"), "no editor role present").toBe(true);
  });

  it("never splits a byline the splitter refuses to separate", () => {
    for (const t of tuples) {
      expect(normalizeByline(t.composite).contributors.length, t.composite).toBeGreaterThan(1);
    }
  });
});

describe("the migration's safety properties", () => {
  const sql = read(MIGRATION);

  it("never writes to books.author_id", () => {
    // A single FK cannot hold three authors; repointing it destroys two
    // thirds of what it records — the trap that made the PISA "fix"
    // destructive (SEO 3.3 §5.3).
    expect(sql).not.toMatch(/update\s+public\.books/i);
    // An ASSIGNMENT to author_id, i.e. in a SET clause. `ON b.author_id =
    // ca.id` is a join predicate — a read — and must not trip this.
    expect(sql).not.toMatch(/\bset\b[^;]*\bauthor_id\s*=/i);
    expect(sql).not.toMatch(/insert into public\.books/i);
  });

  it("only writes the three tables it is supposed to", () => {
    const written = new Set(
      [...sql.matchAll(/\b(?:INSERT INTO|UPDATE)\s+public\.(\w+)/gi)].map((m) => m[1].toLowerCase()),
    );
    expect([...written].sort()).toEqual(["authors", "contributors", "resource_contributors"]);
  });

  it("gates every write on the composite existing in THIS database", () => {
    // Without the gate it creates 113 authors with no works on any database
    // lacking the source books — measured on the CI seed, which produced
    // exactly that before the gate was added.
    const gates = sql.match(/EXISTS \(SELECT 1 FROM public\.authors \w+ WHERE \w+\.name = s\.composite\)/g) ?? [];
    expect(gates.length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("JOIN public.authors ca ON ca.name = s.composite");
  });

  it("is idempotent on every write", () => {
    expect(sql).toContain("ON CONFLICT (slug) WHERE slug IS NOT NULL DO NOTHING");
    expect(sql).toContain("NOT EXISTS (SELECT 1 FROM public.contributors c2");
    expect(sql).toContain("ON CONFLICT (resource_type, resource_id, contributor_id, role) DO NOTHING");
  });

  it("does not depend on the caller opening a transaction", () => {
    // `ON COMMIT DROP` needs one. Production's applier uses
    // --single-transaction, but a plain `psql < file` on the box does not, and
    // the temp table would vanish before the next statement — verified.
    // As a CLAUSE, not as the word inside the comment that explains why it is
    // avoided — the first draft of this test matched its own documentation.
    expect(sql).not.toMatch(/CREATE TEMP TABLE[^;]*ON COMMIT DROP/i);
    expect(sql).toContain("DROP TABLE IF EXISTS composite_split;");
    expect(sql).toMatch(/CREATE TEMP TABLE composite_split \([^;]*\);/);
  });

  it("records its own provenance rather than posing as hand-entered", () => {
    // 'manual' means the write path produced it, and kindOfCanonicalRow()
    // believes a stored `person` only for that source.
    expect(sql).toContain("'composite_split'");
    expect(sql).toContain("contributors_source_check");
  });
});

describe("the directory counts canonical credits without double-counting", () => {
  const src = read("lib/authors/directory.ts");

  it("reads resource_contributors", () => {
    expect(src).toContain('from("resource_contributors")');
    expect(src).toContain('from("contributors")');
  });

  it("counts distinct BOOKS per author, not credit rows", () => {
    // The legacy FK and the canonical credit describe the same book for a
    // single-author title; summing both reports every ordinary author as
    // having written each of their books twice.
    expect(src).toContain("const countedBooks = new Map<string, Set<string>>()");
    expect(src).toContain("seen.add(bookId)");
  });

  it("counts a canonical credit only for a PUBLISHED book", () => {
    expect(src).toContain("publishedBookIds.has(rc.resource_id)");
  });

  it("selects the book id it dedupes on", () => {
    // Without `id` in the select, the dedupe set is empty and silently does
    // nothing.
    //
    // Matched across whitespace: the read is a paged sweep now, so the chain
    // spans several lines (lib/db/paged-scan.ts). The rule is which COLUMNS
    // are asked for, never how the call is formatted.
    expect(src).toMatch(/from\("books"\)\s*\.select\("id, author_id"\)/);
  });
});

describe("a composite URL is a signpost, not a person", () => {
  const page = read("app/[locale]/(public)/authors/[slug]/page.tsx");

  it("withdraws itself from the index but stays followable", () => {
    // It cannot be the canonical result for any one of the people it names,
    // and a 301 is unavailable: one target, three people.
    expect(page).toContain("normalizeByline(author.name).contributors.length > 1");
    expect(page).toContain("robots: { index: false, follow: true }");
    expect(page).not.toContain("follow: false");
  });

  it("links the constituents through the works-gated resolver", () => {
    // resolveAuthorLinks() returns only people with public works, so a person
    // whose page would be empty is never linked to a soft-404.
    expect(page).toContain("resolveAuthorLinks(");
    expect(page).toContain("const isComposite = namedPeople.length > 1");
  });

  it("renders nothing extra for an ordinary single-person author", () => {
    expect(page).toContain("isComposite && constituents.length > 0");
  });
});
