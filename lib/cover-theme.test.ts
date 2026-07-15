// lib/cover-theme.test.ts
import { describe, expect, it } from "vitest";
import {
  CATEGORY_COVER_THEMES,
  COVER_VARIANT_COUNT,
  getCategoryAcronym,
  getCategoryCoverTheme,
  getDeterministicCoverVariant,
  normalizeCategorySlug,
} from "./cover-theme";

// ── WCAG 2.x contrast math ────────────────────────────────────────────────────

function srgbChannel(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Not a 6-digit hex color: ${hex}`);
  const n = parseInt(m[1], 16);
  return (
    0.2126 * srgbChannel((n >> 16) & 0xff) +
    0.7152 * srgbChannel((n >> 8) & 0xff) +
    0.0722 * srgbChannel(n & 0xff)
  );
}

function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

describe("cover theme contrast (WCAG AA)", () => {
  for (const theme of Object.values(CATEGORY_COVER_THEMES)) {
    it(`${theme.slug}: foreground ≥ 4.5:1 on background`, () => {
      expect(contrastRatio(theme.foreground, theme.background)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${theme.slug}: accent ≥ 4.5:1 on background`, () => {
      expect(contrastRatio(theme.accent, theme.background)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${theme.slug}: foreground ≥ 4.5:1 on backgroundSoft (gradient end)`, () => {
      expect(contrastRatio(theme.foreground, theme.backgroundSoft)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("normalizeCategorySlug", () => {
  it("maps English category names", () => {
    expect(normalizeCategorySlug("Literature")).toBe("literature");
    expect(normalizeCategorySlug("Law")).toBe("law");
    expect(normalizeCategorySlug("Public Law")).toBe("law");
    expect(normalizeCategorySlug("Education")).toBe("education");
    expect(normalizeCategorySlug("Mathematics")).toBe("mathematics");
    expect(normalizeCategorySlug("Computer Science")).toBe("technology");
    expect(normalizeCategorySlug("Technology")).toBe("technology");
    expect(normalizeCategorySlug("History")).toBe("history");
    expect(normalizeCategorySlug("Economics")).toBe("economics");
  });

  it("maps the Khmer categories used by the live library", () => {
    expect(normalizeCategorySlug("ស្រាវជ្រាវ")).toBe("research");
    expect(normalizeCategorySlug("ស្រាវជ្រាវសកម្មភាព")).toBe("research");
    expect(normalizeCategorySlug("ស្ថិតិ និងវិភាគទិន្នន័យ")).toBe("statistics");
    expect(normalizeCategorySlug("គរុកោសល្យ")).toBe("education");
    expect(normalizeCategorySlug("ភាសាអង់គ្លេសសិក្សា")).toBe("language");
    expect(normalizeCategorySlug("គណិតវិទ្យា")).toBe("mathematics");
    expect(normalizeCategorySlug("កញ្ជប់គណិតវិទ្យា")).toBe("mathematics");
    expect(normalizeCategorySlug("កម្មវិធីសិក្សា")).toBe("curriculum");
    expect(normalizeCategorySlug("វិទ្យាសាស្ត្រ")).toBe("science");
  });

  it("falls back to general for unknown / empty categories", () => {
    expect(normalizeCategorySlug(null)).toBe("general");
    expect(normalizeCategorySlug(undefined)).toBe("general");
    expect(normalizeCategorySlug("")).toBe("general");
    expect(normalizeCategorySlug("Cooking")).toBe("general");
  });
});

describe("getCategoryCoverTheme", () => {
  it("is deterministic — same category always yields the same theme", () => {
    expect(getCategoryCoverTheme("Law")).toBe(getCategoryCoverTheme("law"));
    expect(getCategoryCoverTheme("Literature").background).toBe(
      CATEGORY_COVER_THEMES.literature.background,
    );
  });

  it("never returns undefined", () => {
    expect(getCategoryCoverTheme("អ្វីមួយប្លែក")).toBe(CATEGORY_COVER_THEMES.general);
  });
});

describe("getCategoryAcronym", () => {
  it("uses the theme acronym for mapped categories", () => {
    expect(getCategoryAcronym("Literature")).toBe("LIT");
    expect(getCategoryAcronym("គណិតវិទ្យា")).toBe("MATH");
  });

  it("derives from Latin letters for unmapped categories", () => {
    expect(getCategoryAcronym("Cooking")).toBe("COOK");
  });

  it("falls back to PTEC when no Latin letters exist", () => {
    expect(getCategoryAcronym("ចម្អិនអាហារ")).toBe("PTEC");
    expect(getCategoryAcronym(null)).toBe("PTEC");
  });
});

describe("getDeterministicCoverVariant", () => {
  it("is stable for the same seed", () => {
    const a = getDeterministicCoverVariant("the-great-gatsby");
    expect(getDeterministicCoverVariant("the-great-gatsby")).toBe(a);
  });

  it("stays inside [0, COVER_VARIANT_COUNT)", () => {
    for (const seed of ["a", "b", "១០១សំណួរ", "gatsby", "x".repeat(300)]) {
      const v = getDeterministicCoverVariant(seed);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(COVER_VARIANT_COUNT);
    }
  });

  it("defaults to 0 without a seed", () => {
    expect(getDeterministicCoverVariant(null)).toBe(0);
    expect(getDeterministicCoverVariant(undefined)).toBe(0);
  });
});
