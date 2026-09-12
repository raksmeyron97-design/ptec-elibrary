// lib/resources/contributor-consumers.test.ts
//
// SEO 3.2 SOURCE INVARIANTS (§44).
//
// SEO 3.0 removed eight hand-rolled `Person` nodes and 3.1 gave ingestion one
// normalizer. Neither could stop the failure this phase found: a consumer that
// READS the canonical graph and then throws away what made it canonical, or
// one that quietly grows a sixth definition of "where does one name end".
//
// These are source scans rather than unit tests because both defects are new
// CALL SITES, and a unit test on the shared layer cannot see a builder that
// never calls it. They read the filesystem directly (`readdirSync`), not `git
// grep`, so a brand-new untracked file is visible — the blind spot
// lib/invariant-scan-coverage.test.ts exists to keep closed.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function sourceFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** Source with comments removed, so prose describing a rule cannot trip it. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => (/^\s*\/\//.test(line) ? "" : line))
    .join("\n");
}

const rel = (file: string) => file.slice(ROOT.length + 1);

// ── 1. One byline splitter for every public surface ──────────────────────────
//
// Five files each carried their own `.split(",")` over an author string before
// this phase. A comma is ALSO how a single name is inverted, so every one of
// them published "Smith, John" as two people who do not exist — in a
// `citation_author` meta tag Google Scholar indexes, in an APA reference a
// student pastes into a bibliography, and in an OAI-PMH record a harvester
// mirrors. `citationNames()` is the one rule; a local re-implementation is the
// regression.

/** The surfaces that PUBLISH a byline: SEO, citations, machine exports, pages. */
const PUBLIC_BYLINE_SURFACES = [
  "lib/seo",
  "lib/metadata-exports",
  "lib/oai",
  "lib/citations.ts",
  "lib/books/citation.ts",
  "lib/theses/citation.ts",
  "lib/publications/citations.ts",
  "app/[locale]/(public)",
];

/** A split whose delimiter contains a comma — the ambiguous one. */
const COMMA_SPLIT =
  /\.split\(\s*(?:"[^"\n]*,[^"\n]*"|'[^'\n]*,[^'\n]*'|\/[^/\n]*,[^/\n]*\/)/g;

const NEAR_A_BYLINE = /author|byline|creator|contributor/i;

function publicSurfaceFiles(): string[] {
  const out: string[] = [];
  for (const entry of PUBLIC_BYLINE_SURFACES) {
    const full = join(ROOT, entry);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) sourceFiles(full, out);
    else out.push(full);
  }
  return out;
}

describe("§44 one byline splitter", () => {
  it("no public byline surface splits an author string on its own comma", () => {
    const offenders: string[] = [];
    for (const file of publicSurfaceFiles()) {
      const src = code(readFileSync(file, "utf8"));
      for (const match of src.matchAll(COMMA_SPLIT)) {
        const before = src.slice(Math.max(0, match.index - 100), match.index);
        if (!NEAR_A_BYLINE.test(before)) continue;
        offenders.push(`${rel(file)}:${src.slice(0, match.index).split("\n").length}`);
      }
    }

    expect(
      offenders,
      "These split a byline on a comma locally. A comma is also how a single " +
        "name is inverted, so this cites 'Smith, John' as two people. Use " +
        "citationNames() from lib/resources/contributor-identity.ts.",
    ).toEqual([]);
  });

  it("the shared rule keeps an inverted name whole", async () => {
    const { citationNames } = await import("@/lib/resources/contributor-identity");
    expect(citationNames("Smith, John")).toEqual(["Smith, John"]);
    expect(citationNames("Sok Dara, Chan Vuthy")).toEqual(["Sok Dara", "Chan Vuthy"]);
  });
});

// ── 2. Contributors are read through the shared model ────────────────────────
//
// A page that queries `resource_contributors` itself gets rows, not a policy:
// no institution identity check, no dedupe, no failure-versus-empty
// distinction, and — the one that actually shipped — no `kind`, so the page
// hands plain strings to a JSON-LD builder that re-classifies them. That round
// trip is how a contributor the DATABASE records as a corporate body comes
// back out as a `Person`.

