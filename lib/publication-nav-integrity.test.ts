import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ARTICLE_SECTIONS } from "@/lib/publications/article-layout";

// ──────────────────────────────────────────────────────────────────────────
// A jump link that lands on nothing is worse than no jump link.
//
// The publication detail page previously listed eleven section anchors while
// several of the sections behind them rendered a heading and no content —
// Learning Outcomes, FAQ, and a "Research Areas & Keywords" block that was
// empty even on a record carrying fifteen keywords.
//
// The structural fix is that the nav and the sections are built from ONE set
// of booleans (`has`), so neither can be edited without the other. This test
// reads the page source and enforces exactly that, because the failure it
// guards against is invisible to a render test on a record that happens to
// have every field populated.
//
// When this fails, the fix is in the page, not in the test: either gate the
// new section on a `has.*` key, or stop advertising it in the nav.
//
// Since the article redesign the nav list itself is derived by
// articleSections() (lib/publications/article-layout.ts, unit-tested); this
// file enforces the page's half — that the derivation is the only source, and
// that every section it can list is gated in the markup by the same key.
// ──────────────────────────────────────────────────────────────────────────

const PAGE = path.resolve(
  __dirname,
  "..",
  "app",
  "[locale]",
  "(public)",
  "journals",
  "articles",
  "[slug]",
  "page.tsx",
);
const SRC = fs.readFileSync(PAGE, "utf8");

/** Keys declared on the `const has = { … }` content-gate object. */
function gateKeys(): string[] {
  // The object may carry a type annotation (`const has: ArticleSectionFlags = {`).
  const match = /const has(?::\s*\w+)?\s*=\s*\{/.exec(SRC);
  expect(match, "the `has` content-gate object is gone").not.toBeNull();
  const open = match!.index + match![0].length - 1;
  let depth = 0;
  let end = open;
  for (let i = open; i < SRC.length; i++) {
    if (SRC[i] === "{") depth++;
    else if (SRC[i] === "}" && --depth === 0) {
      end = i;
      break;
    }
  }
  const block = SRC.slice(open + 1, end);
  return [...block.matchAll(/^\s{4}(\w+)\s*:/gm)].map((m) => m[1]);
}

/** The markup for section `id` is guarded by `has.<id>` (`&&` or a ternary). */
function gatedMarkup(id: string): boolean {
  return SRC.includes(`{has.${id} && (`) || SRC.includes(`{has.${id} ? (`);
}

// The nav is no longer a hand-written array next to the markup. It is
// `articleSections(has, labels)` (lib/publications/article-layout.ts), which
// lists ARTICLE_SECTIONS filtered by the SAME `has` object — so an entry
// cannot exist without its flag, and the order is fixed in one place. What is
// left to enforce here is that the page feeds the nav from that function and
// nothing else, and that every section it can list is gated in the markup.
describe("publication detail: section nav integrity", () => {
  const gates = gateKeys();

  it("declares content gates and builds the nav from them", () => {
    expect(gates.length).toBeGreaterThan(0);
    expect(SRC, "the nav must be derived from `has` via articleSections()").toContain("articleSections(has, {");
    // Every "On this page" instance is handed that derived list, never a literal.
    const navProps = [...SRC.matchAll(/<ArticleSectionNav\s+sections=\{(\w+)\}/g)].map((m) => m[1]);
    expect(navProps.length).toBeGreaterThan(0);
    expect(new Set(navProps)).toEqual(new Set(["sections"]));
    expect(SRC).toMatch(/const sections = articleSections\(has, \{/);
  });

  it("gates every section the nav can list on a content check", () => {
    const ungated = ARTICLE_SECTIONS.filter((id) => !gates.includes(id));
    expect(
      ungated,
      `sections the nav can advertise with no content gate — they would land on an empty region: ${ungated.join(", ")}`,
    ).toEqual([]);
  });

  it("renders a matching element id for every section the nav can list", () => {
    for (const id of ARTICLE_SECTIONS) {
      expect(SRC.includes(`id="${id}"`), `nav can offer "#${id}" but no element in the page carries that id`).toBe(true);
    }
  });

  it("guards every section's markup with the same boolean as its nav entry", () => {
    for (const id of ARTICLE_SECTIONS) {
      expect(
        gatedMarkup(id),
        `has.${id} gates the "${id}" nav entry but not its markup — the anchor could resolve to an empty region`,
      ).toBe(true);
    }
  });

  it("uses every declared gate — a dead gate means a section silently vanished", () => {
    for (const key of gates) {
      expect(SRC.includes(`has.${key}`), `has.${key} is declared but never read`).toBe(true);
    }
  });

  it("no longer advertises the sections that rendered empty headings", () => {
    // "overview" was a second name for the abstract; keywords/outcomes/FAQ
    // are conditional.
    expect(ARTICLE_SECTIONS as readonly string[]).not.toContain("overview");
    expect(SRC).not.toContain('id="overview"');
  });
});
