import { describe, it, expect } from "vitest";
import {
  decideRecordWrite,
  isStorablePage,
  normalizeOcrText,
  postProcessOcrPage,
  sampleForHealth,
} from "./text";
import { analyzeTextHealth } from "@/lib/semantic/text-quality";
import { MAX_PAGE_CHARS } from "@/lib/pdf-page-index";

/**
 * Khmer prose long enough for `analyzeTextHealth` to have an opinion — its
 * ratios are noise under 200 characters and it says so by answering "unknown".
 * The sentence is ordinary catalogue language from this collection.
 */
const KHMER_PROSE = "សៀវភៅណែនាំគ្រូបង្រៀន គណិតវិទ្យា ថ្នាក់ទី៣ ក្រសួងអប់រំ យុវជន និងកីឡា វិទ្យាស្ថានជាតិអប់រំ ។ ".repeat(
  6,
);

const LATIN_PROSE =
  "Inclusive education in practice requires that every teacher plan for the whole class rather than for an average learner. ".repeat(
    3,
  );

describe("normalizeOcrText", () => {
  it("removes the form feed tesseract ends every page with", () => {
    expect(normalizeOcrText("page text\u000C")).toBe("page text");
  });

  it("removes NUL, which a text column rejects outright", () => {
    expect(normalizeOcrText("ab\u0000cd")).toBe("ab cd");
  });

  it("keeps paragraph structure but collapses the ladders a scan produces", () => {
    expect(normalizeOcrText("one\n\n\n\n\ntwo")).toBe("one\n\ntwo");
    expect(normalizeOcrText("one\ntwo")).toBe("one\ntwo");
  });

  it("collapses horizontal runs without eating newlines", () => {
    expect(normalizeOcrText("a   \t b \n   c")).toBe("a b\nc");
  });

  it("normalizes line endings to one form", () => {
    expect(normalizeOcrText("a\r\nb\rc")).toBe("a\nb\nc");
  });

  it("strips invisible marks that would break trigram matching", () => {
    expect(normalizeOcrText("a\u200Bb\uFEFFc")).toBe("abc");
  });

  it("composes to NFC so one word has one spelling in the index", () => {
    // Latin, where the two forms are unambiguous: "é" decomposed vs composed.
    expect(normalizeOcrText("e\u0301")).toBe("\u00E9");
  });

  it("survives an empty page without throwing", () => {
    expect(normalizeOcrText("")).toBe("");
    expect(normalizeOcrText("   \n\n  ")).toBe("");
  });
});

describe("postProcessOcrPage", () => {
  it("reconnects Khmer the recognizer emitted with gaps inside a syllable", () => {
    // អ្ ន ក — a coeng separated from the consonant it subscripts, which Khmer
    // orthography makes impossible, so closing that gap is FORCED.
    const result = postProcessOcrPage(`${KHMER_PROSE}អ្ ន ក`);
    expect(result.reassembled).toBe(true);
    expect(result.content).toContain("អ្ន");
  });

  /**
   * The unforced repair stays off, and this is the assertion that pins it.
   *
   * A space between two CONSONANTS may be glyph spacing or a real phrase
   * break, and nothing in the text says which — so the reassembler leaves
   * `អ្ន ក` as it found it rather than guessing at `អ្នក`. A recognizer's
   * spacing is already a guess; layering an unforced repair on top of it is
   * how two guesses become a confident wrong word.
   */
  it("does not close the gap between two consonants, which nothing forces", () => {
    const result = postProcessOcrPage(`${KHMER_PROSE}អ្ ន ក`);
    expect(result.content).toContain("អ្ន ក");
    expect(result.content).not.toContain("អ្នក");
  });

  it("does not claim to have reassembled an English page", () => {
    const result = postProcessOcrPage(LATIN_PROSE);
    expect(result.reassembled).toBe(false);
    expect(result.health.script).toBe("latin");
  });

  it("caps a page at the same limit the pdf.js path uses", () => {
    const result = postProcessOcrPage("x".repeat(MAX_PAGE_CHARS + 500));
    expect(result.content.length).toBe(MAX_PAGE_CHARS);
    expect(result.rawChars).toBe(MAX_PAGE_CHARS + 500);
  });

  it("reports health of the text that would be STORED, not of the raw output", () => {
    const result = postProcessOcrPage(`  ${KHMER_PROSE}  \u000C`);
    expect(result.content.endsWith("\u000C")).toBe(false);
    expect(result.health.length).toBe(result.content.length);
  });

  it("answers `unknown` rather than a verdict on a two-word page", () => {
    expect(postProcessOcrPage("ក្រសួង").health.verdict).toBe("unknown");
  });

  it("handles an empty recognizer result", () => {
    const result = postProcessOcrPage("");
    expect(result.content).toBe("");
    expect(result.reassembled).toBe(false);
  });
});

