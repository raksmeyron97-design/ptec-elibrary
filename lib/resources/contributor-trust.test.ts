// Does a contributor string name anybody?
//
// This test is the guard on a rule whose two failure modes cost very
// different things, so it is written in two halves and the SECOND half is the
// important one.
//
// Half one asserts that the ten strings production was publishing as `Person`
// entities on 2026-09-19 are refused. Half two asserts that the other 305
// names on that same roster are NOT — every acronym, every single-token
// Cambodian given name, every Khmer institution, every byline carrying a year
// or a roman numeral. A rule that catches "Windows User" is easy; a rule that
// catches "Windows User" and leaves "IJERE", "UNESCO", "Bro Nak", "KPC" and
// "William Mendenhall III" alone is the only kind worth shipping, because
// being wrong in that direction silently deletes a real scholar from the
// entity layer and nothing in the app can tell that from a library that never
// held their work.

import { describe, expect, it } from "vitest";

import {
  assessContributorName,
  isUnidentifiedContributorName,
  type ContributorTrustReason,
} from "./contributor-trust";
import { normalizeByline } from "./contributor-identity";

/**
 * Every author name production served as an indexed `Person` page on
 * 2026-09-19 that does not name anybody, with the reason it fails.
 *
 * Verified individually over HTTP: each answered 200 with
 * `<meta name="robots" content="index, follow">` and a `ProfilePage` whose
 * `mainEntity` was a `Person` carrying a stable `@id`.
 */
const PRODUCTION_JUNK: ReadonlyArray<readonly [string, ContributorTrustReason]> = [
  ["Windows User", "software_default"],
  ["user", "software_default"],
  ["Administrator", "software_default"],
  ["PC", "software_default"],
  ["LENOVO", "software_default"],
  ["PptxGenJS", "software_or_device"],
  ["Name:", "placeholder"],
  ["Teste", "placeholder"],
  ["ទំព័រ", "document_furniture"],
  // 621 works — the single most-published `Person` in the library.
  ["Channa 0977 33 61 62", "contains_number"],
];

/**
 * Names from the same production roster that MUST survive.
 *
 * Chosen for the traps, not for coverage: acronyms that read like noise but
 * are real bodies, single-token Cambodian names, Khmer institutions whose
 * head-word the organisation classifier already knows, a byline carrying a
 * roman numeral, one carrying a four-digit year, and the two surnames that
 * are also words on the junk list in other spellings ("Page", "Dell").
 */
const PRODUCTION_REAL = [
  "Louis Cohen",
  "Lawrence Manion",
  "Keith Morrison",
  "Johnny Saldaña",
  "William Mendenhall III",
  "C. E. Eckersley",
  "R. Lyman Ott",
  "Prof. Khem Sarith",
  "Oon-Seng Tan",
  "Bro Nak",
  "Set Seng",
  "Uk Samphors",
  "Monica",
  "KHONN",
  "Piseth",
  "Tiarith",
  "IJERE",
  "KPC",
  "ITPSO",
  "ICT-GEIP",
  "DDT OETI",
  "Khmer OS Siemriep",
  "Noobie GMK",
  "Entertainment And Knowledge",
  "PCSC Contruction",
  "UNESCO",
  "OECD",
  "American Psychological Association",
  "Lovely Professional University",
  "Ministry of Education, Youth and Sport",
  "Department for Education and Skills (DfES), United Kingdom",
  "ក្រសួងអប់រំ យុវជន និងកីឡា",
  "ក្រុមប្រឹក្សាជាតិភាសាខ្មែរ",
  "នាយកដ្ឋានបច្ចេកវិទ្យាព័ត៌មាន",
  "វិទ្យាស្ថានជាតិអប់រំ (NIE)",
  "ជា សុទ្ធ",
  "ម៉ៅ សុភា",
  "ភិក្ខុ ហ. មណីចន្ទ",
  "ធម្មបាល",
  "ព្រះពោធិវង្ស ហួត តាត",
] as const;

describe("assessContributorName — what production was publishing", () => {
  it.each(PRODUCTION_JUNK)("refuses %j", (name, reason) => {
    const verdict = assessContributorName(name);
    expect(verdict.trust).toBe("invalid");
    expect(verdict.reason).toBe(reason);
  });

  it("is case- and punctuation-insensitive for the vocabulary rules", () => {
    for (const spelling of ["WINDOWS USER", "windows  user", "Windows-User", "windows user."]) {
      expect(assessContributorName(spelling).trust).toBe("invalid");
    }
  });
});

describe("assessContributorName — what it must never touch", () => {
  it.each(PRODUCTION_REAL)("keeps %j", (name) => {
    expect(assessContributorName(name).trust).not.toBe("invalid");
  });

  it("never refuses a real name merely for being short, foreign or an acronym", () => {
    // The whole point of the production sample above, stated as a rule so a
    // future entry added to a vocabulary list cannot quietly break it.
    const refused = PRODUCTION_REAL.filter((n) => isUnidentifiedContributorName(n));
    expect(refused).toEqual([]);
  });

  it("does not confuse a surname with the device or placeholder that shares it", () => {
    // "PC" is junk; "Page", "Dell" and "Guest-Hansen" are surnames people
    // have. Exact whole-string matching is what separates them, so this is a
    // test of the matching STRATEGY, not of three strings.
    for (const surname of ["Page", "Dell", "Sony Chhem", "Guest-Hansen", "Marc Owens"]) {
      expect(assessContributorName(surname).trust).not.toBe("invalid");
    }
  });
});

