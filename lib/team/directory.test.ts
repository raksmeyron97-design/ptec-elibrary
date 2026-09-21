// Pins the /about/team directory's decision rules — the ones a screenshot
// cannot catch and the type system cannot express.
//
// Three of them are load-bearing enough to be worth stating here:
//
//   • A name's `lang` comes from the VALUE that was used, not the requested
//     locale. Get this wrong and a Latin name on /km is handed to Hanuman.
//   • Search matches BOTH scripts whatever the page's locale is.
//   • The featured section is `is_featured` and nothing else — never a
//     position string, and never padded to fill a row.

import { describe, expect, it } from "vitest";
import {
  FILTER_ALL,
  FILTER_UNSECTIONED,
  FEATURED_MAX,
  areaChips,
  filterMembers,
  matchesQuery,
  memberArea,
  memberBio,
  memberNames,
  memberPosition,
  memberResponsibilities,
  memberSummary,
  searchHaystack,
  sectionBlurb,
  sectionName,
  splitFeatured,
} from "./directory";
import type { PublicTeamMember, PublicTeamSection } from "./public";

function member(overrides: Partial<PublicTeamMember> = {}): PublicTeamMember {
  return {
    id: "m1",
    slug: "sokha",
    updated_at: null,
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
    name_km: "សេវាអ្នកអាន",
    name_en: "Reader Services",
    description_km: null,
    description_en: null,
    display_order: 0,
    ...overrides,
  };
}

describe("memberNames", () => {
  it("leads with the active locale and keeps the other script as a secondary line", () => {
    expect(memberNames(member(), "en")).toEqual({
      primary: "Sokha",
      primaryLang: "en",
      secondary: "សុខា",
      secondaryLang: "km",
    });
    expect(memberNames(member(), "km")).toEqual({
      primary: "សុខា",
      primaryLang: "km",
      secondary: "Sokha",
      secondaryLang: "en",
    });
  });

  it("tags the language of the value it actually used, not the locale it was asked for", () => {
    // A member with no Khmer name renders their Latin name on /km. Tagging
    // that run lang="km" hands an English string to the Khmer serif.
    const latinOnly = member({ name_km: "" });
    const km = memberNames(latinOnly, "km");
    expect(km.primary).toBe("Sokha");
    expect(km.primaryLang).toBe("en");
    expect(km.secondary).toBeNull();
  });

  it("never repeats one name on both lines", () => {
    const same = member({ name_km: "Sokha", name_en: "Sokha" });
    expect(memberNames(same, "en").secondary).toBeNull();
  });
});

describe("memberPosition / memberArea / memberBio", () => {
  it("prefers the active locale and falls back to whichever language exists", () => {
    const m = member({ position_km: "បណ្ណារក្ស", position_en: "Librarian" });
    expect(memberPosition(m, "km")).toEqual({ text: "បណ្ណារក្ស", lang: "km" });
    expect(memberPosition(m, "en")).toEqual({ text: "Librarian", lang: "en" });

    // Khmer missing: the English string is shown on /km, tagged English.
    const latin = member({ position_km: null, position_en: "Librarian" });
    expect(memberPosition(latin, "km")).toEqual({ text: "Librarian", lang: "en" });
  });

  it("returns null rather than an empty string, so a caller renders nothing", () => {
    const blank = member({ position_km: "   ", position_en: null, bio_km: null, bio_en: null });
    expect(memberPosition(blank, "en")).toBeNull();
    expect(memberArea(blank, "en")).toBeNull();
    expect(memberBio(blank, "en")).toBeNull();
  });
});

describe("sectionName / sectionBlurb", () => {
  it("localizes a section and reports the language it resolved to", () => {
    expect(sectionName(section(), "km")).toEqual({ text: "សេវាអ្នកអាន", lang: "km" });
    expect(sectionName(section(), "en")).toEqual({ text: "Reader Services", lang: "en" });
    expect(sectionBlurb(section(), "en")).toBeNull();
    expect(sectionBlurb(section({ description_en: "Front desk." }), "en")).toEqual({
      text: "Front desk.",
      lang: "en",
    });
  });
});

describe("memberResponsibilities", () => {
  it("falls back to the populated language — an empty list in the reader's language says less", () => {
    const m = member({ responsibilities_en: ["Cataloguing"], responsibilities_km: [] });
    expect(memberResponsibilities(m, "km")).toEqual({ items: ["Cataloguing"], lang: "en" });
  });

  it("prefers Khmer on /km when Khmer entries exist", () => {
    const m = member({ responsibilities_en: ["Cataloguing"], responsibilities_km: ["ចុះបញ្ជី"] });
    expect(memberResponsibilities(m, "km")).toEqual({ items: ["ចុះបញ្ជី"], lang: "km" });
    expect(memberResponsibilities(m, "en")).toEqual({ items: ["Cataloguing"], lang: "en" });
  });
});

