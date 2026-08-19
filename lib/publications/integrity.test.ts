import { describe, it, expect } from "vitest";
import {
  accessStatus,
  canBadgeOpenAccess,
  publicationMetrics,
  metricsAreEmpty,
  secondaryValue,
  needsLanguageNotice,
} from "@/lib/publications/integrity";
import { reviewsEnabled, aggregateRatingAllowed } from "@/lib/reviews/policy";

describe("accessStatus", () => {
  it("claims nothing when no licence is recorded", () => {
    expect(accessStatus(null)).toBe("unknown");
    expect(accessStatus("")).toBe("unknown");
    expect(accessStatus("   ")).toBe("unknown");
    expect(canBadgeOpenAccess(null)).toBe(false);
  });

  it("recognises open licences", () => {
    for (const l of [
      "CC BY 4.0",
      "cc-by-nc-sa",
      "CC0 1.0",
      "Creative Commons Attribution",
      "Public Domain",
      "Open Access",
    ]) {
      expect(accessStatus(l), l).toBe("open");
      expect(canBadgeOpenAccess(l), l).toBe(true);
    }
  });

  it("does NOT badge an all-rights-reserved copyright as open", () => {
    // The reference record: a third-party article the library hosts but whose
    // redistribution rights are unverified.
    const l = "© 2014 American Chemical Society & Division of Chemical Education, Inc.";
    expect(accessStatus(l)).toBe("restricted");
    expect(canBadgeOpenAccess(l)).toBe(false);
  });

  it("treats an unrecognised licence as restricted, never open", () => {
    expect(accessStatus("All rights reserved")).toBe("restricted");
    expect(accessStatus("Publisher licence")).toBe("restricted");
  });
});

describe("publicationMetrics", () => {
  const refs = [
    { id: "a", index: 1, text: "One" },
    { id: "b", index: 2, text: "Two" },
  ];

  it("derives the reference count from the rendered array, not a column", () => {
    const m = publicationMetrics({ view_count: 5, download_count: 2, references: refs }, "2014");
    expect(m.referenceCount).toBe(2);
  });

  it("suppresses zeros instead of publishing them", () => {
    const m = publicationMetrics({ view_count: 0, download_count: 0, references: [] }, "2014");
    expect(m.views).toBeNull();
    expect(m.downloads).toBeNull();
    expect(m.referenceCount).toBeNull();
    expect(m.year).toBe("2014");
  });

  it("reports stored counts verbatim — no optimistic +1", () => {
    const m = publicationMetrics({ view_count: 79, download_count: 3, references: refs }, null);
    expect(m.views).toBe(79);
    expect(m.downloads).toBe(3);
  });

  it("gives masthead and rail identical values from one call", () => {
    const pub = { view_count: 79, download_count: 3, references: refs };
    expect(publicationMetrics(pub, "2014")).toEqual(publicationMetrics(pub, "2014"));
  });

  it("tolerates missing/NaN counters", () => {
    const m = publicationMetrics(
      { view_count: undefined as never, download_count: NaN, references: undefined as never },
      null,
    );
    expect(metricsAreEmpty(m)).toBe(true);
  });
});

describe("secondaryValue", () => {
  it("drops a Khmer field that merely copies the primary", () => {
    // The affiliation defect: name and name_km both "Ron Raksmey".
    expect(secondaryValue("Ron Raksmey", "Ron Raksmey")).toBeNull();
    expect(secondaryValue("PTEC", "  ptec  ")).toBeNull();
  });

  it("keeps a genuine translation", () => {
    expect(secondaryValue("Phnom Penh Teacher Education College", "វិទ្យាល័យគរុកោសល្យ")).toBe(
      "វិទ្យាល័យគរុកោសល្យ",
    );
  });

  it("returns null for blank secondaries", () => {
    expect(secondaryValue("X", null)).toBeNull();
    expect(secondaryValue("X", "   ")).toBeNull();
  });
});

describe("needsLanguageNotice", () => {
  it("warns a Khmer reader that the full text is English", () => {
    expect(needsLanguageNotice("en", "km")).toBe(true);
  });

  it("stays silent when the record matches the active locale", () => {
    expect(needsLanguageNotice("en", "en")).toBe(false);
    expect(needsLanguageNotice("km", "km")).toBe(false);
  });

  it("normalises region-tagged codes", () => {
    expect(needsLanguageNotice("en-US", "en")).toBe(false);
    expect(needsLanguageNotice("EN", "km")).toBe(true);
  });

  it("stays silent rather than guessing when the record has no language", () => {
    expect(needsLanguageNotice(null, "km")).toBe(false);
    expect(needsLanguageNotice("", "km")).toBe(false);
  });
});

describe("reviews policy", () => {
  it("disables star ratings on publications by default", () => {
    expect(reviewsEnabled("publication")).toBe(false);
    expect(aggregateRatingAllowed("publication")).toBe(false);
  });

  it("keeps reader reviews on books and theses", () => {
    expect(reviewsEnabled("book")).toBe(true);
    expect(reviewsEnabled("thesis")).toBe(true);
  });
});
