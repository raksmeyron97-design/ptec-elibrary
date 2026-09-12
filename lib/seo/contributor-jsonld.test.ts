// lib/seo/contributor-jsonld.test.ts
//
// §31 ACCEPTANCE FIXTURES — asserted on the JSON-LD a real builder EMITS, not
// on the classifier that feeds it.
//
// The classifier tests prove the decision is right. These prove the decision
// survives the builder: that `bookJsonLd()` actually spends the answer, omits
// the property when there is no honest answer, and never reintroduces a
// `Person` on the way out. A correct classifier wired into a builder that
// ignores it would pass every other test in this repository.

import { describe, expect, it } from "vitest";

import { bookJsonLd } from "@/lib/seo/book-seo";
import { ORGANIZATION_ID } from "@/lib/seo/entity-ids";
import type { OrgIdentity } from "@/lib/system-settings/org-identity";

const ORG = {
  institutionName: "Example Teacher Education College",
  institutionNameKm: "វិទ្យាល័យគរុកោសល្យគំរូ",
  abbreviation: "ETEC",
  institutionUrl: "https://www.example.edu.kh",
  siteName: "Example Library",
  libraryName: "Example Library",
} as unknown as OrgIdentity;

const book = (authors?: string[]) => ({
  slug: "a-book",
  title: "A Book",
  authors,
});

const authorOf = (authors?: string[]) =>
  bookJsonLd(book(authors), "en", null, ORG).author as unknown;

describe("§31 a person contributor", () => {
  it("emits exactly one Person", () => {
    expect(authorOf(["Jane Doe"])).toEqual([{ "@type": "Person", name: "Jane Doe" }]);
  });
});

describe("§31 an organization contributor", () => {
  it("emits Organization, never Person", () => {
    expect(authorOf(["Ministry of Education, Youth and Sport"])).toEqual([
      { "@type": "Organization", name: "Ministry of Education, Youth and Sport" },
    ]);
  });

  it("types a Khmer ministry as an Organization", () => {
    expect(authorOf(["ក្រសួងអប់រំ យុវជន និងកីឡា"])).toEqual([
      { "@type": "Organization", name: "ក្រសួងអប់រំ យុវជន និងកីឡា" },
    ]);
  });
});

describe("§31 the institution as contributor", () => {
  it("references the existing #organization node and nothing else", () => {
    expect(authorOf([ORG.institutionName])).toEqual([{ "@id": ORGANIZATION_ID }]);
  });

  it("emits no second node describing the institution", () => {
    const schema = bookJsonLd(book([ORG.institutionName]), "en", null, ORG);
    const json = JSON.stringify(schema.author);
    expect(json).not.toContain("Person");
    expect(json).not.toContain(ORG.institutionName);
  });

  it("does the same for the Khmer name and the abbreviation", () => {
    expect(authorOf([ORG.institutionNameKm])).toEqual([{ "@id": ORGANIZATION_ID }]);
    expect(authorOf([ORG.abbreviation])).toEqual([{ "@id": ORGANIZATION_ID }]);
  });
});

describe("§31 multiple contributors", () => {
  it("emits one node each, in byline order", () => {
    expect(authorOf(["Louis Cohen, Lawrence Manion, Keith Morrison"])).toEqual([
      { "@type": "Person", name: "Louis Cohen" },
      { "@type": "Person", name: "Lawrence Manion" },
      { "@type": "Person", name: "Keith Morrison" },
    ]);
  });

  it("drops a cataloguer role marker from every name it emits", () => {
    const json = JSON.stringify(authorOf(["A. Smith, B. Jones (Editors)"]));
    expect(json).not.toMatch(/editor/i);
  });
});

describe("§31 an ambiguous contributor", () => {
  it("OMITS the author property rather than fabricating one", () => {
    // "Smith, John" is one inverted name, indistinguishable from a two-name
    // list. The builder must publish nothing rather than guess either way.
    expect(authorOf(["Smith, John"])).toBeUndefined();
  });

  it("never lets the raw string become an ENTITY, though it may remain TEXT", () => {
    // The distinction this pins: a byline the library cannot resolve is still
    // a true thing the CATALOGUE says, so it legitimately appears in prose —
    // `description` renders "A Book by Smith, John — a free e-book…", which is
    // a quotation, not a claim about who exists. What must never happen is the
    // same string becoming a typed node: an entity assertion Google reads as
    // fact. Asserting "the string appears nowhere" would forbid the honest use
    // along with the dishonest one.
    const schema = bookJsonLd(book(["Smith, John"]), "en", null, ORG);
    expect(schema.author).toBeUndefined();

    const entityFields = Object.entries(schema).filter(
      ([key]) => key !== "description" && key !== "name",
    );
    for (const [key, value] of entityFields) {
      expect(JSON.stringify(value ?? ""), key).not.toContain("Smith, John");
    }
  });
});

describe("§31 a missing contributor", () => {
  it.each([undefined, [], [""], ["   "]])("omits author for %s", (authors) => {
    expect(authorOf(authors as string[] | undefined)).toBeUndefined();
  });

  it("never emits an 'Unknown Author' placeholder", () => {
    const json = JSON.stringify(bookJsonLd(book(), "en", null, ORG));
    expect(json).not.toMatch(/unknown author/i);
  });
});
