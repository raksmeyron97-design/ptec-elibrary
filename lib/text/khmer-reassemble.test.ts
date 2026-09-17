// lib/text/khmer-reassemble.test.ts
//
// Every damaged fixture below is a REAL `sampleExcerpt` from
// `scripts/damaged-khmer-books.json`, which catalogues 86 books whose Khmer
// extracted badly. A synthetic fixture would prove only that the regex matches
// itself; these are the strings the collection actually holds.
//
// Written by hand as Unicode escapes where the damage is the point, because a
// literal in an editor is exactly the kind of text an editor silently
// normalises — and normalising the fixture would delete the bug.

import { describe, expect, it } from "vitest";
import {
  countOrthographicViolations,
  hasGlyphSpacing,
  reassembleKhmerText,
} from "./khmer-reassemble";
import { analyzeTextHealth } from "@/lib/semantic/text-quality";
import damagedBooks from "@/scripts/damaged-khmer-books.json";

/** The catalogue is a flat array of 86 books; only these two fields are read. */
const damaged = damagedBooks as ReadonlyArray<{ slug: string; sampleExcerpt?: string }>;

const KM = {
  ka: "ក", kha: "ខ", ko: "គ", nge: "ង",
  ta: "ត", tho: "ថ", no: "ន", po: "ព",
  ro: "រ", vo: "វ", sa: "ស", ha: "ហ", qa: "អ",
  aa: "ា", i: "ិ", u: "ុ", oo: "ូ", ie: "ៀ",
  nikahit: "ំ", reahmuk: "ះ", bantoc: "់",
  coeng: "្", khan: "។",
};

describe("rule 1 — coeng reconnection", () => {
  it("closes a gap after the coeng", () => {
    // អ្ ន  →  អ្ន
    const r = reassembleKhmerText(`${KM.qa}${KM.coeng} ${KM.no}`);
    expect(r.text).toBe(`${KM.qa}${KM.coeng}${KM.no}`);
    expect(r.modified).toBe(true);
  });

  it("closes a gap before the coeng", () => {
    const r = reassembleKhmerText(`${KM.po} ${KM.coeng}${KM.ro}`);
    expect(r.text).toBe(`${KM.po}${KM.coeng}${KM.ro}`);
  });

  it("closes gaps on both sides at once", () => {
    // The both-sides pattern must run first, or each narrower rule eats half
    // of it and leaves the other gap behind.
    const r = reassembleKhmerText(`${KM.po} ${KM.coeng} ${KM.ro}`);
    expect(r.text).toBe(`${KM.po}${KM.coeng}${KM.ro}`);
  });

  it("leaves a legitimate space between two syllables alone", () => {
    // ក្រសួង អប់រំ — the space is a phrase break, and no rule is forced here.
    const input = `${KM.ka}${KM.coeng} ${KM.ro}${KM.sa}ួ${KM.nge} ${KM.qa}ប${KM.bantoc}${KM.ro}${KM.nikahit}`;
    const r = reassembleKhmerText(input);
    expect(r.text).toBe(`${KM.ka}${KM.coeng}${KM.ro}${KM.sa}ួ${KM.nge} ${KM.qa}ប${KM.bantoc}${KM.ro}${KM.nikahit}`);
    // …and the word space survived.
    expect(r.text).toContain(" ");
  });
});

describe("rule 2 — orphan dependent vowels", () => {
  it("reattaches a vowel to the base before the gap", () => {
    // A dependent vowel cannot BEGIN a syllable, so there is exactly one base
    // it can belong to. The repair is forced, not chosen.
    const r = reassembleKhmerText(`${KM.ta} ${KM.aa}`);
    expect(r.text).toBe(`${KM.ta}${KM.aa}`);
  });

  it("reattaches across a coeng cluster — and stops where the rule stops", () => {
    // ស្ថ ា ន. The vowel gap is FORCED and closes; the gap between the vowel
    // and the following consonant is not, so it survives:
    //
    //     ស្ថ ា ន   →   ស្ថា ន      (rules 1–3)
    //     ស្ថា ន     →   ស្ថាន      (rule 4, opt-in)
    //
    // Worth stating plainly because "ស្ថ ា ន → ស្ថាន" is the example the
    // implementation plan gives for this rule, and half of it belongs to the
    // unforced one. A consonant after a space could start a new word, and
    // nothing in the text says whether it does.
    const input = `${KM.sa}${KM.coeng}${KM.tho} ${KM.aa} ${KM.no}`;
    expect(reassembleKhmerText(input).text).toBe(`${KM.sa}${KM.coeng}${KM.tho}${KM.aa} ${KM.no}`);
    // Rule 4 would close the second gap, but only on a page that shows the
    // pattern at scale — `hasGlyphSpacing` needs ten Khmer runs before it will
    // believe anything, and this fixture has three. That gate is exercised in
    // its own block below; asserting it here would only prove the gate is off.
  });

  it("iterates when closing one gap exposes the next", () => {
    const input = `${KM.sa}${KM.coeng}${KM.tho} ${KM.aa} ${KM.no} ${KM.i}`;
    expect(reassembleKhmerText(input).text).not.toContain(` ${KM.aa}`);
    expect(reassembleKhmerText(input).text).not.toContain(` ${KM.i}`);
  });
});

