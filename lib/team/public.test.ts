import { describe, it, expect } from "vitest";
import {
  fromLegacyRow,
  groupBySection,
  sectionCounts,
  featuredMembers,
  cardSummary,
  truncate,
  photoAltText,
  type PublicTeamMember,
  type PublicTeamSection,
} from "./public";

function member(overrides: Partial<PublicTeamMember> = {}): PublicTeamMember {
  return {
    id: "m1",
    name_km: "សុខា",
    name_en: "Sokha",
    position_km: null,
    position_en: "Librarian",
    education: null,
    years_experience: null,
    photo_url: null,
    photo_alt: null,
    short_bio_km: null,
    short_bio_en: null,
    bio_km: null,
    bio_en: null,
    responsibilities_km: [],
    responsibilities_en: [],
    languages: [],
    working_hours: null,
    is_featured: false,
    display_order: 0,
    section_id: null,
    section_name_km: null,
    section_name_en: null,
    phone: null,
    email: null,
    ...overrides,
  };
}

function section(overrides: Partial<PublicTeamSection> = {}): PublicTeamSection {
  return {
    id: "s1",
    name_km: "គ្រប់គ្រងទូទៅ",
    name_en: "General Management",
    description_km: null,
    description_en: null,
    display_order: 1,
    ...overrides,
  };
}

describe("fromLegacyRow", () => {
  it("maps legacy rows and defaults the post-0070 fields", () => {
    const mapped = fromLegacyRow({
      id: "m1",
      name_km: "សុខា",
      name_en: "Sokha",
      position_km: null,
      position_en: "Librarian",
      education: "MLS",
      years_experience: "8 years",
      phone: "012 345 678",
      bio_km: null,
      bio_en: "Bio",
      photo_url: null,
      user_email: "sokha@ptec.edu.kh",
      section_id: "s1",
      section_name_km: "ក",
      section_name_en: "Management",
    });
    expect(mapped.email).toBe("sokha@ptec.edu.kh");
    expect(mapped.is_featured).toBe(false);
    expect(mapped.responsibilities_en).toEqual([]);
    expect(mapped.languages).toEqual([]);
    expect(mapped.photo_alt).toBeNull();
  });
});

describe("groupBySection", () => {
  const s1 = section({ id: "s1" });
  const s2 = section({ id: "s2", name_en: "Digital", display_order: 2 });

  it("groups members under sections and drops empty sections", () => {
    const members = [member({ id: "a", section_id: "s1" }), member({ id: "b", section_id: "s1" })];
    const groups = groupBySection(members, [s1, s2]);
    expect(groups).toHaveLength(1);
    expect(groups[0].section?.id).toBe("s1");
    expect(groups[0].members.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("puts unsectioned and orphan-section members in a trailing group", () => {
    const members = [
      member({ id: "a", section_id: "s1" }),
      member({ id: "b", section_id: null }),
      member({ id: "c", section_id: "deleted-section" }),
    ];
    const groups = groupBySection(members, [s1]);
    expect(groups).toHaveLength(2);
    expect(groups[1].section).toBeNull();
    expect(groups[1].members.map((m) => m.id)).toEqual(["b", "c"]);
  });
});

describe("sectionCounts / featuredMembers", () => {
  it("counts per section with empty-string key for unsectioned", () => {
    const counts = sectionCounts([
      member({ id: "a", section_id: "s1" }),
      member({ id: "b", section_id: "s1" }),
      member({ id: "c", section_id: null }),
    ]);
    expect(counts).toEqual({ s1: 2, "": 1 });
  });

  it("returns only featured members", () => {
    const featured = featuredMembers([
      member({ id: "a", is_featured: true }),
      member({ id: "b" }),
    ]);
    expect(featured.map((m) => m.id)).toEqual(["a"]);
  });
});

describe("cardSummary", () => {
  it("prefers short bio, then responsibilities, then full bio", () => {
    expect(
      cardSummary(member({ short_bio_km: "សង្ខេប", bio_en: "long bio" }))
    ).toEqual({ text: "សង្ខេប", lang: "km" });

    expect(
      cardSummary(member({ responsibilities_en: ["Maintain the platform"], bio_en: "long" }))
    ).toEqual({ text: "Maintain the platform", lang: "en" });

    expect(cardSummary(member({ bio_en: "Full biography" }))).toEqual({
      text: "Full biography",
      lang: "en",
    });

    expect(cardSummary(member())).toBeNull();
  });

  it("truncates long text with an ellipsis", () => {
    const summary = cardSummary(member({ short_bio_en: "x".repeat(300) }));
    expect(summary?.text.length).toBeLessThanOrEqual(120);
    expect(summary?.text.endsWith("…")).toBe(true);
  });
});

describe("truncate / photoAltText", () => {
  it("truncate keeps short strings intact", () => {
    expect(truncate("hello", 10)).toBe("hello");
    expect(truncate("  padded  ", 10)).toBe("padded");
  });

  it("photoAltText uses stored alt first, then generates one", () => {
    expect(photoAltText(member({ photo_alt: "Custom alt" }))).toBe("Custom alt");
    expect(photoAltText(member())).toBe("Photo of Sokha, Librarian");
    expect(photoAltText(member({ position_en: null }))).toBe("Photo of Sokha");
  });
});
