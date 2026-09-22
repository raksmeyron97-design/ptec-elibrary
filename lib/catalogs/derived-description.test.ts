// lib/catalogs/derived-description.test.ts
//
// The gate that was passing template text.
//
// Every "live" string below was read from https://library.ptec.edu.kh on
// 2026-09-21 by fetching the page and taking its `<meta name="description">`.
// The shapes marked "sheet" were counted in the staged import workbooks.

import { describe, it, expect } from "vitest";
import {
  describeNovelty,
  isDerivedDescription,
  MIN_NOVEL_DESCRIPTION_CHARS,
  MIN_DERIVED_SHARE,
} from "./derived-description";
import { assessCatalogIndexability, catalogRobots } from "./indexability";

/**
 * The three records whose pages were fetched. `description` is verbatim;
 * the other fields are the row's own, from the import sheet.
 */
const LIVE = [
  {
    label: "Baby-Sitters Club (English template)",
    description: "Social sciences by Martin Ann M. DDC call number: 300 MAR.",
    title: "#3 THE BABY-SITTERS CLUB The Truth About Stacey",
    author: "Martin Ann M.",
    category: "300 វិទ្យាសាស្ត្រសង្គម",
    department: "Department of Social Sciences",
    ddc: "300 MAR",
  },
  {
    label: "10 Mindframes (English template)",
    description: "Education and pedagogy by Hattie John. DDC call number: 371.1 HAT.",
    title: "10 mindframes for visible learning : teaching for success",
    author: "Hattie John",
    category: "370 អប់រំ និងគរុកោសល្យ",
    department: "Department of Pedagogy",
    ddc: "371.1 HAT",
  },
  {
    label: "100 វិទ្យាសាស្រ្ត (Khmer template)",
    description:
      "សៀវភៅក្នុងចំណាត់ថ្នាក់ ប្រលោមលោក។ និពន្ធដោយ គីម ថែខ្វាន់។ លេខរៀបចំតាមប្រព័ន្ធ DDC៖ ប.ល គីម។",
    title: "100 វិទ្យាសាស្រ្តអភិវឌ្ឍពិភពលោក 1",
    author: "គីម ថែខ្វាន់",
    category: "ប្រលោមលោក",
    department: null,
    ddc: "ប.ល គីម",
  },
] as const;

describe("a description that only restates the record", () => {
  it.each(LIVE.map((r) => [r.label, r] as const))(
    "is refused: %s",
    (_label, row) => {
      expect(isDerivedDescription(row)).toBe(true);
    },
  );

  // THE NEGATIVE CONTROL, and the reason this file exists. Each of these
  // strings is ≥ 40 characters, so the OLD gate — length alone — indexed
  // every one of them, and all six live records were `index, follow`.
  it.each(LIVE.map((r) => [r.label, r] as const))(
    "would have passed the old length-only gate: %s",
    (_label, row) => {
      expect(row.description.length).toBeGreaterThanOrEqual(40);
    },
  );

  it("takes the page out of the index and out of the sitemap", () => {
    for (const row of LIVE) {
      const v = assessCatalogIndexability(row);
      expect(v.visibility).toBe("noindex");
      expect(v.reason).toBe("derived-description");
      // Still crawlable: the record is a real holding on a real shelf.
      expect(catalogRobots(row).follow).toBe(true);
    }
  });
});

describe("a description that says something", () => {
  const REAL = [
    "A general survey of world scientific development, catalogued for the teacher reference shelf.",
    "Explains formative assessment with worked classroom examples, rubrics and low-stakes checks that fit a forty-minute lesson.",
    // Khmer prose must survive the Khmer connective list.
    "សៀវភៅណែនាំសម្រាប់គ្រូបង្រៀនអំពីវិធីសាស្ត្របង្រៀនគណិតវិទ្យាកម្រិតបឋមសិក្សា ដោយមានឧទាហរណ៍ជាក់ស្តែងនិងលំហាត់អនុវត្ត។",
  ];

  it.each(REAL)("survives and is indexed: %s", (description) => {
    const row = { ...LIVE[0], description };
    expect(isDerivedDescription(row)).toBe(false);
    expect(assessCatalogIndexability(row).visibility).toBe("index");
  });

  it("still counts a real sentence that happens to name the author", () => {
    // Mentioning the author is not the defect; saying ONLY the author is.
    const row = {
      ...LIVE[1],
      description:
        "Hattie John distils two decades of meta-analysis into ten habits of mind, each with classroom evidence and a self-check for teachers.",
    };
    expect(isDerivedDescription(row)).toBe(false);
  });
});

describe("the measurement, not just the verdict", () => {
  it("reports how far a row is from earning an index", () => {
    const v = describeNovelty(LIVE[0]);
    expect(v.novelChars).toBeLessThan(MIN_NOVEL_DESCRIPTION_CHARS);
    expect(v.derived).toBe(true);
  });

  it("counts letters, so punctuation and a call number are not content", () => {
    // What a Khmer template leaves behind once its own values go: "។ ។ ៖ ."
    const v = describeNovelty({
      description: "៖ ។ ។ . : 300 MAR",
      title: "T",
      author: "A",
      ddc: "300 MAR",
    });
    expect(v.novelChars).toBe(0);
  });

  it("an ABSENT description is not 'derived' — it is absent", () => {
    // Two different instructions to a librarian: "write one" vs "write a
    // real one". The indexability gate reports the first as `record-only`.
    expect(isDerivedDescription({ description: null, title: "T" })).toBe(false);
    expect(assessCatalogIndexability({ description: null, title: "T" }).reason).toBe(
      "record-only",
    );
  });
});

