import { describe, expect, it } from "vitest";

import {
  classifyContributor,
  contributorNodes,
  contributorNodesFor,
  looksLikeOrganization,
  splitByline,
  stripRoleSuffix,
} from "@/lib/seo/contributor";
import { ORGANIZATION_ID } from "@/lib/seo/entity-ids";
import type { OrgIdentity } from "@/lib/system-settings/org-identity";

const ORG = {
  institutionName: "Phnom Penh Teacher Education College",
  institutionNameKm: "វិទ្យាល័យគរុកោសល្យភ្នំពេញ",
  abbreviation: "PTEC",
} as unknown as OrgIdentity;

/** Bylines copied verbatim from production on 2026-09-12. */
describe("the institution is referenced, never re-minted", () => {
  it("resolves the site's own institution to an @id reference", () => {
    expect(contributorNodes("Phnom Penh Teacher Education College", ORG)).toEqual([
      { "@id": ORGANIZATION_ID },
    ]);
  });

  it("matches the institution regardless of case and punctuation", () => {
    expect(contributorNodes("phnom penh teacher education college.", ORG)).toEqual([
      { "@id": ORGANIZATION_ID },
    ]);
  });

  it("matches the Khmer institution name and the abbreviation", () => {
    expect(contributorNodes(ORG.institutionNameKm, ORG)).toEqual([{ "@id": ORGANIZATION_ID }]);
    expect(contributorNodes("PTEC", ORG)).toEqual([{ "@id": ORGANIZATION_ID }]);
  });

  it("NEVER emits a Person carrying the institution's name", () => {
    const nodes = contributorNodes("Phnom Penh Teacher Education College", ORG);
    expect(JSON.stringify(nodes)).not.toContain("Person");
  });
});

describe("a corporate body is an Organization, in both scripts", () => {
  it.each([
    "American Psychological Association",
    "Ministry of Education, Youth and Sport",
    "Lovely Professional University",
    "Department for Education and Skills (DfES) United Kingdom",
    "Capacity Development Partnership Fund (CDPF III)",
  ])("types %s as an Organization", (name) => {
    const nodes = contributorNodes(name, ORG);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ "@type": "Organization" });
  });

  it("types a Khmer ministry as an Organization, not a Person", () => {
    const nodes = contributorNodes("ក្រសួងអប់រំ យុវជន និងកីឡា", ORG);
    expect(nodes).toEqual([
      { "@type": "Organization", name: "ក្រសួងអប់រំ យុវជន និងកីឡា" },
    ]);
  });

  it("recognises Khmer university and institute vocabulary", () => {
    expect(looksLikeOrganization("សាកលវិទ្យាល័យ អាសុី អឺរ៉ុប")).toBe(true);
    expect(looksLikeOrganization("វិទ្យាស្ថានជាតិអប់រំ")).toBe(true);
  });

  it("does not mistake an ordinary human name for an organization", () => {
    for (const name of ["Adrian Wallwork", "Alan Bryman", "Anita Woolfolk", "Anne Burns"]) {
      expect(looksLikeOrganization(name)).toBe(false);
      expect(classifyContributor(name, ORG)).toBe("person");
    }
  });
});

describe("a byline that is several people is not published as one Person", () => {
  it("splits a comma list of full names into one node each", () => {
    const nodes = contributorNodes("Donald Ary, Lucy Cheser Jacobs, Chris Sorensen", ORG);
    expect(nodes).toEqual([
      { "@type": "Person", name: "Donald Ary" },
      { "@type": "Person", name: "Lucy Cheser Jacobs" },
      { "@type": "Person", name: "Chris Sorensen" },
    ]);
  });

  it("strips a trailing role marker and still splits (production case)", () => {
    const nodes = contributorNodes(
      "Bert P.M. Creemers, Leonidas Kyriakides, Pam Sammons (Editors)",
      ORG,
    );
    expect(nodes).toEqual([
      { "@type": "Person", name: "Bert P.M. Creemers" },
      { "@type": "Person", name: "Leonidas Kyriakides" },
      { "@type": "Person", name: "Pam Sammons" },
    ]);
    expect(JSON.stringify(nodes)).not.toMatch(/editor/i);
  });

  it("splits on non-comma delimiters", () => {
    expect(contributorNodes("Geoffrey E. Mills & L. R. Gay", ORG)).toEqual([
      { "@type": "Person", name: "Geoffrey E. Mills" },
      { "@type": "Person", name: "L. R. Gay" },
    ]);
  });

  it("keeps an inverted single name whole rather than inventing two people", () => {
    expect(splitByline("Smith, John")).toEqual([]);
    expect(contributorNodes("Smith, John", ORG)).toEqual([]);
  });

  it("publishes NOTHING rather than one Person for an unsplittable multi-name byline", () => {
    // Two names, comma-delimited, one of which is a single token — the split is
    // unsafe and the composite claim is false. Omission is the only honest answer.
    expect(contributorNodes("Sammons, P.", ORG)).toEqual([]);
  });

  it("does NOT shred an institution whose own name contains a delimiter", () => {
    // The regression this guards: splitting before classifying turns one
    // ministry into three entities named "Ministry of Education", "Youth"
    // and "Sport".
    expect(contributorNodes("Ministry of Education, Youth and Sport", ORG)).toEqual([
      { "@type": "Organization", name: "Ministry of Education, Youth and Sport" },
    ]);
    expect(
      contributorNodes("Department for Education and Skills (DfES) United Kingdom", ORG),
    ).toHaveLength(1);
  });

  it("does not retype a person whose surname happens to read institutional", () => {
    // "press", "board", "trust", "fund", "union", "network", "office" are all
    // plausible surnames and are deliberately absent from the vocabulary.
    for (const name of ["John Press", "Mary Board", "Alan Fund", "Ruth Network"]) {
      expect(contributorNodes(name, ORG)).toEqual([{ "@type": "Person", name }]);
    }
  });
});

