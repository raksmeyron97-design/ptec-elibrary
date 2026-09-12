// lib/resources/contributor-view.test.ts
//
// The SEO 3.2 acceptance fixtures (§47, §48). Every case here is a rule the
// canonical read policy makes, not a behaviour that happens to fall out of it.

import { describe, expect, it } from "vitest";

import {
  authorRoleContributors,
  contributorKey,
  contributorNames,
  dedupeContributors,
  kindOfCanonicalRow,
  resolveContributors,
  viewsFromCanonical,
  viewsFromLegacy,
  type CanonicalContributorRow,
  type ResourceContributorView,
} from "@/lib/resources/contributor-view";
import type { OrgIdentity } from "@/lib/system-settings/org-identity";

const ORG = {
  institutionName: "Example Teacher Education College",
  institutionNameKm: "វិទ្យាល័យគរុកោសល្យគំរូ",
  abbreviation: "ETEC",
  institutionUrl: "https://www.example.edu.kh",
  siteName: "Example Library",
  libraryName: "Example Library",
} as unknown as OrgIdentity;

const row = (over: Partial<CanonicalContributorRow> = {}): CanonicalContributorRow => ({
  contributorId: "c1",
  displayName: "Jane Doe",
  nameKm: null,
  contributorType: "person",
  recordSource: "manual",
  role: "author",
  sequence: 0,
  ...over,
});

// ── Kind comes from the row, not from a second reading of the name ───────────

describe("§16 a canonical row is not re-classified", () => {
  it("keeps an organization an organization, whatever its name reads like", () => {
    // "Angkor Sok" contains no organisational vocabulary at all — the name
    // alone would say Person. The stored type is the fact.
    const { kind } = kindOfCanonicalRow(
      row({ displayName: "Angkor Sok", contributorType: "organization" }),
      ORG,
    );
    expect(kind).toBe("organization");
  });

  it("trusts a classifier-written person row as stored", () => {
    expect(kindOfCanonicalRow(row({ displayName: "Jane Doe" }), ORG).kind).toBe("person");
  });

  it("never splits a canonical name", () => {
    // A comma inside a stored contributor is part of one name — the split
    // already happened at ingestion, or the row would not exist.
    const views = viewsFromCanonical([row({ displayName: "Smith, John" })], ORG);
    expect(views.map((v) => v.name)).toEqual(["Smith, John"]);
  });
});

describe("§17/§18 a backfilled `person` is a default, not a judgement", () => {
  it("re-reads a 0105-backfilled row whose name is a corporate body", () => {
    const result = kindOfCanonicalRow(
      row({
        displayName: "Ministry of Education, Youth and Sport",
        contributorType: "person",
        recordSource: "authors",
      }),
      ORG,
    );
    expect(result.kind).toBe("organization");
    expect(result.typeConflict).toBe(true);
  });

  it("reports the disagreement rather than resolving it silently", () => {
    const result = kindOfCanonicalRow(
      row({
        displayName: "ក្រសួងអប់រំ យុវជន និងកីឡា",
        contributorType: "person",
        recordSource: "authors",
      }),
      ORG,
    );
    expect(result.typeConflict).toBe(true);
  });

  it("leaves an ordinary backfilled person alone", () => {
    const result = kindOfCanonicalRow(
      row({ displayName: "Sok Dara", contributorType: "person", recordSource: "authors" }),
      ORG,
    );
    expect(result).toEqual({ kind: "person", typeConflict: false });
  });
});

describe("§19 the institution is the institution", () => {
  it("wins over a stored `person` type", () => {
    const result = kindOfCanonicalRow(
      row({ displayName: ORG.institutionName, contributorType: "person", recordSource: "manual" }),
      ORG,
    );
    expect(result.kind).toBe("institution");
    expect(result.typeConflict).toBe(true);
  });

  it("recognises the Khmer name as the same institution", () => {
    expect(
      kindOfCanonicalRow(row({ displayName: ORG.institutionNameKm! }), ORG).kind,
    ).toBe("institution");
  });

  it("is not claimed when the site has no published identity to compare with", () => {
    expect(kindOfCanonicalRow(row({ displayName: "Example Teacher Education College" })).kind)
      .not.toBe("institution");
  });
});

// ── Order ────────────────────────────────────────────────────────────────────

describe("§11 sequence is the public order", () => {
  it("orders by sequence, never alphabetically", () => {
    const views = viewsFromCanonical(
      [
        row({ contributorId: "c3", displayName: "Zoe Adams", sequence: 0 }),
        row({ contributorId: "c1", displayName: "Adam Zeller", sequence: 1 }),
        row({ contributorId: "c2", displayName: "Mary Brown", sequence: 2 }),
      ],
      ORG,
    );
    expect(contributorNames(views)).toEqual(["Zoe Adams", "Adam Zeller", "Mary Brown"]);
  });

  it("restores order when the query returns rows shuffled", () => {
    const views = viewsFromCanonical(
      [
        row({ contributorId: "b", displayName: "Second", sequence: 1 }),
        row({ contributorId: "a", displayName: "First", sequence: 0 }),
      ],
      ORG,
    );
    expect(contributorNames(views)).toEqual(["First", "Second"]);
  });
});

// ── Dedupe ───────────────────────────────────────────────────────────────────

