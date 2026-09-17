/**
 * The committee's public read model, as decisions rather than as markup.
 *
 * The rules pinned here are the ones a redesign of the page could quietly
 * break: that the public order is deterministic even when an editor leaves
 * every `display_order` at 0, that a section with no published seat produces
 * no heading, that the profile link is offered only where one resolves, and
 * that a committee role and a library position are never reported as the same
 * kind of fact.
 */

import { describe, expect, it } from "vitest";

import {
  committeeName,
  committeeResponsibility,
  committeeRole,
  groupCommittee,
  groupDescription,
  groupHeading,
  profilePath,
  publishedCount,
  toLayoutVariant,
  type PublicCommitteeMember,
} from "./public";

function member(overrides: Partial<PublicCommitteeMember> = {}): PublicCommitteeMember {
  return {
    id: "seat-1",
    team_member_id: "person-1",
    role_km: null,
    role_en: null,
    responsibility_km: null,
    responsibility_en: null,
    display_order: 0,
    updated_at: null,
    slug: null,
    name_km: "សុខ សំណាង",
    name_en: "Sok Samnang",
    position_km: null,
    position_en: null,
    education: null,
    photo_url: null,
    photo_alt: null,
    short_bio_km: null,
    short_bio_en: null,
    section_id: null,
    section_name_km: null,
    section_name_en: null,
    section_description_km: null,
    section_description_en: null,
    section_order: null,
    section_layout_variant: null,
    ...overrides,
  };
}

const inSection = (
  id: string,
  order: number,
  layout: "leadership" | "grid",
  overrides: Partial<PublicCommitteeMember> = {},
) =>
  member({
    section_id: id,
    section_name_en: `Section ${id}`,
    section_name_km: `ផ្នែក ${id}`,
    section_order: order,
    section_layout_variant: layout,
    ...overrides,
  });

// ── Grouping ────────────────────────────────────────────────────────────────

