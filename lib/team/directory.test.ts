// lib/team/directory.test.ts
//
// The team directory's decisions, exercised offline: no React, no DOM, no
// database. Everything asserted here is what the reader experiences as
// "the chips are right", "my name is in the right script", "searching for my
// colleague finds them" and "this link opens the right panel".

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ALL_DEPARTMENTS,
  DEPARTMENT_ACCENTS,
  UNSECTIONED,
  departmentAccents,
  departmentIdOf,
  filterTeamMembers,
  heroPortrait,
  isTeamView,
  matchesTeamQuery,
  memberBySlug,
  memberDepartment,
  memberNames,
  memberPosition,
  memberSummary,
  teamDepartments,
} from "./directory";
import type { PublicTeamMember, PublicTeamSection } from "./public";

const ROOT = path.resolve(__dirname, "..", "..");

function member(overrides: Partial<PublicTeamMember> = {}): PublicTeamMember {
  return {
    id: overrides.slug ?? "id-1",
    slug: null,
    name_km: "",
    name_en: "",
    position_km: null,
    position_en: null,
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
    updated_at: null,
    ...overrides,
  };
}

function section(id: string, en: string, km: string, order = 1): PublicTeamSection {
  return {
    id,
    name_en: en,
    name_km: km,
    description_en: null,
    description_km: null,
    display_order: order,
  };
}

/* ────────────────────────────────────────────────────────────────────────── */

describe("departments are derived from the roster", () => {
  const sections = [
    section("s1", "Library Leadership", "ថ្នាក់ដឹកនាំបណ្ណាល័យ", 1),
    section("s2", "Cataloging & Processing", "ចុះបញ្ជី", 2),
    section("s3", "Reader Services", "សេវាកម្មអ្នកអាន", 3),
  ];
  const members = [
    member({ id: "a", section_id: "s1" }),
    member({ id: "b", section_id: "s2" }),
    member({ id: "c", section_id: "s2" }),
    member({ id: "d", section_id: null }),
  ];

  it("counts every member, in section order", () => {
    const departments = teamDepartments(members, sections, "en", "Other");
    expect(departments.map((d) => [d.id, d.label, d.count])).toEqual([
      ["s1", "Library Leadership", 1],
      ["s2", "Cataloging & Processing", 2],
      [UNSECTIONED, "Other", 1],
    ]);
  });

  it("drops a section nobody published into — a chip that always shows 0 and an empty grid is a dead control", () => {
    expect(teamDepartments(members, sections, "en", "Other").map((d) => d.id)).not.toContain("s3");
  });

  it("omits the loose bucket entirely when every member has a live section", () => {
    const tidy = members.filter((m) => m.section_id);
    expect(teamDepartments(tidy, sections, "en", "Other").map((d) => d.id)).toEqual(["s1", "s2"]);
  });

  it("labels each department in the active locale", () => {
    expect(teamDepartments(members, sections, "km", "ផ្សេងទៀត")[0].label).toBe(
      "ថ្នាក់ដឹកនាំបណ្ណាល័យ",
    );
  });

  it("assigns the four validated hues in order and repeats rather than inventing a fifth", () => {
    const many = Array.from({ length: 6 }, (_, i) => section(`x${i}`, `Area ${i}`, `ផ្នែក ${i}`, i));
    const roster = many.map((s, i) => member({ id: `m${i}`, section_id: s.id }));
    const accents = teamDepartments(roster, many, "en", "Other").map((d) => d.accent);
    expect(accents).toEqual([1, 2, 3, 4, 1, 2]);
    expect(new Set(accents).size).toBe(DEPARTMENT_ACCENTS);
  });

  it("maps a member with no live section into the loose bucket", () => {
    expect(departmentIdOf(member({ section_id: null }))).toBe(UNSECTIONED);
    expect(departmentIdOf(member({ section_id: "s2" }))).toBe("s2");
  });

  it("indexes accents by department id, for the cards to read", () => {
    const departments = teamDepartments(members, sections, "en", "Other");
    expect(departmentAccents(departments)).toEqual({ s1: 1, s2: 2, [UNSECTIONED]: 3 });
  });
});

