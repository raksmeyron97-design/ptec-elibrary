import { describe, it, expect } from "vitest";
import {
  isLikelyBot,
  anonymousSessionHash,
  normalizeSearchTerm,
  editDistance,
  suggestCorrections,
  groupEquivalentTerms,
  hasKhmer,
} from "./analytics";

describe("isLikelyBot", () => {
  it("flags crawlers, monitors, and script clients", () => {
    expect(isLikelyBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isLikelyBot("curl/8.4.0")).toBe(true);
    expect(isLikelyBot("python-requests/2.31")).toBe(true);
    expect(isLikelyBot("UptimeRobot/2.0")).toBe(true);
    expect(isLikelyBot("HeadlessChrome/125.0")).toBe(true);
  });
  it("flags missing or implausibly short UAs", () => {
    expect(isLikelyBot(null)).toBe(true);
    expect(isLikelyBot("")).toBe(true);
    expect(isLikelyBot("Mozilla")).toBe(true);
  });
  it("passes real browsers", () => {
    expect(
      isLikelyBot("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"),
    ).toBe(false);
    expect(isLikelyBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15")).toBe(false);
  });
});

describe("anonymousSessionHash", () => {
  const ua = "Mozilla/5.0 test browser agent string";
  it("is stable within a day and rotates across days", () => {
    const d1 = new Date("2026-07-11T09:00:00Z");
    const d1later = new Date("2026-07-11T21:00:00Z");
    const d2 = new Date("2026-07-12T01:00:00Z");
    const a = anonymousSessionHash("1.2.3.4", ua, "secret", d1);
    expect(a).toBe(anonymousSessionHash("1.2.3.4", ua, "secret", d1later));
    expect(a).not.toBe(anonymousSessionHash("1.2.3.4", ua, "secret", d2));
  });
  it("differs per visitor and never echoes the IP", () => {
    const a = anonymousSessionHash("1.2.3.4", ua, "secret");
    const b = anonymousSessionHash("5.6.7.8", ua, "secret");
    expect(a).not.toBe(b);
    expect(a).not.toContain("1.2.3.4");
    expect(a).toHaveLength(16);
  });
  it("returns null without a secret (never falls back to raw values)", () => {
    expect(anonymousSessionHash("1.2.3.4", ua, undefined)).toBeNull();
    expect(anonymousSessionHash("1.2.3.4", ua, "")).toBeNull();
  });
});

describe("normalizeSearchTerm", () => {
  it("folds case and whitespace", () => {
    expect(normalizeSearchTerm("  Khmer   HISTORY \n")).toBe("khmer history");
  });
  it("preserves Khmer text intact", () => {
    const km = "ប្រវត្តិសាស្ត្រខ្មែរ";
    expect(normalizeSearchTerm(`  ${km}  `)).toBe(km);
    expect(hasKhmer(km)).toBe(true);
  });
  it("applies NFKC so fullwidth forms match", () => {
    expect(normalizeSearchTerm("ＭＡＴＨ")).toBe("math");
  });
});

describe("editDistance", () => {
  it("computes classic distances", () => {
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("math", "math")).toBe(0);
    expect(editDistance("histori", "history")).toBe(1);
  });
  it("caps early for far-apart strings", () => {
    expect(editDistance("a", "completely different", 2)).toBeGreaterThan(2);
  });
});

describe("suggestCorrections", () => {
  const vocabulary = ["History", "Chemistry", "Mathematics", "ប្រវត្តិសាស្ត្រ", "Biology"];
  it("suggests close vocabulary matches for typos", () => {
    const out = suggestCorrections("histori", vocabulary);
    expect(out[0]?.suggestion).toBe("History");
  });
  it("does not cross scripts", () => {
    expect(suggestCorrections("ប្រវត្តិសាស្រ្ត", ["History"])).toEqual([]);
  });
  it("keeps short terms conservative", () => {
    expect(suggestCorrections("cat", ["car", "cart", "coat"]).every((s) => s.distance <= 1)).toBe(true);
    expect(suggestCorrections("ab", vocabulary)).toEqual([]);
  });
});

describe("groupEquivalentTerms", () => {
  it("folds single-typo latin variants into the most frequent spelling", () => {
    const groups = groupEquivalentTerms([
      { term: "chemistry", count: 10 },
      { term: "chemistri", count: 2 },
      { term: "biology", count: 5 },
    ]);
    expect(groups.get("chemistry")?.count).toBe(12);
    expect(groups.get("chemistry")?.terms).toContain("chemistri");
    expect(groups.get("biology")?.count).toBe(5);
  });
  it("never merges Khmer terms by edit distance", () => {
    const groups = groupEquivalentTerms([
      { term: "គណិតវិទ្យា", count: 4 },
      { term: "គណិតវិទូ", count: 2 },
    ]);
    expect(groups.size).toBe(2);
  });
});