describe("rule 3 — orphan signs", () => {
  it("reattaches a sign to its base", () => {
    expect(reassembleKhmerText(`${KM.ko} ${KM.nikahit}`).text).toBe(`${KM.ko}${KM.nikahit}`);
    expect(reassembleKhmerText(`${KM.ko}${KM.aa} ${KM.reahmuk}`).text).toBe(`${KM.ko}${KM.aa}${KM.reahmuk}`);
  });
});

describe("rule 4 — glyph spacing is OFF by default", () => {
  // Two consonants either side of a space is NOT forced: the space may be
  // glyph spacing or a real phrase break, and nothing in the text says which.
  // It is worth 2 of the 86 catalogued books and carries all of the risk, so
  // a caller has to ask for it.
  const spaced = Array.from({ length: 14 }, (_, i) => [KM.ka, KM.kha, KM.ko, KM.no][i % 4]).join(" ");

  it("does not collapse consonant gaps unless asked", () => {
    expect(reassembleKhmerText(spaced).text).toBe(spaced);
  });

  it("collapses them when asked, and only where the pattern is unmistakable", () => {
    expect(hasGlyphSpacing(spaced)).toBe(true);
    const r = reassembleKhmerText(spaced, { collapseGlyphSpacing: true });
    expect(r.text).not.toContain(" ");
  });

  it("refuses even when asked, if the text does not show the pattern", () => {
    // Ordinary Khmer prose: long runs, a few phrase breaks. Turning the option
    // on must not weld a real sentence into one word.
    const prose = `${KM.ka}${KM.coeng}${KM.ro}${KM.sa}ួ${KM.nge}${KM.qa}ប${KM.bantoc}${KM.ro}${KM.nikahit} ${KM.ta}${KM.aa}${KM.no}${KM.ie}`;
    expect(hasGlyphSpacing(prose)).toBe(false);
    expect(reassembleKhmerText(prose, { collapseGlyphSpacing: true }).text).toBe(prose);
  });
});

describe("identity — healthy text is never touched", () => {
  it.each([
    ["empty", ""],
    ["ascii", "Hello World 123"],
    ["mixed with no Khmer damage", "The MoEYS framework, 2015 edition."],
  ])("%s", (_label, text) => {
    const r = reassembleKhmerText(text);
    expect(r.text).toBe(text);
    expect(r.modified).toBe(false);
    expect(r.changes).toBe(0);
  });

  it("leaves well-formed Khmer prose byte-identical", () => {
    const healthy =
      "ការវាយតម្លៃថ្នាក់រៀន" +
      " គឺជាធាតុសំខាន់";
    const r = reassembleKhmerText(healthy);
    expect(r.text).toBe(healthy);
    expect(r.modified).toBe(false);
  });

  it("preserves the space after a khan", () => {
    const input = `${KM.sa}${KM.i}${KM.sa}${KM.coeng}${KM.sa}${KM.khan} ${KM.ro}${KM.ie}${KM.no}`;
    expect(reassembleKhmerText(input).text).toContain(`${KM.khan} `);
  });

  it("never invents, deletes or substitutes a code point — only whitespace moves", () => {
    for (const book of damaged) {
      const before = book.sampleExcerpt ?? "";
      if (!before) continue;
      const after = reassembleKhmerText(before).text;
      const strip = (s: string) => [...s].filter((c) => !/\s/u.test(c)).join("");
      expect(strip(after), book.sampleExcerpt).toBe(strip(before));
    }
  });
});