/* ────────────────────────────────────────────────────────────────────────── */

describe("name script ordering", () => {
  const both = member({ name_en: "Sok Dara", name_km: "សុខ ដារា" });

  it("leads with Khmer on /km and with Latin on /, and always shows both", () => {
    expect(memberNames(both, "km")).toEqual({
      primary: "សុខ ដារា",
      primaryLang: "km",
      secondary: "Sok Dara",
      secondaryLang: "en",
    });
    expect(memberNames(both, "en")).toEqual({
      primary: "Sok Dara",
      primaryLang: "en",
      secondary: "សុខ ដារា",
      secondaryLang: "km",
    });
  });

  it("never repeats the same string twice", () => {
    const one = member({ name_en: "MoEYS", name_km: "MoEYS" });
    expect(memberNames(one, "km").secondary).toBeNull();
    expect(memberNames(one, "en").secondary).toBeNull();
  });

  it("falls back to the only script stored, with the right lang, and no second line", () => {
    const latinOnly = member({ name_en: "Sok Dara", name_km: "" });
    expect(memberNames(latinOnly, "km")).toEqual({
      primary: "Sok Dara",
      primaryLang: "en",
      secondary: null,
      secondaryLang: "km",
    });

    const khmerOnly = member({ name_en: "", name_km: "សុខ ដារា" });
    expect(memberNames(khmerOnly, "en").primaryLang).toBe("km");
    expect(memberNames(khmerOnly, "en").primary).toBe("សុខ ដារា");
  });

  it("applies the same rule to positions and departments", () => {
    const m = member({
      position_en: "Cataloging Officer",
      position_km: "មន្ត្រីចុះបញ្ជី",
      section_name_en: "Reader Services",
      section_name_km: "សេវាកម្មអ្នកអាន",
    });
    expect(memberPosition(m, "km")).toBe("មន្ត្រីចុះបញ្ជី");
    expect(memberPosition(m, "en")).toBe("Cataloging Officer");
    expect(memberDepartment(m, "km")).toBe("សេវាកម្មអ្នកអាន");
    expect(memberDepartment(m, "en")).toBe("Reader Services");
    // Only one language stored: it answers for both locales rather than
    // rendering nothing.
    expect(memberPosition(member({ position_en: "Librarian" }), "km")).toBe("Librarian");
    expect(memberDepartment(member(), "en")).toBeNull();
  });
});