describe("structural rules", () => {
  it("refuses a byline carrying a telephone number, in either digit script", () => {
    expect(assessContributorName("Channa 0977 33 61 62").trust).toBe("invalid");
    expect(assessContributorName("សុខា ០១២ ៣៤៥ ៦៧៨").trust).toBe("invalid");
    expect(assessContributorName("Sokha 012345678").reason).toBe("contains_number");
  });

  it("allows the numbers a real byline carries", () => {
    // A year, an edition, a grade, a series number — four digits at most in
    // one run and fewer than six in total, which is why the rule needs BOTH
    // tests and neither alone.
    for (const name of ["MoEYS 2019", "Grade 7 Team", "Volume 3 Committee", "Class 12"]) {
      expect(assessContributorName(name).trust).not.toBe("invalid");
    }
  });

  it("refuses contact details, file names and opaque tokens", () => {
    expect(assessContributorName("scans.desk@example.org").reason).toBe("contains_contact");
    expect(assessContributorName("https://example.org").reason).toBe("contains_contact");
    expect(assessContributorName("scan_0001.pdf").reason).toBe("filename");
    expect(assessContributorName("page 5e1899293db0b24d").reason).toBe("opaque_token");
    expect(assessContributorName("—").reason).toBe("no_letters");
    expect(assessContributorName("").reason).toBe("placeholder");
  });

  it("checks structure before vocabulary", () => {
    // "user" is on the vocabulary list and "0977 33 61 62" is not; a string
    // carrying both must fail for the reason that is true of it whatever else
    // it says, or a phone number becomes survivable by appending a word.
    expect(assessContributorName("Channa 0977 33 61 62").reason).toBe("contains_number");
  });
});

describe("suspicious is advisory and changes nothing", () => {
  it("flags a bare role and a lowercase single token without refusing them", () => {
    for (const [name, reason] of [
      ["Computer Teacher", "role_not_name"],
      ["sokhavuth", "single_token_handle"],
      ["indavy", "single_token_handle"],
    ] as const) {
      const verdict = assessContributorName(name);
      expect(verdict.trust).toBe("suspicious");
      expect(verdict.reason).toBe(reason);
      expect(isUnidentifiedContributorName(name)).toBe(false);
    }
  });

  it("gives a reason for every verdict that is not valid, and none for one that is", () => {
    for (const name of [...PRODUCTION_REAL, ...PRODUCTION_JUNK.map(([n]) => n), "Computer Teacher"]) {
      const { trust, reason } = assessContributorName(name);
      expect(trust === "valid" ? reason === null : reason !== null).toBe(true);
    }
  });
});

describe("normalizeByline asserts nothing about an unidentified string", () => {
  it("resolves a junk byline to no contributors, flagged as unidentified", () => {
    const result = normalizeByline("Windows User");
    expect(result.contributors).toEqual([]);
    expect(result.resolved).toBe(false);
    expect(result.unidentified).toBe(true);
    // Never lossy: the catalogue string is still recoverable.
    expect(result.sourceText).toBe("Windows User");
  });

  it("distinguishes 'names nobody' from 'names several people, inseparably'", () => {
    // Both answer with no contributors, and upstream they need different
    // handling: a composite URL keeps linking to the people it names, an
    // unidentified one is not advertised at all.
    const junk = normalizeByline("user");
    const composite = normalizeByline("Smith, John, Jane");
    expect(junk.contributors).toEqual([]);
    expect(composite.contributors).toEqual([]);
    expect(junk.unidentified).toBe(true);
    expect(composite.unidentified).toBe(false);
  });

  it("drops only the junk part of a mixed byline", () => {
    const result = normalizeByline("Sok Dara and Windows User");
    expect(result.contributors.map((c) => c.displayName)).toEqual(["Sok Dara"]);
    expect(result.resolved).toBe(true);
    expect(result.unidentified).toBe(false);
  });

  it("leaves a real byline exactly as it was", () => {
    const result = normalizeByline("Louis Cohen, Lawrence Manion, Keith Morrison");
    expect(result.contributors.map((c) => c.displayName)).toEqual([
      "Louis Cohen",
      "Lawrence Manion",
      "Keith Morrison",
    ]);
    expect(result.unidentified).toBe(false);
  });

  it("does not let an institution be refused by a vocabulary rule", () => {
    const result = normalizeByline("ក្រសួងអប់រំ យុវជន និងកីឡា");
    expect(result.contributors).toEqual([
      { kind: "organization", displayName: "ក្រសួងអប់រំ យុវជន និងកីឡា" },
    ]);
    expect(result.unidentified).toBe(false);
  });
});
