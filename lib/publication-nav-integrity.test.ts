import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

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
// ──────────────────────────────────────────────────────────────────────────

const PAGE = path.resolve(
  __dirname,
  "..",
  "app",
  "[locale]",
  "(public)",
  "publications",
  "[slug]",
  "page.tsx",
);
const SRC = fs.readFileSync(PAGE, "utf8");

/** Keys declared on the `const has = { … }` content-gate object. */
function gateKeys(): string[] {
  const start = SRC.indexOf("const has = {");
  expect(start, "the `has` content-gate object is gone").toBeGreaterThan(-1);
  const open = SRC.indexOf("{", start);
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

/** Entries of the `const sections: QuickNavSection[] = [ … ]` array. */
function navEntries(): { id: string; gated: boolean; tracked: boolean }[] {
  const decl = "const sections: QuickNavSection[] = [";
  const start = SRC.indexOf(decl);
  expect(start, "the sections array is gone").toBeGreaterThan(-1);
  // Anchor on the array's own bracket, not the one in `QuickNavSection[]`.
  const open = start + decl.length - 1;
  let depth = 0;
  let end = open;
  for (let i = open; i < SRC.length; i++) {
    if (SRC[i] === "[") depth++;
    else if (SRC[i] === "]" && --depth === 0) {
      end = i;
      break;
    }
  }
  const block = SRC.slice(open + 1, end);

  return block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes('id: "'))
    .map((line) => ({
      id: /id: "([^"]+)"/.exec(line)![1],
      gated: line.startsWith("...(has."),
      tracked: !line.includes("track: false"),
    }));
}

describe("publication detail: section nav integrity", () => {
  const gates = gateKeys();
  const entries = navEntries();

  it("declares content gates and nav entries at all", () => {
    expect(gates.length).toBeGreaterThan(0);
    expect(entries.length).toBeGreaterThan(0);
  });

  it("gates every scroll-tracked nav entry on a content check", () => {
    // `track: false` entries point into the sticky rail, which always renders.
    const ungated = entries.filter((e) => e.tracked && !e.gated).map((e) => e.id);
    expect(
      ungated,
      `nav entries advertised unconditionally — they will land on an empty section when the record has no such content: ${ungated.join(", ")}`,
    ).toEqual([]);
  });

  it("renders a matching <section id> for every nav entry", () => {
    for (const entry of entries) {
      expect(
        SRC.includes(`id="${entry.id}"`) ||
          // Rail targets live in the sidebar component, not this file.
          !entry.tracked,
        `nav offers "#${entry.id}" but no element in the page carries that id`,
      ).toBe(true);
    }
  });

  it("guards every gated section's markup with the same boolean as its nav entry", () => {
    for (const entry of entries.filter((e) => e.gated)) {
      const key = new RegExp(`\\.\\.\\.\\(has\\.(\\w+) \\? \\[\\{ id: "${entry.id}"`).exec(SRC);
      expect(key, `nav entry "${entry.id}" is not gated by a has.* key`).not.toBeNull();
      expect(
        SRC.includes(`{has.${key![1]} && (`),
        `has.${key![1]} gates the "${entry.id}" nav entry but nothing in the markup — the anchor would resolve to an empty region`,
      ).toBe(true);
    }
  });

  it("uses every declared gate — a dead gate means a section silently vanished", () => {
    for (const key of gates) {
      expect(
        SRC.includes(`has.${key}`),
        `has.${key} is declared but never read`,
      ).toBe(true);
    }
  });

  it("no longer advertises the sections that rendered empty headings", () => {
    // "overview" was a second name for the abstract; keywords/outcomes/FAQ
    // are now conditional or moved to the rail.
    expect(entries.map((e) => e.id)).not.toContain("overview");
    expect(SRC).not.toContain('id="overview"');
  });
});