describe("§7 the canonical graph has one public reader", () => {
  it("no page or component queries resource_contributors directly", () => {
    const allowed = new Set([
      "lib/resources/public-contributors.ts", // the cached public read
      "lib/resources/contributors.ts", // the anon/admin read
      "lib/authors/canonical-works.ts", // the author→works edge (§25)
    ]);

    const offenders: string[] = [];
    for (const root of ["app", "components"].map((r) => join(ROOT, r))) {
      for (const file of sourceFiles(root)) {
        const src = code(readFileSync(file, "utf8"));
        if (!/from\(\s*["']resource_contributors["']\s*\)/.test(src)) continue;
        if (!allowed.has(rel(file))) offenders.push(rel(file));
      }
    }

    expect(
      offenders,
      "Read contributors through getPublicResourceContributors() — it applies " +
        "the canonical read policy (graph, then legacy byline, and an explicit " +
        "`unavailable` when the read failed).",
    ).toEqual([]);
  });
});

// ── 3. A resolved contributor is never re-classified ─────────────────────────

describe("§16 the projection classifies nothing", () => {
  it("contributorNodesFromViews maps kind and does not call the parser", () => {
    const src = code(readFileSync(join(ROOT, "lib/seo/contributor.ts"), "utf8"));
    const body = src.slice(src.indexOf("export function contributorNodesFromViews"));
    const fn = body.slice(0, body.indexOf("\n}\n") + 2);
    for (const forbidden of ["normalizeByline", "classifyName", "splitByline", "parseAuthorNames"]) {
      expect(
        fn.includes(forbidden),
        `contributorNodesFromViews() must not call ${forbidden}() — its input ` +
          "has already been separated and typed.",
      ).toBe(false);
    }
  });

  it("every resource SEO builder can accept resolved contributors", () => {
    for (const file of ["lib/seo/book-seo.ts", "lib/seo/thesis-seo.ts", "lib/seo/publication-seo.ts"]) {
      const src = readFileSync(join(ROOT, file), "utf8");
      expect(src, `${file} must take a \`contributors\` input`).toMatch(
        /contributors\?:\s*readonly ResourceContributorView\[\]/,
      );
      expect(src, `${file} must project it through resolveContributorNodes()`).toContain(
        "resolveContributorNodes(",
      );
    }
  });
});

// ── 4. The institution stays one entity ──────────────────────────────────────

describe("§19 an institution contributor never mints a second node", () => {
  it("projects to a bare @id, whatever path it arrives by", async () => {
    const [{ contributorNodesFromViews }, { ORGANIZATION_ID }] = await Promise.all([
      import("@/lib/seo/contributor"),
      import("@/lib/seo/entity-ids"),
    ]);
    const nodes = contributorNodesFromViews([
      {
        contributorId: "c1",
        kind: "institution",
        name: "Any Teacher Education College",
        nameKm: null,
        role: "author",
        sequence: 0,
        source: "canonical",
        typeConflict: false,
      },
    ]);
    expect(nodes).toEqual([{ "@id": ORGANIZATION_ID }]);
    expect(JSON.stringify(nodes)).not.toContain("@type");
    expect(JSON.stringify(nodes)).not.toContain("Any Teacher Education College");
  });
});

// ── 5. One contributor URL claims at most one entity ─────────────────────────

describe("§13/§4.3 a contributor URL asserts one identity or none", () => {
  it("passes a single resolved entity through", async () => {
    const { contributorNodes, soleContributorNode } = await import("@/lib/seo/contributor");
    expect(soleContributorNode(contributorNodes("Jane Doe"))).toEqual({
      "@type": "Person",
      name: "Jane Doe",
    });
  });

  it("asserts NOTHING for a byline that resolves to three editors", async () => {
    const { contributorNodes, soleContributorNode } = await import("@/lib/seo/contributor");
    // The production row, verbatim. It splits perfectly — which is exactly why
    // taking [0] looked correct and published one editor as the whole URL.
    const nodes = contributorNodes(
      "Bert P.M. Creemers, Leonidas Kyriakides, Pam Sammons (Editors)",
    );
    expect(nodes).toHaveLength(3);
    expect(soleContributorNode(nodes)).toBeUndefined();
  });

  it("asserts nothing when the byline resolves to no entity at all", async () => {
    const { soleContributorNode } = await import("@/lib/seo/contributor");
    expect(soleContributorNode([])).toBeUndefined();
  });

  it("both author surfaces go through the rule rather than indexing [0]", () => {
    for (const file of [
      "app/[locale]/(public)/authors/[slug]/page.tsx",
      "app/[locale]/(public)/authors/page.tsx",
    ]) {
      const src = code(readFileSync(join(ROOT, file), "utf8"));
      expect(src, `${file} must use soleContributorNode()`).toContain("soleContributorNode(");
      // `const [x] = contributorNodes(...)` is the destructure that took the
      // first of three. It must not come back.
      expect(
        /const\s*\[\s*\w+\s*\]\s*=\s*(await\s*)?contributorNodes/.test(src),
        `${file} destructures the first contributor node — that is the defect`,
      ).toBe(false);
    }
  });
});