describe("the card's one line is in the reader's own language", () => {
  const full = member({
    short_bio_en: "Runs the reading-room desk.",
    short_bio_km: "ទទួលបន្ទុកតុបម្រើសេវានៅបន្ទប់អាន។",
    responsibilities_en: ["Inter-library requests"],
    bio_en: "A much longer biography that should never win.",
  });

  it("prefers the active locale inside the tier, not Khmer unconditionally", () => {
    expect(memberSummary(full, "en")).toEqual({ text: "Runs the reading-room desk.", lang: "en" });
    expect(memberSummary(full, "km")).toEqual({
      text: "ទទួលបន្ទុកតុបម្រើសេវានៅបន្ទប់អាន។",
      lang: "km",
    });
  });

  it("keeps the tier order: a dedicated short bio still beats a long one", () => {
    const m = member({ short_bio_km: "សង្ខេប", bio_en: "A long biography" });
    expect(memberSummary(m, "en")).toEqual({ text: "សង្ខេប", lang: "km" });
  });

  it("falls through short bio → responsibility → biography", () => {
    expect(
      memberSummary(member({ responsibilities_en: ["Maintain the platform"], bio_en: "long" }), "en"),
    ).toEqual({ text: "Maintain the platform", lang: "en" });
    expect(memberSummary(member({ bio_km: "ជីវប្រវត្តិ" }), "en")).toEqual({
      text: "ជីវប្រវត្តិ",
      lang: "km",
    });
  });

  it("truncates rather than overflowing the card, and answers null with nothing to say", () => {
    const long = memberSummary(member({ short_bio_en: "x".repeat(300) }), "en", 40);
    expect(long!.text).toHaveLength(40);
    expect(long!.text.endsWith("…")).toBe(true);
    expect(memberSummary(member(), "en")).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────────────── */

describe("search", () => {
  const dara = member({
    id: "dara",
    name_en: "Sok Dara",
    name_km: "សុខ ដារា",
    position_en: "Cataloging Officer",
    position_km: "មន្ត្រីចុះបញ្ជី",
    section_name_en: "Cataloging & Processing",
    section_name_km: "ចុះបញ្ជី និងដំណើរការ",
    section_id: "s2",
  });
  const chan = member({
    id: "chan",
    name_en: "Chan Sophea",
    name_km: "ចាន់ សុភា",
    position_en: "Reader Services Assistant",
    position_km: "ជំនួយការសេវាកម្មអ្នកអាន",
    section_name_en: "Reader Services",
    section_name_km: "សេវាកម្មអ្នកអាន",
    section_id: "s3",
  });
  const roster = [dara, chan];

  it("matches nothing in particular when the query is empty — everyone stays", () => {
    expect(matchesTeamQuery(dara, "")).toBe(true);
    expect(matchesTeamQuery(dara, "   ")).toBe(true);
  });

  it("finds a person by either script, whichever locale the page is in", () => {
    expect(matchesTeamQuery(dara, "dara")).toBe(true);
    expect(matchesTeamQuery(dara, "ដារា")).toBe(true);
    expect(matchesTeamQuery(chan, "សុភា")).toBe(true);
  });

  it("searches position and department, not only the name", () => {
    expect(matchesTeamQuery(dara, "cataloging")).toBe(true);
    expect(matchesTeamQuery(chan, "reader services")).toBe(true);
    expect(matchesTeamQuery(chan, "ជំនួយការ")).toBe(true);
  });

  it("requires a Latin term to BEGIN a word — the site's own rule", () => {
    // "log" sits inside "Cataloging"; matching it would be the same accident
    // that made "mining" match "Examining" in search (lib/search/normalize).
    expect(matchesTeamQuery(dara, "log")).toBe(false);
    // Truncation still matches: people search by prefix.
    expect(matchesTeamQuery(dara, "catalog")).toBe(true);
  });

  it("forgives one typo in a word long enough to be worth guessing about", () => {
    expect(matchesTeamQuery(dara, "catologing")).toBe(true);
    expect(matchesTeamQuery(chan, "servises")).toBe(true);
    // A short token gets no fuzzy leg: at three characters a one-edit
    // neighbourhood is most of the alphabet.
    expect(matchesTeamQuery(dara, "xyz")).toBe(false);
  });

  it("narrows with every word — tokens are an AND", () => {
    expect(matchesTeamQuery(dara, "sok cataloging")).toBe(true);
    expect(matchesTeamQuery(dara, "sok reader")).toBe(false);
  });

  it("filters by department and query together, and keeps the librarians' order", () => {
    expect(filterTeamMembers(roster, { department: ALL_DEPARTMENTS, query: "" })).toEqual(roster);
    expect(
      filterTeamMembers(roster, { department: "s3", query: "" }).map((m) => m.id),
    ).toEqual(["chan"]);
    expect(
      filterTeamMembers(roster, { department: "s2", query: "chan" }).map((m) => m.id),
    ).toEqual([]);
    expect(
      filterTeamMembers([chan, dara], { department: ALL_DEPARTMENTS, query: "s" }).map((m) => m.id),
    ).toEqual(["chan", "dara"]);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */

describe("?member= resolution", () => {
  const roster = [
    member({ id: "a", slug: "head-librarian" }),
    member({ id: "b", slug: "content-staff" }),
    member({ id: "c", slug: null }),
  ];

  it("opens the member the slug names", () => {
    expect(memberBySlug(roster, "content-staff")?.id).toBe("b");
  });

  it("ignores every wrong input silently — a stale link lands in the directory", () => {
    for (const bad of ["", "   ", "nobody", null, undefined]) {
      expect(memberBySlug(roster, bad)).toBeNull();
    }
  });

  it("never resolves a member who has no slug at all", () => {
    expect(memberBySlug(roster, "c")).toBeNull();
  });
});

describe("view preference", () => {
  it("accepts only the two views it knows, so anything in localStorage is grid", () => {
    expect(isTeamView("grid")).toBe(true);
    expect(isTeamView("list")).toBe(true);
    for (const junk of ["", "GRID", "table", null, undefined, 1, {}]) {
      expect(isTeamView(junk)).toBe(false);
    }
  });
});

describe("hero portrait", () => {
  it("prefers a featured member with a photo", () => {
    const roster = [
      member({ id: "a", photo_url: "https://cdn.test/a.jpg" }),
      member({ id: "b", photo_url: "https://cdn.test/b.jpg", is_featured: true }),
    ];
    expect(heroPortrait(roster)?.id).toBe("b");
  });

  it("falls back to the first member who has one", () => {
    const roster = [member({ id: "a" }), member({ id: "b", photo_url: "https://cdn.test/b.jpg" })];
    expect(heroPortrait(roster)?.id).toBe("b");
  });

  it("answers null rather than nominating a monogram for the hero", () => {
    expect(heroPortrait([member({ id: "a", is_featured: true })])).toBeNull();
    expect(heroPortrait([])).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────────────── */

/**
 * The department hues are BORROWED, not chosen. admin.css declares the
 * validated categorical palette (lightness band, chroma floor, protan/deutan
 * ΔE under all pairs) and the public tree never loads that file, so globals.css
 * restates the values. This is the check that keeps the copy honest: a hue
 * edited on one side and not the other would put a colour outside the set that
 * was validated as a set.
 */
describe("department accents are the validated series palette", () => {
  const globals = readFileSync(path.join(ROOT, "app", "globals.css"), "utf8");
  const admin = readFileSync(path.join(ROOT, "app", "admin.css"), "utf8");

  function value(css: string, token: string): string {
    const match = new RegExp(`${token}:\\s*([^;]+);`).exec(css);
    expect(match, `${token} not declared`).not.toBeNull();
    return match![1].trim().toUpperCase();
  }

  const PAIRS: [string, string][] = [
    ["--ptec-dept-1", "--ptec-series-views"],
    ["--ptec-dept-2", "--ptec-series-visitors"],
    ["--ptec-dept-3", "--ptec-series-reader"],
    ["--ptec-dept-4", "--ptec-series-downloads"],
    ["--ptec-dept-1-ink", "--ptec-series-views-ink"],
    ["--ptec-dept-2-ink", "--ptec-series-visitors-ink"],
    ["--ptec-dept-3-ink", "--ptec-series-reader-ink"],
    ["--ptec-dept-4-ink", "--ptec-series-downloads-ink"],
  ];

  it("declares one department token per series token, with the same value", () => {
    for (const [dept, series] of PAIRS) {
      expect(value(globals, dept), `${dept} must equal ${series}`).toBe(
        value(admin, series).replace(/\s+\/\*.*$/, "").trim(),
      );
    }
  });

  it("declares exactly as many hues as the code cycles through", () => {
    const declared = globals.match(/--ptec-dept-\d+:/g) ?? [];
    expect(declared.length).toBe(DEPARTMENT_ACCENTS);
  });

  it("re-derives the dark ink step from the same hue instead of adding a fifth value", () => {
    const darkBlock = globals.slice(globals.indexOf(":root.dark {"));
    for (const step of [1, 2, 3, 4]) {
      expect(darkBlock).toContain(
        `--ptec-dept-${step}-ink: color-mix(in oklab, var(--ptec-dept-${step})`,
      );
    }
  });
});