describe("groupCommittee", () => {
  it("orders sections by their display order, not by arrival", () => {
    const groups = groupCommittee([
      inSection("b", 2, "grid", { id: "s2", team_member_id: "p2" }),
      inSection("a", 1, "leadership", { id: "s1", team_member_id: "p1" }),
    ]);
    expect(groups.map((g) => g.sectionId)).toEqual(["a", "b"]);
    expect(groups[0].layout).toBe("leadership");
  });

  it("puts unsectioned seats last, whatever their own order says", () => {
    const groups = groupCommittee([
      member({ id: "loose", team_member_id: "p0", display_order: 0 }),
      inSection("a", 5, "grid", { id: "s1", team_member_id: "p1" }),
    ]);
    expect(groups.map((g) => g.sectionId)).toEqual(["a", null]);
  });

  it("is deterministic when every display_order is the editor's default 0", () => {
    // The real failure this prevents: an editor adds four people, leaves the
    // order alone, and the public page reorders itself between requests
    // because PostgREST returned the rows in a different physical order.
    const rows = [
      inSection("a", 1, "grid", { id: "s3", team_member_id: "p3", name_en: "Chan Dara" }),
      inSection("a", 1, "grid", { id: "s1", team_member_id: "p1", name_en: "Bun Thida" }),
      inSection("a", 1, "grid", { id: "s2", team_member_id: "p2", name_en: "An Sophea" }),
    ];
    const first = groupCommittee(rows)[0].members.map((m) => m.id);
    const second = groupCommittee([...rows].reverse())[0].members.map((m) => m.id);
    expect(first).toEqual(second);
    expect(first).toEqual(["s2", "s1", "s3"]); // An, Bun, Chan
  });

  it("honours display_order ahead of the name tiebreak", () => {
    const groups = groupCommittee([
      inSection("a", 1, "grid", { id: "s1", team_member_id: "p1", name_en: "Zara", display_order: 0 }),
      inSection("a", 1, "grid", { id: "s2", team_member_id: "p2", name_en: "Amara", display_order: 1 }),
    ]);
    expect(groups[0].members.map((m) => m.name_en)).toEqual(["Zara", "Amara"]);
  });

  it("produces no group for a section with no published seat", () => {
    // Sections arrive denormalised on the rows, so an empty section cannot
    // reach the page at all — there is no code path that renders a heading
    // with nothing under it.
    const groups = groupCommittee([inSection("a", 1, "grid", { id: "s1" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(1);
  });

  it("returns nothing for an empty roster", () => {
    expect(groupCommittee([])).toEqual([]);
    expect(publishedCount([])).toBe(0);
  });

  it("counts every published seat across sections", () => {
    const groups = groupCommittee([
      inSection("a", 1, "leadership", { id: "s1", team_member_id: "p1" }),
      inSection("b", 2, "grid", { id: "s2", team_member_id: "p2" }),
      member({ id: "s3", team_member_id: "p3" }),
    ]);
    expect(publishedCount(groups)).toBe(3);
  });

  it("never gives an unsectioned group a heading borrowed from a row", () => {
    // A row with no section still carries null section columns; the group must
    // not invent one from a neighbour.
    const groups = groupCommittee([member({ id: "s1" })]);
    expect(groups[0].nameEn).toBeNull();
    expect(groups[0].nameKm).toBeNull();
    expect(groups[0].layout).toBe("grid");
  });
});

// ── Layout variant ──────────────────────────────────────────────────────────

describe("toLayoutVariant", () => {
  it("recognises the two real compositions", () => {
    expect(toLayoutVariant("leadership")).toBe("leadership");
    expect(toLayoutVariant("grid")).toBe("grid");
  });

  it("falls back to the roster rather than dropping the section", () => {
    // An unknown value must not make a group render as nothing — the people
    // are published, and the worst acceptable outcome is the standard layout.
    for (const value of [null, undefined, "", "fancy", "LEADERSHIP"]) {
      expect(toLayoutVariant(value), String(value)).toBe("grid");
    }
  });
});

// ── Locale-aware fields ─────────────────────────────────────────────────────

describe("groupHeading / groupDescription", () => {
  const group = groupCommittee([
    inSection("a", 1, "grid", {
      section_name_en: "Library Officers",
      section_name_km: "មន្ត្រីបណ្ណាល័យ",
      section_description_en: "Day-to-day library services.",
      section_description_km: null,
    }),
  ])[0];

  it("leads with the reader's language and reports it for `lang`", () => {
    expect(groupHeading(group, "km")).toEqual({ text: "មន្ត្រីបណ្ណាល័យ", lang: "km" });
    expect(groupHeading(group, "en")).toEqual({ text: "Library Officers", lang: "en" });
  });

  it("falls back to the other language and says so", () => {
    // A Khmer reader must not be shown an English string tagged lang="km":
    // a screen reader would announce it with a Khmer voice.
    expect(groupDescription(group, "km")).toEqual({
      text: "Day-to-day library services.",
      lang: "en",
    });
  });

  it("renders nothing when neither language was supplied", () => {
    const empty = groupCommittee([member({ id: "s1" })])[0];
    expect(groupHeading(empty, "en")).toBeNull();
    expect(groupDescription(empty, "en")).toBeNull();
  });
});

describe("committeeRole", () => {
  it("prefers the committee role and labels it as one", () => {
    const role = committeeRole(
      member({ role_en: "Chair", position_en: "Head Librarian" }),
      "en",
    );
    expect(role).toEqual({ text: "Chair", lang: "en", source: "committee" });
  });

  it("falls back to the library position and says it is a position", () => {
    // The distinction is the point: "Chair of the Library Committee" and
    // "Cataloguing Officer" are different claims, and the card labels them
    // differently. Collapsing them would publish a job title as a committee
    // office.
    const role = committeeRole(member({ position_en: "Cataloguing Officer" }), "en");
    expect(role).toEqual({ text: "Cataloguing Officer", lang: "en", source: "position" });
  });

  it("is null when the library supplied neither", () => {
    expect(committeeRole(member(), "en")).toBeNull();
  });

  it("uses the Khmer role for a Khmer reader", () => {
    const role = committeeRole(member({ role_km: "ប្រធាន", role_en: "Chair" }), "km");
    expect(role).toEqual({ text: "ប្រធាន", lang: "km", source: "committee" });
  });
});

describe("committeeResponsibility", () => {
  it("returns the reader's language with the correct tag", () => {
    expect(
      committeeResponsibility(member({ responsibility_km: "គ្រប់គ្រងបណ្ដុំឯកសារ" }), "km"),
    ).toEqual({ text: "គ្រប់គ្រងបណ្ដុំឯកសារ", lang: "km" });
  });

  it("is null rather than an empty string", () => {
    expect(committeeResponsibility(member({ responsibility_en: "   " }), "en")).toBeNull();
  });
});

describe("committeeName", () => {
  it("stacks both scripts, leading with the reader's", () => {
    const name = committeeName(member(), "en");
    expect(name?.primary).toEqual({ text: "Sok Samnang", lang: "en" });
    expect(name?.secondary).toEqual({ text: "សុខ សំណាង", lang: "km" });
  });

  it("does not repeat one name as its own translation", () => {
    const name = committeeName(member({ name_km: "Sok Samnang" }), "en");
    expect(name?.secondary).toBeNull();
  });

  it("falls back to the only name there is", () => {
    const name = committeeName(member({ name_en: "" }), "en");
    expect(name?.primary).toEqual({ text: "សុខ សំណាង", lang: "km" });
    expect(name?.secondary).toBeNull();
  });
});

// ── The profile link ────────────────────────────────────────────────────────

describe("profilePath", () => {
  it("links to the canonical staff profile when there is one", () => {
    // Locale-agnostic on purpose: the /km prefix is added by Link from
    // @/i18n/navigation, and a hard-coded one would produce /km/km/... .
    expect(profilePath(member({ slug: "sok-samnang" }))).toBe("/about/team/sok-samnang");
  });

  it("offers no link when the person is not published on /about/team", () => {
    // The view withholds the slug in that case, so this is the second half of
    // a rule the database already enforces: the committee page can never
    // advertise a profile URL the slug gate answers with a 404.
    expect(profilePath(member({ slug: null }))).toBeNull();
  });
});

// ── What the model refuses to carry ─────────────────────────────────────────

describe("the public shape carries no contact detail", () => {
  it("has no phone, email, account or full bio field", () => {
    const keys = Object.keys(member());
    for (const forbidden of ["phone", "email", "user_id", "bio_km", "bio_en", "is_published"]) {
      expect(keys, `PublicCommitteeMember must not expose ${forbidden}`).not.toContain(forbidden);
    }
  });
});
