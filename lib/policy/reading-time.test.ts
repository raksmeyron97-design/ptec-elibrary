import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { readingTime } from "./reading-time";

// ──────────────────────────────────────────────────────────────────
// The badge says how long a document takes to read. It is wrong in a way
// nobody notices if it is a word count, because Khmer has no spaces:
// `text.split(/\s+/)` returns ONE word for an entire Khmer policy, so the
// Khmer reader is told "1 min" for the same document the English reader
// is told takes nine — and told it precisely because their language was
// not handled.
// ──────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "..", "..");

const read = (locale: "en" | "km") =>
  JSON.parse(fs.readFileSync(path.join(ROOT, "messages", `${locale}.json`), "utf8"));

describe("counting", () => {
  it("counts Latin by word", () => {
    expect(readingTime("one two three four five").latinWords).toBe(5);
  });

  it("counts Khmer by character, and never as one enormous word", () => {
    const khmer = "ព័ត៌មានដែលយើងប្រមូល";
    const r = readingTime(khmer);
    expect(r.latinWords).toBe(0);
    expect(r.khmerChars).toBeGreaterThan(8);
  });

  it("counts a mixed run by both rules, with nothing counted twice", () => {
    const mixed = "ធនធានឌីជីថល Supabase and Google";
    const r = readingTime(mixed);
    // The three Latin words are found even though no space separates them
    // from the Khmer run that precedes them.
    expect(r.latinWords).toBe(3);
    expect(r.khmerChars).toBeGreaterThan(0);
  });

  it("does not count combining marks as reading effort", () => {
    // A subscript consonant is read as part of its syllable, not as another
    // character. Counting them inflates Khmer by roughly a quarter.
    const withMarks = readingTime("ស្រ").khmerChars;
    const bare = readingTime("សរ").khmerChars;
    expect(withMarks).toBeLessThan(bare + 1);
  });

  it("ignores punctuation and whitespace", () => {
    expect(readingTime("  ,  —  ;  ").latinWords).toBe(0);
    expect(readingTime("   ").minutes).toBe(1);
  });

  it("flattens whatever the catalogue hands it", () => {
    const flat = readingTime("alpha beta gamma delta");
    const nested = readingTime({ a: ["alpha", "beta"], b: { c: "gamma delta" } });
    expect(nested.latinWords).toBe(flat.latinWords);
  });

  it("never reports less than a minute", () => {
    expect(readingTime("hi").minutes).toBe(1);
    expect(readingTime("").minutes).toBe(1);
  });
});

describe("against the real catalogues", () => {
  it("reports a plausible time for the privacy policy in BOTH languages", () => {
    const en = readingTime(read("en").privacy);
    const km = readingTime(read("km").privacy);

    // The bug this exists to prevent: Khmer reporting the floor because its
    // text collapsed to one "word".
    expect(km.minutes).toBeGreaterThan(1);
    expect(en.minutes).toBeGreaterThan(1);

    // The two renderings of one document should not disagree wildly. A
    // factor of two here means one script is being measured with the other's
    // unit. (They are not expected to be equal — Khmer is denser per
    // character and the two catalogues are genuinely different lengths.)
    const ratio = Math.max(en.minutes, km.minutes) / Math.min(en.minutes, km.minutes);
    expect(ratio, `en ${en.minutes}min vs km ${km.minutes}min`).toBeLessThan(2);
  });

  it("reports a plausible time for the borrow policy in BOTH languages", () => {
    const en = readingTime(read("en").policy);
    const km = readingTime(read("km").policy);
    expect(en.minutes).toBeGreaterThanOrEqual(1);
    expect(km.minutes).toBeGreaterThanOrEqual(1);
    const ratio = Math.max(en.minutes, km.minutes) / Math.min(en.minutes, km.minutes);
    expect(ratio, `en ${en.minutes}min vs km ${km.minutes}min`).toBeLessThan(2);
  });

  it("the Khmer catalogue really has no spaces to split on", () => {
    // Guards the premise. If Khmer copy ever arrives pre-segmented, the
    // character rule is still correct but this test documents why it exists.
    const km = read("km").privacy.sections.collect.title as string;
    expect(km).not.toMatch(/\s/);
    expect(km.split(/\s+/)).toHaveLength(1);
  });
});
