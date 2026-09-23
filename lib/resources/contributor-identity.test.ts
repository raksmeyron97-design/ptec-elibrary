import { describe, expect, it } from "vitest";

import {
  classifyName,
  extractRole,
  isOwnInstitution,
  looksLikeOrganization,
  normalizeByline,
  normalizeBylines,
  splitByline,
} from "@/lib/resources/contributor-identity";
import type { OrgIdentity } from "@/lib/system-settings/org-identity";

// A fixture identity, not the real institution: the published name lives in
// System Settings and must not be copied into source.
const ORG = {
  institutionName: "Example Teacher Education College",
  institutionNameKm: "វិទ្យាល័យគរុកោសល្យគំរូ",
  abbreviation: "ETEC",
} as unknown as OrgIdentity;

const names = (raw: string, org?: OrgIdentity) =>
  normalizeByline(raw, org).contributors.map((c) => `${c.kind}:${c.displayName}`);

describe("§15 byline matrix — English", () => {
  it.each([
    ["John Smith", ["person:John Smith"]],
    ["John Smith, Jane Doe", ["person:John Smith", "person:Jane Doe"]],
    ["John Smith and Jane Doe", ["person:John Smith", "person:Jane Doe"]],
    ["John Smith & Jane Doe", ["person:John Smith", "person:Jane Doe"]],
    ["John Smith; Jane Doe", ["person:John Smith", "person:Jane Doe"]],
    ["John Smith / Jane Doe", ["person:John Smith", "person:Jane Doe"]],
  ])("%s", (raw, expected) => {
    expect(names(raw, ORG)).toEqual(expected);
  });

  it("an inverted single name is NOT two people", () => {
    // "Smith, John" is one person written surname-first. Splitting invents a
    // second human, which is worse than recording a less granular truth.
    expect(splitByline("Smith, John")).toEqual([]);
    expect(normalizeByline("Smith, John", ORG).contributors).toEqual([]);
    expect(normalizeByline("Smith, John", ORG).resolved).toBe(false);
  });

  it("a real production three-editor byline resolves to three people", () => {
    expect(names("Bert P.M. Creemers, Leonidas Kyriakides, Pam Sammons (Editors)", ORG)).toEqual([
      "person:Bert P.M. Creemers",
      "person:Leonidas Kyriakides",
      "person:Pam Sammons",
    ]);
  });

  it("an institution whose own name contains delimiters stays ONE organization", () => {
    expect(names("Ministry of Education, Youth and Sport", ORG)).toEqual([
      "organization:Ministry of Education, Youth and Sport",
    ]);
    expect(names("University of Example, Faculty of Education", ORG)).toEqual([
      "organization:University of Example, Faculty of Education",
    ]);
  });
});