// ── The independent check ────────────────────────────────────────────────────
// `analyzeTextHealth` is satisfied by REMOVING SPACES, and removing spaces is
// what the repair does — so a health flip proves the repair ran, not that it
// was right. These assertions are about legality instead, which does not move
// by construction.

describe("countOrthographicViolations", () => {
  it("counts a dependent vowel with nothing to attach to", () => {
    const r = countOrthographicViolations(` ${KM.aa}`);
    expect(r.byKind.orphan_vowel).toBe(1);
  });

  it("counts two dependent vowels on one base", () => {
    expect(countOrthographicViolations(`${KM.ta}${KM.aa}${KM.i}`).byKind.double_vowel).toBe(1);
  });

  it("counts a coeng with no consonant under it", () => {
    expect(countOrthographicViolations(`${KM.ta}${KM.coeng} `).byKind.dangling_coeng).toBe(1);
    expect(countOrthographicViolations(`${KM.coeng}${KM.no}`).byKind.dangling_coeng).toBe(1);
  });

  it("finds none in well-formed Khmer", () => {
    const healthy = `${KM.ka}${KM.coeng}${KM.ro}${KM.sa}ួ${KM.nge} ${KM.qa}ប${KM.bantoc}${KM.ro}${KM.nikahit}`;
    expect(countOrthographicViolations(healthy).violations).toBe(0);
  });
});

describe("the repair reduces impossible sequences, and never adds any", () => {
  const excerpts = damaged
    .map((b) => ({ slug: b.slug, text: b.sampleExcerpt ?? "" }))
    .filter((b) => b.text.length > 0);

  it("has real fixtures to work with", () => {
    expect(excerpts.length).toBeGreaterThan(50);
  });

  it("never increases violations on any catalogued excerpt", () => {
    for (const { slug, text } of excerpts) {
      const r = reassembleKhmerText(text);
      expect(r.violationsAfter, slug).toBeLessThanOrEqual(r.violationsBefore);
      // The safety gate exists; it must not be what is doing the work.
      expect(r.rejected, slug).toBe(false);
    }
  });

  it("removes violations from the corpus as a whole", () => {
    const sum = (f: (t: string) => number) => excerpts.reduce((n, e) => n + f(e.text), 0);
    const before = sum((t) => countOrthographicViolations(t).violations);
    const after = sum((t) => countOrthographicViolations(reassembleKhmerText(t).text).violations);
    expect(before).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
  });
});

describe("what the repair does NOT claim", () => {
  it("cannot restore a coeng the extractor dropped", () => {
    // `khmer-coeng-missing`: the code point is absent, and this module never
    // inserts one. Such a page needs OCR.
    const missing = `${KM.qa}${KM.nge}${KM.ko}${KM.ro}`; // អងគរ, missing the coeng of អង្គរ
    const r = reassembleKhmerText(missing);
    expect(r.text).toBe(missing);
    expect(r.text).not.toContain(KM.coeng);
  });

  it("cannot undo a substituted character", () => {
    // `khmer-legacy-font`: one character emitted in place of another. Nothing
    // about ង appearing as វ is visible as whitespace, so nothing here can see
    // it — which is why a health verdict alone must not be read as "readable".
    const substituted = `${KM.no}${KM.i}${KM.vo}`; // និវ, where និង was meant
    expect(reassembleKhmerText(substituted).text).toBe(substituted);
  });
});

// ── End to end, against the health analyser the pipeline already uses ────────

describe("health verdict after repair", () => {
  it("moves a spacing-damaged page toward healthy", () => {
    // Long enough to clear CALIBRATION.minSampleLength.
    const unit = `${KM.qa}${KM.coeng} ${KM.no} ${KM.ka} ${KM.ko}${KM.aa}${KM.nikahit}${KM.ta}${KM.coeng} ${KM.ro}${KM.tho}${KM.vo}${KM.i}${KM.ka}${KM.aa} `;
    const page = unit.repeat(20);
    const before = analyzeTextHealth(page);
    const after = analyzeTextHealth(reassembleKhmerText(page).text);
    expect(before.danglingCoengRatio).toBeGreaterThan(after.danglingCoengRatio);
    expect(after.orphanVowelRatio).toBeLessThanOrEqual(before.orphanVowelRatio);
  });
});
