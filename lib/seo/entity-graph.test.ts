// lib/seo/entity-graph.test.ts
//
// SEO V3 invariants for the institutional entity graph.
//
// These exist because the defect they pin was invisible to every other test:
// the JSON-LD was well-formed, the page returned 200, each builder's own unit
// test passed — and the rendered document still described PTEC twice, with two
// different URLs and no `@id` to merge them by. It shipped and was live on
// every resource page. See docs/SEO-V3-AUDIT.md D-2.
//
// Two of these read source files rather than call functions, in the same
// spirit as lib/cache/cache-safety.test.ts: the rule is "no OTHER module may
// declare this entity", and only a scan can assert that.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { LIBRARY_ID, ORGANIZATION_ID, WEBSITE_ID, ref } from "@/lib/seo/entity-ids";
import { libraryNode, organizationNode } from "@/lib/seo/org-nodes";
import { SITE_URL } from "@/lib/seo/site";
import type { OrgIdentity } from "@/lib/system-settings/org-identity";

const ROOT = process.cwd();

const org: OrgIdentity = {
  institutionName: "Phnom Penh Teacher Education College",
  institutionNameKm: "វិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ",
  abbreviation: "PTEC",
  libraryName: "PTEC Library",
  libraryNameKm: "បណ្ណាល័យ វ.គ.ភ",
  siteName: "PTEC Library",
  contactEmail: "info@ptec.edu.kh",
  url: SITE_URL,
  institutionUrl: "https://www.ptec.edu.kh",
};

describe("entity @id anchors", () => {
  it("are absolute, origin-correct and distinct", () => {
    for (const id of [ORGANIZATION_ID, LIBRARY_ID, WEBSITE_ID]) {
      expect(id.startsWith(`${SITE_URL}/#`)).toBe(true);
    }
    expect(new Set([ORGANIZATION_ID, LIBRARY_ID, WEBSITE_ID]).size).toBe(3);
  });

  it("keep the historic `/#fragment` form — an @id IS the entity's identity", () => {
    // Changing these strings re-identifies the entity to every consumer that
    // has already seen them. They are not cosmetic.
    expect(ORGANIZATION_ID).toBe(`${SITE_URL}/#organization`);
    expect(LIBRARY_ID).toBe(`${SITE_URL}/#library`);
    expect(WEBSITE_ID).toBe(`${SITE_URL}/#website`);
  });
});

describe("organizationNode", () => {
  it("carries the institution's OWN url, never the library origin", () => {
    const node = organizationNode(org);
    expect(node.url).toBe("https://www.ptec.edu.kh");
    expect(node.url).not.toBe(SITE_URL);
  });

  it("is anchored to the shared organization @id", () => {
    expect(organizationNode(org)["@id"]).toBe(ORGANIZATION_ID);
  });

  it("uses the published institution name", () => {
    expect(organizationNode(org).name).toBe("Phnom Penh Teacher Education College");
  });
});

describe("libraryNode", () => {
  it("is anchored to the shared library @id and uses the library origin", () => {
    const node = libraryNode(org);
    expect(node["@id"]).toBe(LIBRARY_ID);
    expect(node.url).toBe(SITE_URL);
  });

  it("references the institution instead of re-declaring it", () => {
    const parent = libraryNode(org).parentOrganization as Record<string, unknown>;
    // A bare reference: exactly one key, the @id. Any additional field here is
    // a second declaration of the institution and can contradict the real node.
    expect(parent).toEqual(ref(ORGANIZATION_ID));
    expect(Object.keys(parent)).toEqual(["@id"]);
  });

  it("never emits an EducationalOrganization node of its own", () => {
    expect(JSON.stringify(libraryNode(org))).not.toContain("EducationalOrganization");
  });
});

// ── Source scans ────────────────────────────────────────────────────────────

/**
 * Source with comments removed. Documentation that QUOTES the defective JSON —
 * this file, entity-ids.ts, org-nodes.ts — must not register as a declaration
 * of it, or the rule becomes unwritable without tripping itself.
 */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const SOURCE_DIRS = ["app", "components", "lib"].map((d) => join(ROOT, d));
const sourceFiles = SOURCE_DIRS.flatMap((d) => walk(d));

describe("only one module may declare the institution", () => {
  it('no file outside RootShell/org-nodes emits an "EducationalOrganization" node', () => {
    // RootShell declares the real node. org-nodes builds the reference to it.
    // Anything else re-declaring it is how D-2 happened.
    const allowed = new Set([
      join(ROOT, "components/layout/RootShell.tsx"),
      join(ROOT, "lib/seo/org-nodes.ts"),
    ]);
    const offenders = sourceFiles.filter(
      (f) => !allowed.has(f) && code(f).includes('"EducationalOrganization"'),
    );
    expect(offenders.map((f) => f.slice(ROOT.length + 1))).toEqual([]);
  });

  it('no file outside RootShell/org-nodes emits a bare "Library" schema node', () => {
    const allowed = new Set([
      join(ROOT, "components/layout/RootShell.tsx"),
      join(ROOT, "lib/seo/org-nodes.ts"),
    ]);
    const offenders = sourceFiles.filter(
      (f) => !allowed.has(f) && /"@type":\s*"Library"/.test(code(f)),
    );
    expect(offenders.map((f) => f.slice(ROOT.length + 1))).toEqual([]);
  });

  it("RootShell builds its @id anchors from lib/seo/entity-ids, not inline literals", () => {
    const src = readFileSync(join(ROOT, "components/layout/RootShell.tsx"), "utf8");
    expect(src).toContain('from "@/lib/seo/entity-ids"');
    // The inline template form is what let org-nodes.ts have no way to
    // reference these anchors, which is why it duplicated the nodes instead.
    expect(src).not.toContain("${SITE_URL}/#organization");
    expect(src).not.toContain("${SITE_URL}/#library");
    expect(src).not.toContain("${SITE_URL}/#website");
  });
});