describe("§15 byline matrix — Khmer", () => {
  it.each([
    ["ក្រសួងអប់រំ យុវជន និងកីឡា", "organization"],   // a ministry
    ["សាកលវិទ្យាល័យ គំរូ", "organization"],           // a university
    ["វិទ្យាស្ថានជាតិអប់រំ", "organization"],          // an institute
    ["មជ្ឈមណ្ឌលស្រាវជ្រាវ", "organization"],          // a centre
    ["អង្គការមិនមែនរដ្ឋាភិបាល", "organization"],      // an NGO
  ])("%s is an organization", (raw, kind) => {
    expect(classifyName(raw, ORG)).toBe(kind);
  });

  it.each([
    // Every one of these was typing a REAL institution as a person until the
    // 2026-09-13 vocabulary audit over all 156 production expressions. They are
    // regression cases, not hypotheses.
    ["ក្រុមប្រឹក្សាជាតិភាសាខ្មែរ", "national council"],
    ["វិទ្យាល័យ ព្រែកលៀប", "high school"],
    ["រាជរដ្ឋាភិបាលកម្ពុជា", "royal government"],
    ["ពុទ្ធសាសនបណ្ឌិត្យ", "buddhist institute"],
    ["ដេប៉ាតឺម៉ង់ស្រាវជ្រាវគរុកោសល្យជំនាន់ថ្មី", "department"],
    ["សាលាភូមិន្ទរដ្ឋបាល", "royal school of administration"],
  ])("%s (%s) is an organization", (raw) => {
    expect(looksLikeOrganization(raw)).toBe(true);
  });

  it("a Khmer personal name is a person, not an organization", () => {
    expect(looksLikeOrganization("ឡុង សុវណ្ណារ៉ា")).toBe(false);
    expect(classifyName("ឡុង សុវណ្ណារ៉ា", ORG)).toBe("person");
  });

  it("splits a Khmer two-name byline on an unambiguous delimiter", () => {
    expect(names("ឡុង សុវណ្ណារ៉ា; ចាន់ សុភា", ORG)).toEqual([
      "person:ឡុង សុវណ្ណារ៉ា",
      "person:ចាន់ សុភា",
    ]);
  });

  // ── " និង " — Khmer "and" ──────────────────────────────────────────────
  //
  // This test previously pinned the OPPOSITE rule, for a reason that was
  // right about the mechanism and is still honoured: parseAuthorNames()
  // mirrors migration 0105's SQL, and teaching one side a delimiter the other
  // lacks is how the app and the backfill start disagreeing about where a
  // name ends. So the conjunction was NOT added there. splitByline() rewrites
  // it to a delimiter that splitter already knows, and splitByline is the app's
  // own safe splitter, which the backfill never ran.
  //
  // What changed is the evidence. Measured against production's /authors
  // roster on 2026-09-23 (265 names), exactly ONE name changes classification
  // under this rule, and it is a real two-person byline published as one
  // fabricated `Person`. Three more of the same shape are PTEC Library Press's
  // own ISBN-registered books.
  describe("the Khmer conjunction splits people and never institutions", () => {
    it("splits two people written with និង", () => {
      expect(names("ឡុង សុវណ្ណារ៉ា និង ចាន់ សុភា", ORG)).toEqual([
        "person:ឡុង សុវណ្ណារ៉ា",
        "person:ចាន់ សុភា",
      ]);
      // The four production bylines this exists for.
      expect(names("យ៉េង ធី និង នយ យ៉េហ៊ាង", ORG)).toHaveLength(2);
      expect(names("លុក សូលីនដា និង ជន សុគន្ធារី", ORG)).toHaveLength(2);
      expect(names("សៀង គឹមស៊្រុន និង ឈាង សុភា", ORG)).toHaveLength(2);
    });

    it("leaves a ministry whose own name contains និង as one organisation", () => {
      // "Ministry of Education, Youth and Sport" — one body. Two guards catch
      // it independently: the whole-string organisation check runs BEFORE any
      // split, and the conjunction here carries no trailing space.
      expect(names("ក្រសួងអប់រំ យុវជន និងកីឡា", ORG)).toEqual([
        "organization:ក្រសួងអប់រំ យុវជន និងកីឡា",
      ]);
      expect(names("ក្រសួងសាធារណការ និងដឹកជញ្ជូន", ORG)).toHaveLength(1);
      expect(names("ក្រសួងរៀបចំដែនដី នគរូបនីយកម្ម និងសំណង់", ORG)).toHaveLength(1);
      expect(names("នាយកដ្ឋានបឋមសិក្សា ក្រសួងអប់រំ យុវជន និងកីឡា", ORG)).toHaveLength(1);
    });

    it("leaves a SPACED និង alone when the whole string is an institution", () => {
      // Two high schools, joined by a spaced conjunction — the case where the
      // delimiter would fire if the organisation check did not run first. The
      // catalogue recorded one corporate credit and that stays the answer.
      expect(names("វិទ្យាល័យ ព្រែកលៀប និង វិទ្យាល័យ ព្រះស៊ីសុវត្ថិ (NGS)", ORG)).toEqual([
        "organization:វិទ្យាល័យ ព្រែកលៀប និង វិទ្យាល័យ ព្រះស៊ីសុវត្ថិ (NGS)",
      ]);
    });

    it("requires whitespace on BOTH sides", () => {
      // Khmer writes no spaces between words, so និង sits inside compounds.
      // Only the free-standing conjunction separates names.
      expect(splitByline("ឡុង សុវណ្ណារ៉ានិងចាន់ សុភា")).toEqual([]);
    });

    it("does not teach parseAuthorNames the delimiter", async () => {
      // The 0105 mirror. If this ever splits, the app and the backfill have
      // started disagreeing about where a name ends.
      const { parseAuthorNames } = await import("@/lib/resources/author-names");
      expect(parseAuthorNames("ឡុង សុវណ្ណារ៉ា និង ចាន់ សុភា")).toEqual([
        "ឡុង សុវណ្ណារ៉ា និង ចាន់ សុភា",
      ]);
    });
  });

  // ── Khmer institutional head-words ────────────────────────────────────
  describe("Khmer institutions are organisations, not people", () => {
    it.each([
      ["សាលាឌីជីថល", "digital school — 40 books, published as a Person"],
      ["សាលា អេឌូផ្លើស Edu Plus", "a school — 4 books"],
      [
        "ការិយាល័យអប់រំ យុវជន និងកីឡា នៃរដ្ឋបាលស្រុកសំឡូត",
        "a district education office — 12 books",
      ],
    ])("%s (%s)", (raw) => {
      expect(looksLikeOrganization(raw)).toBe(true);
      expect(names(raw, ORG)).toHaveLength(1);
      expect(names(raw, ORG)[0].startsWith("organization:")).toBe(true);
    });

    it("matches សាលា only at the START of the name", () => {
      // Two syllables of ordinary vocabulary, matched as a substring like the
      // rest of the Khmer list would retype a human as an institution on an
      // interior coincidence. A Khmer institution LEADS with its head-word.
      expect(looksLikeOrganization("ឡុង សាលា")).toBe(false);
      expect(classifyName("ឡុង សាលា", ORG)).toBe("person");
    });
  });
});