describe("§8 no duplicate contributors", () => {
  it("collapses one person holding two credits, keeping the first", () => {
    const views = viewsFromCanonical(
      [
        row({ contributorId: "c1", displayName: "Jane Doe", role: "author", sequence: 0 }),
        row({ contributorId: "c1", displayName: "Jane Doe", role: "translator", sequence: 1 }),
      ],
      ORG,
    );
    const deduped = dedupeContributors(views);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].role).toBe("author");
  });

  it("dedupes an id-less credit on the folded name", () => {
    const a = viewsFromLegacy("Jane  Doe", ORG);
    const b = viewsFromLegacy("jane doe", ORG);
    expect(dedupeContributors([...a, ...b])).toHaveLength(1);
  });

  it("does NOT merge two different people who share a surname", () => {
    const views = dedupeContributors([
      ...viewsFromLegacy("Sok Dara", ORG),
      ...viewsFromLegacy("Sok Nara", ORG),
    ]);
    expect(views).toHaveLength(2);
  });

  it("keeps a person and an organisation of the same name apart", () => {
    const person: ResourceContributorView = {
      contributorId: null, kind: "person", name: "Mekong", nameKm: null,
      role: "author", sequence: 0, source: "legacy", typeConflict: false,
    };
    const org: ResourceContributorView = { ...person, kind: "organization" };
    expect(contributorKey(person)).not.toBe(contributorKey(org));
  });
});

// ── The read policy ──────────────────────────────────────────────────────────

describe("§48 legacy fallback", () => {
  it("uses the byline when the graph has no credits", () => {
    const result = resolveContributors({
      canonical: [],
      canonicalAvailable: true,
      legacyByline: "Sok Dara; Chan Vuthy",
      org: ORG,
    });
    expect(result.source).toBe("legacy");
    expect(contributorNames(result.contributors)).toEqual(["Sok Dara", "Chan Vuthy"]);
  });

  it("reports `none` when neither source knows anything", () => {
    const result = resolveContributors({ canonical: [], canonicalAvailable: true, org: ORG });
    expect(result).toEqual({ contributors: [], source: "none" });
  });

  it("canonical WINS and the legacy byline does not duplicate it", () => {
    const result = resolveContributors({
      canonical: [row({ contributorId: "c1", displayName: "Jane Doe" })],
      canonicalAvailable: true,
      // The very string the canonical row was derived from.
      legacyByline: "Jane Doe",
      org: ORG,
    });
    expect(result.source).toBe("canonical");
    expect(contributorNames(result.contributors)).toEqual(["Jane Doe"]);
  });

  it("a CONFLICTING legacy identity is not silently merged in", () => {
    const result = resolveContributors({
      canonical: [row({ contributorId: "c1", displayName: "Jane Doe" })],
      canonicalAvailable: true,
      legacyByline: "John Smith",
      org: ORG,
    });
    // The canonical answer stands alone. The disagreement is a data fact for
    // the conflict report — never something to publish both sides of.
    expect(contributorNames(result.contributors)).toEqual(["Jane Doe"]);
    expect(result.source).toBe("canonical");
  });
});

describe("§49 a failed read is not an empty one", () => {
  it("reports `unavailable`, distinct from `none`", () => {
    const result = resolveContributors({
      canonical: null,
      canonicalAvailable: false,
      legacyByline: null,
      org: ORG,
    });
    expect(result.source).toBe("unavailable");
    expect(result.contributors).toEqual([]);
  });

  it("still renders the byline rather than deleting the relationship", () => {
    const result = resolveContributors({
      canonical: null,
      canonicalAvailable: false,
      legacyByline: "Sok Dara",
      org: ORG,
    });
    expect(contributorNames(result.contributors)).toEqual(["Sok Dara"]);
    // …but never claims the graph said so.
    expect(result.source).toBe("unavailable");
  });
});

describe("§4.5 omission is valid", () => {
  it("an unsplittable multi-person byline resolves to nothing", () => {
    const result = resolveContributors({
      canonical: [],
      canonicalAvailable: true,
      // Commas with a single-token segment: could be an inverted name.
      legacyByline: "Creemers, Kyriakides, Sammons",
      org: ORG,
    });
    expect(result.contributors).toEqual([]);
    expect(result.source).toBe("none");
  });
});

// ── Roles ────────────────────────────────────────────────────────────────────

describe("§10 roles stay semantic", () => {
  it("carries the role off the canonical row", () => {
    const views = viewsFromCanonical([row({ role: "editor" })], ORG);
    expect(views[0].role).toBe("editor");
  });

  it("carries the role a legacy byline states", () => {
    const views = viewsFromLegacy("Alice Ray, Bob Fenn (Editors)", ORG);
    expect(views.every((v) => v.role === "editor")).toBe(true);
    expect(contributorNames(views)).toEqual(["Alice Ray", "Bob Fenn"]);
  });

  it("an author-role credit is preferred for a bibliographic author field", () => {
    const views = viewsFromCanonical(
      [
        row({ contributorId: "a", displayName: "Jane Doe", role: "author", sequence: 0 }),
        row({ contributorId: "b", displayName: "Ed Itor", role: "editor", sequence: 1 }),
      ],
      ORG,
    );
    expect(contributorNames(authorRoleContributors(views))).toEqual(["Jane Doe"]);
  });

  it("an edited volume cites its editors rather than nobody", () => {
    const views = viewsFromCanonical(
      [row({ contributorId: "b", displayName: "Ed Itor", role: "editor" })],
      ORG,
    );
    expect(contributorNames(authorRoleContributors(views))).toEqual(["Ed Itor"]);
  });
});
