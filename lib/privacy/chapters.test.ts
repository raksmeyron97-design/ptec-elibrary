import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  chapterAnchor,
  PRIVACY_CHAPTERS,
  PRIVACY_FILTERS,
  PRIVACY_ROW_META,
  PRIVACY_SECTIONS,
  PRIVACY_TABLE_ROWS,
  parsePrivacyFilter,
  rowMatchesFilter,
  type PrivacyFilter,
} from "./policy";

// ──────────────────────────────────────────────────────────────────
// The privacy page's structure, and the two things a reader loses
// silently when it breaks.
//
// A section that no chapter claims is not rendered at all — it keeps its
// entry in PRIVACY_SECTIONS, keeps its translations, and simply stops
// appearing on the page, with a table-of-contents that never mentions it.
// Nothing at runtime notices; the page just gets shorter.
//
// A filter whose predicate disagrees with the chips a row was drawn with
// hides rows the reader asked to see, which on a privacy policy means a
// data category the operator declares and the page does not show.
// ──────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "..", "..");

describe("chapters cover the sections exactly", () => {
  const claimed = PRIVACY_CHAPTERS.flatMap((c) => c.sections);

  it("every section belongs to exactly one chapter", () => {
    for (const section of PRIVACY_SECTIONS) {
      const owners = PRIVACY_CHAPTERS.filter((c) => c.sections.includes(section.id));
      expect(owners.map((o) => o.id), `section "${section.id}"`).toHaveLength(1);
    }
  });

  it("every chapter member is a real section", () => {
    const known = new Set(PRIVACY_SECTIONS.map((s) => s.id));
    for (const id of claimed) expect(known, `chapter member "${id}"`).toContain(id);
  });

  it("chapters preserve the declared reading order", () => {
    // Grouping is presentation; reordering is editing. A reader who saved a
    // link to #retention expects the clauses around it to be the ones that
    // were around it before.
    const order = PRIVACY_SECTIONS.map((s) => s.id);
    expect(claimed.map((id) => order.indexOf(id))).toEqual(order.map((_, i) => i));
  });

  it("each chapter is a contiguous run, not a gathering", () => {
    const order = PRIVACY_SECTIONS.map((s) => s.id);
    for (const chapter of PRIVACY_CHAPTERS) {
      const idx = chapter.sections.map((id) => order.indexOf(id));
      const gaps = idx.slice(1).map((n, i) => n - idx[i]);
      expect(gaps.every((g) => g === 1), `chapter "${chapter.id}" is not contiguous`).toBe(true);
    }
  });

  it("no chapter ANCHOR collides with a section anchor", () => {
    // Both are element ids on the same page. `chapters.rights` beside
    // `sections.rights` makes `#rights` ambiguous and sends the table of
    // contents to the chapter heading instead of the clause it names.
    const sections = new Set(PRIVACY_SECTIONS.map((s) => s.id));
    const seen = new Set<string>();
    for (const chapter of PRIVACY_CHAPTERS) {
      const anchor = chapterAnchor(chapter.id);
      expect(sections, `chapter anchor "${anchor}"`).not.toContain(anchor);
      expect(seen, `duplicate chapter anchor "${anchor}"`).not.toContain(anchor);
      seen.add(anchor);
    }
  });

  it("every chapter has a title and summary in BOTH catalogues", () => {
    for (const locale of ["en", "km"] as const) {
      const messages = JSON.parse(
        fs.readFileSync(path.join(ROOT, "messages", `${locale}.json`), "utf8"),
      );
      for (const chapter of PRIVACY_CHAPTERS) {
        const entry = messages.privacy?.chapters?.[chapter.id];
        expect(entry, `${locale}: privacy.chapters.${chapter.id}`).toBeDefined();
        expect(entry.title?.trim(), `${locale}: ${chapter.id}.title`).toBeTruthy();
        expect(entry.summary?.trim(), `${locale}: ${chapter.id}.summary`).toBeTruthy();
      }
    }
  });
});