describe("§11 role is extracted, not destroyed", () => {
  it.each([
    ["John Smith (Editor)", "John Smith", "editor"],
    ["John Smith (Editors)", "John Smith", "editor"],
    ["John Smith, Editor", "John Smith", "editor"],
    ["John Smith (Ed.)", "John Smith", "editor"],
    ["John Smith (Eds.)", "John Smith", "editor"],
    ["John Smith (Translator)", "John Smith", "translator"],
    ["John Smith (Trans.)", "John Smith", "translator"],
    ["John Smith (Compiler)", "John Smith", "compiler"],
  ])("%s → %s as %s", (raw, name, role) => {
    expect(extractRole(raw)).toEqual({ name, role });
  });

  it("defaults to author when the byline states no role", () => {
    expect(extractRole("John Smith").role).toBe("author");
    expect(normalizeByline("John Smith, Jane Doe", ORG).role).toBe("author");
  });

  it("carries the role onto every contributor the byline names", () => {
    const out = normalizeByline("John Smith, Jane Doe (Editors)", ORG);
    expect(out.role).toBe("editor");
    expect(out.contributors).toHaveLength(2);
  });

  it("does not eat a name that merely contains those letters", () => {
    expect(extractRole("Edward Edmonds").name).toBe("Edward Edmonds");
    expect(extractRole("Jane Trantham").name).toBe("Jane Trantham");
  });

  it("never lets a role marker consume the whole byline", () => {
    // "Editors" alone is not a name — but neither is "". Keep what we were
    // given rather than resolving to nothing on a malformed record.
    expect(extractRole("Editors").name).toBe("Editors");
  });
});

describe("§13 institution matching uses published identity only", () => {
  it("matches the English name, the Khmer name and the abbreviation", () => {
    for (const n of [ORG.institutionName, ORG.institutionNameKm, ORG.abbreviation]) {
      expect(isOwnInstitution(n, ORG)).toBe(true);
      expect(classifyName(n, ORG)).toBe("institution");
    }
  });

  it("is insensitive to case and punctuation, but not to different words", () => {
    expect(isOwnInstitution("example teacher education college.", ORG)).toBe(true);
    expect(isOwnInstitution("Example Teacher Education Collage", ORG)).toBe(false);
  });

  it("invents no aliases — a near miss stays unmatched", () => {
    expect(isOwnInstitution("Example College", ORG)).toBe(false);
    expect(isOwnInstitution("Example Teacher Education", ORG)).toBe(false);
  });

  it("without an OrgIdentity, nothing is an institution", () => {
    expect(classifyName(ORG.institutionName)).toBe("organization");
  });
});

describe("§12 organization precision over recall", () => {
  it("does not retype a person whose surname reads institutional", () => {
    for (const n of ["John Press", "Mary Board", "Alan Fund", "Ruth Network", "Paul Office"]) {
      expect(looksLikeOrganization(n), n).toBe(false);
    }
  });

  it("leaves real Khmer PERSONAL names from production alone", () => {
    // Sampled from the 156 production contributor expressions. Widening the
    // Khmer vocabulary must never start catching these: a false positive here
    // retypes a real person as an institution, which is the same untrue claim
    // this module exists to remove, pointed the other way.
    for (const n of [
      "ជា សុទ្ធ", "ម៉ៅ សុភា", "ហង់ ជួន ណារ៉ុន", "ឡុង រក្សា",
      "ព្រះពោធិវង្ស ស៊ូ ហាយ", "ភិក្ខុ ហ. មណីចន្ទ", "អែម ចរយា", "ធម្មបាល",
    ]) {
      expect(looksLikeOrganization(n), n).toBe(false);
    }
  });
});

describe("§9 the contract itself", () => {
  it("always keeps the source text recoverable", () => {
    const raw = "  Smith,   John  ";
    const out = normalizeByline(raw, ORG);
    expect(out.sourceText).toBe("Smith, John");
    expect(out.contributors).toEqual([]);
  });

  it("is deterministic", () => {
    const a = normalizeByline("John Smith, Jane Doe (Editors)", ORG);
    const b = normalizeByline("John Smith, Jane Doe (Editors)", ORG);
    expect(a).toEqual(b);
  });

  it.each([null, undefined, "", "   "])("resolves %s to nothing", (raw) => {
    const out = normalizeByline(raw, ORG);
    expect(out.contributors).toEqual([]);
    expect(out.resolved).toBe(false);
  });

  it("maps a list of bylines in order", () => {
    expect(normalizeBylines(["John Smith", "UNESCO"], ORG).map((b) => b.contributors[0].kind))
      .toEqual(["person", "organization"]);
  });
});