describe("isStorablePage", () => {
  it("refuses a page carrying nothing but a page number", () => {
    expect(isStorablePage("12")).toBe(false);
    expect(isStorablePage("   ")).toBe(false);
  });

  it("accepts a page with a sentence on it", () => {
    expect(isStorablePage("This page carries an actual sentence of prose.")).toBe(true);
  });
});

describe("sampleForHealth", () => {
  it("judges nothing when there are no pages", () => {
    expect(sampleForHealth([]).verdict).toBe("unknown");
  });

  it("reads the book in page order regardless of the order it was handed", () => {
    const pages = [
      { pageNo: 3, content: "third " + KHMER_PROSE },
      { pageNo: 1, content: "first " + KHMER_PROSE },
    ];
    const health = sampleForHealth(pages, 1);
    expect(health.length).toBeGreaterThan(0);
    // With a sample of one it must have taken page 1, not the array's head.
    expect(analyzeTextHealth("first " + KHMER_PROSE).length).toBe(health.length);
  });

  it("skips the front matter of a long book rather than judging it on a title page", () => {
    const pages = [
      ...[1, 2, 3].map((pageNo) => ({ pageNo, content: "TITLE PAGE" })),
      ...Array.from({ length: 30 }, (_, i) => ({ pageNo: i + 4, content: KHMER_PROSE })),
    ];
    expect(sampleForHealth(pages, 10).script).toBe("khmer");
  });
});

describe("decideRecordWrite — the rule that can destroy text", () => {
  const healthy = analyzeTextHealth(KHMER_PROSE);
  const damaged = analyzeTextHealth("ស ៀវសៅណែនាំប្រតិរតតិ តី ពី ប្ ពះរាជាណាចប្ ររម្ ពុ ជា ".repeat(8));

  it("writes into a record that holds nothing", () => {
    const decision = decideRecordWrite({
      existing: { pages: 0, health: null },
      ocr: { pages: 12, health: healthy },
      force: false,
    });
    expect(decision).toEqual({ write: true, replaces: "nothing" });
  });

  it("never writes an empty OCR result", () => {
    const decision = decideRecordWrite({
      existing: { pages: 0, health: null },
      ocr: { pages: 0, health: analyzeTextHealth("") },
      force: false,
    });
    expect(decision).toEqual({ write: false, code: "OCR_EMPTY" });
  });

  /**
   * A zero exit code from tesseract means the process ran. It says nothing
   * about whether the output is Khmer, and this is the gate that notices.
   */
  it("never writes OCR output the health check calls damaged", () => {
    expect(damaged.verdict).toBe("damaged");
    const decision = decideRecordWrite({
      existing: { pages: 0, health: null },
      ocr: { pages: 40, health: damaged },
      force: false,
    });
    expect(decision).toEqual({ write: false, code: "TEXT_HEALTH_FAILED" });
  });

  it("--force does not permit writing damaged OCR output", () => {
    const decision = decideRecordWrite({
      existing: { pages: 0, health: null },
      ocr: { pages: 40, health: damaged },
      force: true,
    });
    expect(decision).toEqual({ write: false, code: "TEXT_HEALTH_FAILED" });
  });

  it("refuses to replace healthy existing text by default", () => {
    const decision = decideRecordWrite({
      existing: { pages: 300, health: healthy },
      ocr: { pages: 300, health: healthy },
      force: false,
    });
    expect(decision).toEqual({ write: false, code: "EXISTING_TEXT_HEALTHY" });
  });

  it("replaces healthy existing text only when explicitly forced", () => {
    const decision = decideRecordWrite({
      existing: { pages: 300, health: healthy },
      ocr: { pages: 300, health: healthy },
      force: true,
    });
    expect(decision).toEqual({ write: true, replaces: "healthy-text" });
  });

  it("replaces damaged text with no flag needed", () => {
    const decision = decideRecordWrite({
      existing: { pages: 120, health: damaged },
      ocr: { pages: 120, health: healthy },
      force: false,
    });
    expect(decision).toEqual({ write: true, replaces: "damaged-text" });
  });

  /**
   * "Too short to measure" and "measured and broken" are different statements,
   * and the first is exactly what the `low-text-yield` candidate produces — a
   * book of near-empty pages. Reporting it as damage would make the log claim
   * a finding nothing established.
   */
  it("separates text that could not be judged from text judged broken", () => {
    const decision = decideRecordWrite({
      existing: { pages: 120, health: analyzeTextHealth("12") },
      ocr: { pages: 120, health: healthy },
      force: false,
    });
    expect(decision).toEqual({ write: true, replaces: "unjudged-text" });
  });
});