describe("role markers are not part of a name", () => {
  it.each([
    ["Pam Sammons (Editors)", "Pam Sammons"],
    ["Pam Sammons, editor", "Pam Sammons"],
    ["Pam Sammons (ed.)", "Pam Sammons"],
    ["Pam Sammons [Trans]", "Pam Sammons"],
  ])("%s → %s", (raw, expected) => {
    expect(stripRoleSuffix(raw)).toBe(expected);
  });

  it("does not eat a name that merely contains those letters", () => {
    expect(stripRoleSuffix("Edward Edmonds")).toBe("Edward Edmonds");
    expect(stripRoleSuffix("Jane Trantham")).toBe("Jane Trantham");
  });
});

describe("empty and unknown input", () => {
  it.each([null, undefined, "", "   "])("emits no claim for %s", (raw) => {
    expect(contributorNodes(raw, ORG)).toEqual([]);
  });

  it("flattens a list of bylines", () => {
    expect(contributorNodesFor(["Anne Burns", null, "UNESCO"], ORG)).toEqual([
      { "@type": "Person", name: "Anne Burns" },
      { "@type": "Organization", name: "UNESCO" },
    ]);
  });

  it("works without an OrgIdentity (institution rule simply does not fire)", () => {
    expect(contributorNodes("Anne Burns")).toEqual([{ "@type": "Person", name: "Anne Burns" }]);
  });
});

// ── Invariant: nothing may hand-roll a Person from a byline ──────────────────
//
// This is a source scan, not a behaviour test, because the defect it guards is
// a NEW call site rather than a wrong result from an existing one. The bug
// being prevented already happened once at eight places at the same time: each
// builder independently decided that a byline is a person, and each was wrong
// for the same 30% of the collection. A unit test on this module cannot see a
// ninth builder that never calls it.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * Files allowed to write `"@type": "Person"` by hand.
 *
 * Only the team pages, and only because those describe REAL, individually
 * catalogued members of staff — a `Person` there is a true claim about one
 * human, not a guess about a free-text byline copied off a title page.
 */
const PERSON_ALLOWLIST = [
  "app/[locale]/(public)/about/team/page.tsx",
  "app/[locale]/(public)/about/team/[slug]/page.tsx",
  // The classifier itself is what emits the node everyone else asks for.
  "lib/seo/contributor.ts",
];

describe("no byline may be typed Person by hand", () => {
  it("keeps Person assertions inside the classifier and the team pages", () => {
    const roots = ["app", "lib/seo"].map((r) => join(process.cwd(), r));
    const offenders: string[] = [];

    for (const root of roots) {
      for (const file of sourceFiles(root)) {
        const src = readFileSync(file, "utf8");
        if (!/["']@type["']\s*:\s*["']Person["']/.test(src)) continue;
        const rel = file.slice(process.cwd().length + 1);
        if (!PERSON_ALLOWLIST.includes(rel)) offenders.push(rel);
      }
    }

    expect(
      offenders,
      `These files assert schema.org Person directly. A byline in this library ` +
        `is often a ministry, an institution, or several people — route it ` +
        `through contributorNodes() in lib/seo/contributor.ts instead.`,
    ).toEqual([]);
  });
});
