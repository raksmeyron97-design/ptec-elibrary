// lib/catalogs/author-name.test.ts
//
// Storage keeps the filing form; display reads it out; nothing guesses.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  displayAuthorName,
  statesNameOrder,
  resolveAuthorName,
  nameScript,
} from "./author-name";

describe("a byline that states where its surname ends", () => {
  it("is read out in natural order", () => {
    expect(displayAuthorName("Martin, Ann M.")).toBe("Ann M. Martin");
    expect(displayAuthorName("Hattie, John")).toBe("John Hattie");
    expect(displayAuthorName("Colfer, Eoin")).toBe("Eoin Colfer");
    expect(displayAuthorName("Labbé, Brigitte")).toBe("Brigitte Labbé");
  });

  it("tolerates the spacing a catalogue actually contains", () => {
    expect(displayAuthorName("  Martin ,  Ann  M.  ")).toBe("Ann M. Martin");
  });

  it("says so, for a report that counts repairable rows", () => {
    expect(statesNameOrder("Martin, Ann M.")).toBe(true);
    expect(statesNameOrder("Martin Ann M.")).toBe(false);
  });
});

describe("a byline that does not — left exactly alone", () => {
  // This is the discipline, not a limitation to work around.
  it("never re-orders a comma-less name", () => {
    for (const n of ["Hattie John", "Martin Ann M.", "Colfer Eoin", "John Hattie"]) {
      expect(displayAuthorName(n)).toBe(n);
    }
  });

  it("never re-orders a Khmer name", () => {
    // Khmer is written family-name-first and that IS the natural order.
    // A rule that guessed from word order would corrupt every Khmer byline
    // in the catalogue — 9,567 rows of the import sheets are Khmer.
    for (const n of ["គីម ថែខ្វាន់", "ប្រាជ្ញ វិជ័យ", "សូ ឆវីរត្ន", "អេង វ៉ាត់"]) {
      expect(displayAuthorName(n)).toBe(n);
    }
  });

  it("leaves two commas alone — one person with a suffix, or three people", () => {
    expect(displayAuthorName("Cohen, Louis, Manion, Lawrence")).toBe(
      "Cohen, Louis, Manion, Lawrence",
    );
    expect(displayAuthorName("King, Martin Luther, Jr.")).toBe("King, Martin Luther, Jr.");
  });

  it("does not turn a suffix into a given name", () => {
    expect(displayAuthorName("King, Jr.")).toBe("King, Jr.");
    expect(displayAuthorName("Smith, PhD")).toBe("Smith, PhD");
  });

  it("publishes no half-name from a trailing or leading comma", () => {
    expect(displayAuthorName("Smith,")).toBe("Smith,");
    expect(displayAuthorName(", John")).toBe(", John");
  });

  it("handles absence without inventing anything", () => {
    expect(displayAuthorName(null)).toBe("");
    expect(displayAuthorName(undefined)).toBe("");
    expect(displayAuthorName("   ")).toBe("");
  });
});

// ── The comma means different things in the two scripts ─────────────────────

describe("script decides what the comma means", () => {
  it("classifies the three cases", () => {
    expect(nameScript("Martin, Ann M.")).toBe("latin");
    expect(nameScript("ហង់ជួន, ណារ៉ុន")).toBe("khmer");
    expect(nameScript("Sok, ដារ៉ា")).toBe("mixed");
    expect(nameScript("1234, 5678")).toBe("unknown");
  });

  it("LATIN: reorders, because the natural order is given-first", () => {
    const r = resolveAuthorName("Martin, Ann M.");
    expect(r.display).toBe("Ann M. Martin");
    expect(r.action).toBe("reordered");
    expect(r.flagged).toBe(false);
  });

  it("KHMER: removes the comma and KEEPS the order", () => {
    // Khmer is family-name-first in ordinary use, so the written order is
    // already the natural one. Only the filing comma goes.
    const r = resolveAuthorName("ហង់ជួន, ណារ៉ុន");
    expect(r.display).toBe("ហង់ជួន ណារ៉ុន");
    expect(r.action).toBe("comma-removed");
    expect(r.flagged).toBe(false);
  });

  it("KHMER: the parts are never swapped", () => {
    // The negative control for the rule above: if the Latin branch ever
    // catches Khmer, this is what it would produce.
    expect(displayAuthorName("ហង់ជួន, ណារ៉ុន")).not.toBe("ណារ៉ុន ហង់ជួន");
    expect(displayAuthorName("គីម, ថែខ្វាន់")).toBe("គីម ថែខ្វាន់");
  });

  it("MIXED: left untouched, and flagged", () => {
    const r = resolveAuthorName("Sok, ដារ៉ា");
    expect(r.display).toBe("Sok, ដារ៉ា");
    expect(r.action).toBe("unchanged");
    expect(r.flagged).toBe(true);
    expect(r.reason).toMatch(/mixed/i);
  });

  it("UNKNOWN script: left untouched, and flagged", () => {
    const r = resolveAuthorName("1234, 5678");
    expect(r.action).toBe("unchanged");
    expect(r.flagged).toBe(true);
  });

  it("flags every comma it did not act on, and nothing else", () => {
    const acted = ["Martin, Ann M.", "ហង់ជួន, ណារ៉ុន"];
    const flagged = ["Sok, ដារ៉ា", "Cohen, Louis, Manion, Lawrence", "King, Jr.", "Smith,"];
    // A comma-LESS name is never flagged: 13,359 of those exist in the
    // sheets and a queue containing all of them is not a queue.
    const quiet = ["Hattie John", "គីម ថែខ្វាន់", ""];

    for (const n of acted) expect(resolveAuthorName(n).flagged).toBe(false);
    for (const n of flagged) expect(resolveAuthorName(n).flagged).toBe(true);
    for (const n of quiet) expect(resolveAuthorName(n).flagged).toBe(false);
  });
});

describe("the catalogue page reads the name out, everywhere or nowhere", () => {
  const src = readFileSync(
    join(process.cwd(), "app/[locale]/(public)/catalogs/[slug]/page.tsx"),
    "utf8",
  ).replace(/^\s*import\s[\s\S]*?;\s*$/gm, "");

  it("computes it once and uses that value", () => {
    expect(src).toMatch(/const authorDisplay = displayAuthorName\(b\.author\)/);
  });

  it("emits the Person node from the DISPLAY name, not the stored one", () => {
    // The defect: <Person name="Martin Ann M."> — a claim about a human,
    // in the wrong order, machine-readable.
    expect(src).toMatch(/contributorNodes\(authorDisplay/);
    expect(src).not.toMatch(/contributorNodes\(b\.author/);
  });

  it("leaves no raw b.author on a visible surface", () => {
    // fetchRelated() may still take the stored value — it is a query, not a
    // rendering — so the check is for JSX interpolation and props.
    expect(src).not.toMatch(/\{b\.author\}/);
    expect(src).not.toMatch(/author=\{b\.author\}/);
  });
});

describe("the importer stores the filing form untouched", () => {
  const src = readFileSync(join(process.cwd(), "lib/catalog-import.ts"), "utf8");

  it("never strips a comma out of an author", () => {
    // The comma is the ONLY evidence of which part is the surname. A
    // "cleanup" that removed it is what produced "Martin Ann M." upstream,
    // and it must not happen here too.
    const authorLine = /(?:const|let) author = tidy\(original\.author\);/;
    expect(src).toMatch(authorLine);
    expect(src).not.toMatch(/original\.author[^\n]*replace\([^)]*,[^)]*\)/);
  });
});