describe("memberSummary", () => {
  it("leads with the reader's own language — the defect it exists to fix", () => {
    // cardSummary() prefers short_bio_km unconditionally, so the ENGLISH page
    // rendered a Khmer paragraph for every member who has one.
    const m = member({ short_bio_km: "សង្ខេបខ្មែរ", short_bio_en: "English summary" });
    expect(memberSummary(m, "en")).toEqual({ text: "English summary", lang: "en" });
    expect(memberSummary(m, "km")).toEqual({ text: "សង្ខេបខ្មែរ", lang: "km" });
  });

  it("falls back across languages WITHIN a rung before dropping to the next one", () => {
    // A Khmer short bio beats an English full biography on /en: a sentence the
    // librarian wrote for a card, in the wrong language, still says more than
    // the opening of a paragraph written to be read whole.
    const m = member({ short_bio_km: "សង្ខេប", short_bio_en: null, bio_en: "Long biography" });
    expect(memberSummary(m, "en")).toEqual({ text: "សង្ខេប", lang: "km" });
  });

  it("walks short bio → first responsibility → biography", () => {
    expect(memberSummary(member({ responsibilities_en: ["Cataloguing"], bio_en: "Long" }), "en"))
      .toEqual({ text: "Cataloguing", lang: "en" });
    expect(memberSummary(member({ bio_en: "Long" }), "en")).toEqual({ text: "Long", lang: "en" });
    expect(memberSummary(member(), "en")).toBeNull();
  });

  it("truncates to the caller's budget", () => {
    const long = "x".repeat(200);
    const out = memberSummary(member({ short_bio_en: long }), "en", 50);
    expect(out?.text).toHaveLength(50);
    expect(out?.text.endsWith("…")).toBe(true);
  });
});

describe("searchHaystack", () => {
  it("carries both scripts of every public field", () => {
    const hay = searchHaystack(
      member({
        position_km: "បណ្ណារក្ស",
        section_name_en: "Reader Services",
        responsibilities_en: ["Cataloguing"],
        languages: ["Khmer", "English"],
      }),
    );
    expect(hay).toEqual(
      expect.arrayContaining(["Sokha", "សុខា", "បណ្ណារក្ស", "Reader Services", "Cataloguing", "Khmer"]),
    );
  });

  it("never carries a contact field, approved or not", () => {
    // The view nulls these unless approved — but a member who DID approve
    // publication still must not have their number act as a search key.
    const hay = searchHaystack(member({ phone: "012 345 678", email: "a@b.kh" }));
    expect(hay).not.toContain("012 345 678");
    expect(hay).not.toContain("a@b.kh");
  });

  it("drops blank and whitespace-only fields", () => {
    expect(searchHaystack(member({ position_en: "   ", short_bio_en: "" }))).not.toContain("   ");
  });
});

describe("matchesQuery", () => {
  it("matches mid-word, so a surname finds a full name", () => {
    expect(matchesQuery(member({ name_en: "LAM SOKLANG" }), "soklang")).toBe(true);
  });

  it("matches a Khmer substring — Khmer has no word boundaries to anchor to", () => {
    expect(matchesQuery(member({ name_km: "លាម សុខឡាង" }), "សុខ")).toBe(true);
  });

  it("finds a Khmer name while the page is in English, and the reverse", () => {
    const m = member({ name_en: "Sokha", name_km: "សុខា" });
    expect(matchesQuery(m, "សុខា")).toBe(true);
    expect(matchesQuery(m, "sokha")).toBe(true);
  });

  it("is case-insensitive and treats an empty query as matching everything", () => {
    expect(matchesQuery(member(), "SOKHA")).toBe(true);
    expect(matchesQuery(member(), "   ")).toBe(true);
  });

  it("does not match a term the member does not carry", () => {
    expect(matchesQuery(member(), "astrophysics")).toBe(false);
  });
});

