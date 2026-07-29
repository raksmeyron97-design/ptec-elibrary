import { describe, expect, it } from "vitest";
import {
  barWidth,
  formatClock,
  formatDate,
  formatNumber,
  formatSourcedNumber,
  localized,
  percentOf,
  pickLocale,
  pickLocaleLang,
  toAboutLocale,
} from "./format";

// The contract every one of these helpers exists to keep: a missing, empty or
// malformed value NEVER reaches the DOM as "undefined", "NaN" or
// "Invalid Date". Each returns null so the caller renders its empty state.

describe("toAboutLocale", () => {
  it("passes km through and treats everything else as English", () => {
    expect(toAboutLocale("km")).toBe("km");
    expect(toAboutLocale("en")).toBe("en");
    expect(toAboutLocale("fr")).toBe("en");
    expect(toAboutLocale("")).toBe("en");
  });
});

describe("pickLocale", () => {
  const both = { km: "បណ្ណាល័យ", en: "Library" };

  it("returns the active locale's string", () => {
    expect(pickLocale(both, "km")).toBe("បណ្ណាល័យ");
    expect(pickLocale(both, "en")).toBe("Library");
  });

  it("falls back to the other language when the active one is empty", () => {
    // A field the library only supplied in Khmer must still render on the
    // English page — showing nothing would be worse than showing Khmer.
    expect(pickLocale({ km: "បណ្ណាល័យ", en: "" }, "en")).toBe("បណ្ណាល័យ");
    expect(pickLocale({ km: "", en: "Library" }, "km")).toBe("Library");
  });

  it("treats whitespace-only as empty", () => {
    expect(pickLocale({ km: "   ", en: "Library" }, "km")).toBe("Library");
  });

  it("returns an empty string when there is nothing at all", () => {
    expect(pickLocale({ km: "", en: "" }, "en")).toBe("");
    expect(pickLocale(null, "en")).toBe("");
    expect(pickLocale(undefined, "km")).toBe("");
  });
});

describe("pickLocaleLang", () => {
  it("reports the language the string ACTUALLY resolved to", () => {
    // This is what the `lang` attribute is set from. Getting it wrong makes a
    // screen reader read Khmer with an English voice.
    expect(pickLocaleLang({ km: "បណ្ណាល័យ", en: "" }, "en")).toBe("km");
    expect(pickLocaleLang({ km: "", en: "Library" }, "km")).toBe("en");
    expect(pickLocaleLang({ km: "បណ្ណាល័យ", en: "Library" }, "km")).toBe("km");
  });

  it("returns null when nothing renders", () => {
    expect(pickLocaleLang({ km: "", en: "" }, "en")).toBeNull();
    expect(pickLocaleLang(null, "en")).toBeNull();
  });
});

describe("localized", () => {
  it("pairs the text with its language", () => {
    expect(localized({ km: "បណ្ណាល័យ", en: "Library" }, "en")).toEqual({
      text: "Library",
      lang: "en",
    });
  });

  it("returns null rather than an empty element", () => {
    expect(localized({ km: "", en: "" }, "en")).toBeNull();
    expect(localized(undefined, "km")).toBeNull();
  });
});

describe("formatNumber", () => {
  it("groups thousands", () => {
    expect(formatNumber(45085, "en")).toBe("45,085");
  });

  it("uses Western digits in Khmer, matching the rest of the UI", () => {
    // lib/collection-stats.ts formats with km-u-nu-latn; if this diverged the
    // same figure would render differently on two pages.
    expect(formatNumber(45085, "km")).toBe("45,085");
  });

  it("returns null for anything that is not a finite number", () => {
    expect(formatNumber(Number.NaN, "en")).toBeNull();
    expect(formatNumber(Number.POSITIVE_INFINITY, "en")).toBeNull();
    expect(formatNumber(null, "en")).toBeNull();
    expect(formatNumber(undefined, "en")).toBeNull();
  });

  it("formats zero rather than hiding it", () => {
    // Zero is a real answer ("0 closures"); only invalid input is suppressed.
    expect(formatNumber(0, "en")).toBe("0");
  });
});

describe("formatSourcedNumber", () => {
  it("formats a verified figure", () => {
    expect(
      formatSourcedNumber({ value: 2766, confidence: "verified", sourceSection: "6.2" }, "en"),
    ).toBe("2,766");
  });

  it("REFUSES a disputed figure", () => {
    // The guard that keeps the contradictory research-bulletin count (four
    // titles in §1.4 vs six volumes in §2.4) off a headline stat card.
    expect(
      formatSourcedNumber({ value: 6, confidence: "disputed", sourceSection: "2.4" }, "en"),
    ).toBeNull();
  });

  it("REFUSES an unverified figure", () => {
    expect(
      formatSourcedNumber({ value: 10, confidence: "unverified", sourceSection: "6.4" }, "en"),
    ).toBeNull();
  });

  it("returns null for a missing figure", () => {
    expect(formatSourcedNumber(null, "en")).toBeNull();
    expect(formatSourcedNumber(undefined, "km")).toBeNull();
  });
});

describe("formatDate", () => {
  it("formats an ISO date readably", () => {
    expect(formatDate("2026-07-29", "en")).toBe("29 July 2026");
  });

  it("never emits 'Invalid Date'", () => {
    expect(formatDate("not-a-date", "en")).toBeNull();
    expect(formatDate("2026-13-45", "en")).toBeNull();
    expect(formatDate("", "en")).toBeNull();
    expect(formatDate(null, "en")).toBeNull();
    expect(formatDate(undefined, "km")).toBeNull();
  });

  it("reads the date in UTC so it cannot shift a day", () => {
    // Parsing "2026-07-29" in a negative-offset zone would render the 28th.
    expect(formatDate("2026-07-29", "en")).toContain("29");
  });
});

describe("formatClock", () => {
  it("uses 12-hour with a period in English", () => {
    expect(formatClock("07:00", "en")).toBe("7:00 AM");
    expect(formatClock("17:00", "en")).toBe("5:00 PM");
    expect(formatClock("12:00", "en")).toBe("12:00 PM");
    expect(formatClock("00:30", "en")).toBe("12:30 AM");
  });

  it("keeps 24-hour in Khmer, matching lib/library-hours", () => {
    expect(formatClock("07:00", "km")).toBe("7:00");
    expect(formatClock("17:00", "km")).toBe("17:00");
  });

  it("rejects malformed or out-of-range input", () => {
    expect(formatClock("25:00", "en")).toBeNull();
    expect(formatClock("07:99", "en")).toBeNull();
    expect(formatClock("7am", "en")).toBeNull();
    expect(formatClock("", "en")).toBeNull();
    expect(formatClock(null, "en")).toBeNull();
  });
});

describe("percentOf / barWidth", () => {
  it("computes a share", () => {
    expect(percentOf(50, 200)).toBe(25);
  });

  it("returns 0 rather than NaN when the whole is 0", () => {
    expect(percentOf(5, 0)).toBe(0);
    expect(percentOf(Number.NaN, 100)).toBe(0);
  });

  it("clamps out-of-range input", () => {
    expect(percentOf(300, 100)).toBe(100);
    expect(percentOf(-10, 100)).toBe(0);
  });

  it("gives the smallest category a visible bar", () => {
    // A 0.02% category would otherwise render as a zero-width sliver that is
    // impossible to see or point at.
    expect(barWidth(1, 100000)).toBe("0.75%");
    expect(barWidth(50, 100)).toBe("50.00%");
  });
});