// ── The two signals, and why one is not enough ──────────────────────────────

describe("'derived' means the record accounted for it, not that it is short", () => {
  const ROW = {
    title: "Assessment for Learning",
    author: "Chan Sophea",
    category: "370 អប់រំ",
    department: "Department of Pedagogy",
    ddc: "371 CHA",
  };

  it("does not call a SHORT but independent sentence derived", () => {
    // Found by probing, not by reasoning: this 69-character Khmer sentence
    // shares nothing with its record, so NOTHING was stripped from it — and
    // the one-signal rule still called it derived, purely for landing one
    // letter under the floor. Shortness is the length gate's question.
    const description =
      "ណែនាំជាក់ស្តែងអំពីការវាយតម្លៃដើម្បីការរៀនសូត្រនៅក្នុងថ្នាក់រៀនកម្ពុជា។";
    const v = describeNovelty({ ...ROW, description });
    expect(v.novelChars).toBeLessThan(MIN_NOVEL_DESCRIPTION_CHARS);
    expect(v.accountedShare).toBeLessThan(MIN_DERIVED_SHARE);
    expect(v.derived).toBe(false);
  });

  it("a template is accounted for almost completely", () => {
    const v = describeNovelty({
      ...ROW,
      description: "Assessment for Learning by Chan Sophea. DDC call number: 371 CHA.",
    });
    expect(v.accountedShare).toBe(1);
    expect(v.derived).toBe(true);
  });

  it("a short sentence that reuses the title is not condemned for it", () => {
    const v = describeNovelty({
      ...ROW,
      description: "A practical guide to assessment for learning in Cambodian classrooms.",
    });
    expect(v.derived).toBe(false);
  });
});

describe("stripping a field word must not damage another word", () => {
  it("does not remove 'for' from inside 'information'", () => {
    // This was a real bug: substring removal took the middle out of
    // "information", which corrupted the category label so the label pass
    // could no longer match it — and 12 templates survived on the damage.
    const v = describeNovelty({
      description: "General knowledge and information science by Kumar Ranjit. DDC call number: 001.42 KUM.",
      title: "Research Methodology: A Step-by-Step Guide for Beginners",
      author: "Kumar Ranjit",
      category: "000 ចំណេះដឹងទូទៅ",
      ddc: "001.42 KUM",
    });
    expect(v.remainder).not.toContain("inmation");
    expect(v.derived).toBe(true);
  });
});

describe("the gate cannot be fooled by giving it nothing to compare against", () => {
  it("refuses a long description when no identity field was selected", () => {
    // Without the row's own values there is nothing to strip, so every
    // template would read as novel. Conservative in the same direction as
    // the rest of this module.
    const v = assessCatalogIndexability({
      description: "Social sciences by Martin Ann M. DDC call number: 300 MAR.",
    });
    expect(v.visibility).toBe("noindex");
    expect(v.reason).toBe("unchecked-description");
  });
});

// ── The importer never writes one ────────────────────────────────────────────

import { validateRow } from "@/lib/catalog-import";

describe("the import drops a derived description instead of storing it", () => {
  /** A row exactly as the staged PMB sheets hold it. */
  const PMB_ROW = {
    title: "#3 THE BABY-SITTERS CLUB The Truth About Stacey",
    author: "Martin Ann M.",
    category: "300 វិទ្យាសាស្ត្រសង្គម",
    department: "Department of Social Sciences",
    ddc: "300 MAR",
    language: "en",
    description: "Social sciences by Martin Ann M. DDC call number: 300 MAR.",
  };

  it("stores no description, and says why", () => {
    const r = validateRow(PMB_ROW, 2);
    expect(r.normalized?.description).toBeNull();
    expect(r.issues.map((i) => i.code)).toContain("DERIVED_DESCRIPTION");
  });

  it("warns — it never rejects the row", () => {
    // 13,429 real holdings must not be kept out of the catalogue over a
    // generated sentence.
    const r = validateRow(PMB_ROW, 2);
    const issue = r.issues.find((i) => i.code === "DERIVED_DESCRIPTION");
    expect(issue?.severity).toBe("warning");
    expect(r.issues.some((i) => i.severity === "error")).toBe(false);
  });

  it("keeps a real description", () => {
    const r = validateRow(
      {
        ...PMB_ROW,
        description:
          "Stacey's friends discover she has been keeping a secret about her health, and the club has to decide what to do about it.",
      },
      2,
    );
    expect(r.normalized?.description).toBeTruthy();
    expect(r.issues.map((i) => i.code)).not.toContain("DERIVED_DESCRIPTION");
  });

  it("leaves the author's filing form exactly as catalogued", () => {
    // Storage keeps "Surname, Given"; only the page reads it out.
    const r = validateRow({ ...PMB_ROW, author: "Martin, Ann M." }, 2);
    expect(r.normalized?.author).toBe("Martin, Ann M.");
  });
});