describe("filterMembers", () => {
  const roster = [
    member({ id: "a", section_id: "s1", name_en: "Ana" }),
    member({ id: "b", section_id: "s2", name_en: "Bora" }),
    member({ id: "c", section_id: null, name_en: "Chan" }),
  ];

  it("returns the whole roster for the All filter and an empty query", () => {
    expect(filterMembers(roster, { area: FILTER_ALL, query: "" }).map((m) => m.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("filters by section id", () => {
    expect(filterMembers(roster, { area: "s1", query: "" }).map((m) => m.id)).toEqual(["a"]);
  });

  it("gathers everyone with no section under the Other filter", () => {
    expect(filterMembers(roster, { area: FILTER_UNSECTIONED, query: "" }).map((m) => m.id)).toEqual([
      "c",
    ]);
  });

  it("applies area and query together", () => {
    expect(filterMembers(roster, { area: "s1", query: "bora" })).toEqual([]);
    expect(filterMembers(roster, { area: FILTER_ALL, query: "bora" }).map((m) => m.id)).toEqual([
      "b",
    ]);
  });

  it("preserves the library's display order", () => {
    expect(filterMembers(roster, { area: FILTER_ALL, query: "a" }).map((m) => m.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("areaChips", () => {
  const s1 = section({ id: "s1", name_en: "Reader Services" });
  const s2 = section({ id: "s2", name_en: "Research Support", display_order: 1 });

  it("counts the whole roster on All and each area on its own chip", () => {
    const chips = areaChips(
      [member({ id: "a", section_id: "s1" }), member({ id: "b", section_id: "s2" }), member({ id: "c", section_id: "s2" })],
      [s1, s2],
      "en",
    );
    expect(chips.map((c) => [c.value, c.count])).toEqual([
      [FILTER_ALL, 3],
      ["s1", 1],
      ["s2", 2],
    ]);
  });

  it("offers no chip for an area with nobody in it — it could only produce an empty state", () => {
    const chips = areaChips([member({ id: "a", section_id: "s1" })], [s1, s2], "en");
    expect(chips.map((c) => c.value)).toEqual([FILTER_ALL, "s1"]);
  });

  it("adds Other only when somebody is unsectioned, including a dangling section id", () => {
    expect(areaChips([member({ section_id: "s1" })], [s1], "en").map((c) => c.value)).toEqual([
      FILTER_ALL,
      "s1",
    ]);
    expect(
      areaChips([member({ id: "x", section_id: "deleted" })], [s1], "en").map((c) => c.value),
    ).toEqual([FILTER_ALL, FILTER_UNSECTIONED]);
  });

  it("labels area chips from the row and leaves All/Other to the message catalogue", () => {
    const chips = areaChips(
      [member({ section_id: "s1" }), member({ id: "z", section_id: null })],
      [s1],
      "km",
    );
    expect(chips[0].name).toBeNull();
    expect(chips[1].name).toEqual({ text: "សេវាអ្នកអាន", lang: "km" });
    expect(chips[2].name).toBeNull();
  });

  it("keeps the All chip even for a single-area roster — it is what clears a search", () => {
    expect(areaChips([member({ section_id: "s1" })], [s1], "en")).toHaveLength(2);
  });
});

describe("splitFeatured", () => {
  it("leads with the featured members, in the library's display order", () => {
    const { featured } = splitFeatured([
      member({ id: "head", is_featured: true }),
      member({ id: "deputy", is_featured: true }),
      member({ id: "other" }),
    ]);
    expect(featured.map((m) => m.id)).toEqual(["head", "deputy"]);
  });

  it("reads is_featured ONLY — never a position string", () => {
    // "Head of Department" is a job title the library wrote, not a flag it
    // set. Inferring rank from prose is how a redesign invents a hierarchy.
    const { featured } = splitFeatured([
      member({ id: "a", position_en: "Head of Department of Educational Research and Library" }),
      member({ id: "b", position_en: "Deputy Head of Department" }),
    ]);
    expect(featured).toEqual([]);
  });

  it("shows a single featured member rather than padding the row", () => {
    // The heading is "Meet the Library Team", which introduces people without
    // ranking them, so one card is a legitimate section — and a placeholder
    // person invented to make it three would not be.
    const { featured } = splitFeatured([member({ id: "a", is_featured: true }), member({ id: "b" })]);
    expect(featured.map((m) => m.id)).toEqual(["a"]);
  });

  it("caps at one desktop row, leaving the overflow in the searchable directory", () => {
    const many = Array.from({ length: FEATURED_MAX + 3 }, (_, i) =>
      member({ id: `f${i}`, is_featured: true }),
    );
    expect(splitFeatured(many).featured).toHaveLength(FEATURED_MAX);
  });

  it("keeps every featured member in the directory too, so search stays complete", () => {
    const roster = [
      member({ id: "head", is_featured: true }),
      member({ id: "deputy", is_featured: true }),
      member({ id: "other" }),
    ];
    expect(splitFeatured(roster).directory.map((m) => m.id)).toEqual(["head", "deputy", "other"]);
  });
});