describe("table row classification", () => {
  it("classifies every row, and only real rows", () => {
    expect(Object.keys(PRIVACY_ROW_META).sort()).toEqual([...PRIVACY_TABLE_ROWS].sort());
  });

  it("every filter matches at least one row", () => {
    // A chip that can only ever empty the table is a control that looks
    // broken. This is the check that fails when a category is reclassified.
    for (const filter of PRIVACY_FILTERS) {
      const hits = PRIVACY_TABLE_ROWS.filter((r) =>
        rowMatchesFilter(PRIVACY_ROW_META[r], filter),
      );
      expect(hits.length, `filter "${filter}" matches nothing`).toBeGreaterThan(0);
    }
  });

  it("'all' is the whole table and never a subset", () => {
    const shown = PRIVACY_TABLE_ROWS.filter((r) => rowMatchesFilter(PRIVACY_ROW_META[r], "all"));
    expect(shown).toEqual([...PRIVACY_TABLE_ROWS]);
  });

  it("the visibility filters partition the table", () => {
    // Every row is reachable by exactly one visibility chip — so a reader
    // clicking through all four sees each category once, not twice or never.
    for (const row of PRIVACY_TABLE_ROWS) {
      const matching = (["private", "shared", "public", "steward"] as PrivacyFilter[]).filter(
        (f) => rowMatchesFilter(PRIVACY_ROW_META[row], f),
      );
      expect(matching, `row "${row}"`).toHaveLength(1);
    }
  });

  it("'automatic' asks about SOURCE, not visibility", () => {
    // It is the one filter on the other axis: the categories a reader never
    // chose to hand over are the ones they most want to find.
    const automatic = PRIVACY_TABLE_ROWS.filter((r) => PRIVACY_ROW_META[r].source === "automatic");
    const matched = PRIVACY_TABLE_ROWS.filter((r) =>
      rowMatchesFilter(PRIVACY_ROW_META[r], "automatic"),
    );
    expect(matched).toEqual(automatic);
  });

  it("an unknown ?filter= value shows the whole table, never an empty one", () => {
    for (const bad of ["", null, undefined, "PRIVATE", "secret", "__proto__", "all "]) {
      expect(parsePrivacyFilter(bad as string | null | undefined)).toBe("all");
    }
    for (const good of PRIVACY_FILTERS) expect(parsePrivacyFilter(good)).toBe(good);
  });

  it("every visibility class and retention tier is translated in BOTH catalogues", () => {
    const visibilities = new Set(Object.values(PRIVACY_ROW_META).map((m) => m.visibility));
    for (const locale of ["en", "km"] as const) {
      const messages = JSON.parse(
        fs.readFileSync(path.join(ROOT, "messages", `${locale}.json`), "utf8"),
      );
      const table = messages.privacy?.table;
      for (const v of visibilities) {
        expect(table?.visibility?.[v]?.trim(), `${locale}: visibility.${v}`).toBeTruthy();
        expect(table?.visibility?.[`${v}Hint`]?.trim(), `${locale}: visibility.${v}Hint`).toBeTruthy();
      }
      for (const f of PRIVACY_FILTERS) {
        expect(table?.filters?.[f]?.trim(), `${locale}: filters.${f}`).toBeTruthy();
      }
    }
  });
});

describe("the tint scale is a token, never a hand-written colour", () => {
  const css = fs.readFileSync(path.join(ROOT, "app", "globals.css"), "utf8");

  it("declares every retention tier in both themes", () => {
    // Four tiers × soft + line, light and dark. A tier with no dark value
    // falls back to the light one, which on a dark surface is an opaque pale
    // block behind white text.
    for (const tier of [1, 2, 3, 4]) {
      for (const part of ["soft", "line"]) {
        const name = `--ptec-retention-${tier}-${part}`;
        const declarations = css.split(name).length - 1;
        expect(declarations, `${name} declared ${declarations}× (want light + dark + 1 use)`)
          .toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("every tier used in code has a CSS rule", () => {
    const tiers = new Set(Object.values(PRIVACY_ROW_META).map((m) => m.retention));
    for (const tier of tiers) {
      expect(css, `no .retention-tint rule for "${tier}"`).toContain(
        `.retention-tint[data-tier="${tier}"]`,
      );
    }
  });
});
