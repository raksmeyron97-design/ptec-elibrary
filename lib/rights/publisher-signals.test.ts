import { describe, it, expect } from "vitest";
import {
  classifyRights,
  isbnPrefix8,
  reviewPriority,
  RIGHTS_CLASS_ORDER,
  titleScript,
  type RightsSignalInput,
} from "./publisher-signals";

const cls = (i: RightsSignalInput) => classifyRights(i).rightsClass;

describe("classifyRights — commercial evidence", () => {
  // Fixtures are SYNTHETIC bodies inside real registrant prefixes: the
  // prefix is the thing under test, and a real ISBN paired with a real title
  // would make this public test file a statement about what a particular
  // library holds. The shape is what matters — no publisher recorded, so the
  // ISBN is the only available signal, which is why the prefix table exists.
  it("flags a Pearson-registrant book from its ISBN alone", () => {
    const v = classifyRights({
      title: "A Textbook On Research Competencies",
      authors: ["A. Author", "B. Author"],
      isbn: "978-0-13-000000-0",
    });
    expect(v.rightsClass).toBe("commercial-likely");
    expect(v.reason).toContain("978013");
    expect(v.reason).toContain("Pearson");
  });

  it("flags a Wiley-registrant book from its ISBN alone", () => {
    const v = classifyRights({
      title: "An Introduction To Qualitative Methods",
      isbn: "978-1-118-00000-0",
    });
    expect(v.rightsClass).toBe("commercial-likely");
    expect(v.reason).toContain("Wiley");
  });

  it("flags a named commercial publisher even with no ISBN", () => {
    expect(cls({ title: "Research Methods in Education", publisher: "Routledge" })).toBe(
      "commercial-likely",
    );
    expect(cls({ title: "Any", publisher: "SAGE Publications Ltd" })).toBe("commercial-likely");
    expect(cls({ title: "Any", publisher: "Cengage Learning" })).toBe("commercial-likely");
  });

  it("reports the LONGEST matching prefix, not merely the first", () => {
    // 978-0-321 (Addison-Wesley) also starts with no shorter table entry, but
    // 978-0-07 vs 978-007xxxx is the shape that can collide. Assert the
    // specific registrant is named rather than a broader one.
    expect(classifyRights({ isbn: "9780321334879" }).reason).toContain("0-321");
    expect(classifyRights({ isbn: "9780073526270" }).reason).toContain("0-07");
  });

  it("reaches the table through a legacy ISBN-10", () => {
    // A pre-2007 ISBN-10 in the same registrant block. It only matches
    // because the shared normaliser widens it to a real ISBN-13 — a local
    // "prepend 978" would produce a 12-digit stem and silently miss every
    // pre-2007 textbook on the shelf.
    const v = classifyRights({ isbn: "0-13-000000-9" });
    expect(v.rightsClass).toBe("commercial-likely");
    expect(v.reason).toContain("Pearson");
  });
});

describe("classifyRights — open signals win outright (rule 1)", () => {
  // The guarantee the briefing states in as many words.
  it("NEVER classifies a Khmer MoEYS title as commercial", () => {
    const rows: RightsSignalInput[] = [
      { title: "សៀវភៅណែនាំគ្រូបង្រៀន គណិតវិទ្យា ថ្នាក់ទី៧", authors: ["ក្រសួងអប់រំ យុវជន និងកីឡា"] },
      { title: "កម្មវិធីសិក្សា", publisher: "ក្រសួងអប់រំ យុវជន និងកីឡា" },
      { title: "Teacher Guide", publisher: "MoEYS" },
      // Even carrying a commercial registrant prefix, the ministry wins.
      { title: "សៀវភៅសិក្សា", publisher: "ក្រសួងអប់រំ", isbn: "978-0-13-478422-9" },
    ];
    for (const r of rows) expect(cls(r)).toBe("open-likely");
  });

  it("recognises PTEC's own material", () => {
    expect(cls({ title: "Annual Report", publisher: "Phnom Penh Teacher Education College" })).toBe(
      "open-likely",
    );
  });

  it("recognises UN agencies, SEAMEO, the World Bank and the OECD", () => {
    expect(cls({ title: "x", publisher: "UNESCO" })).toBe("open-likely");
    expect(cls({ title: "x", publisher: "SEAMEO INNOTECH" })).toBe("open-likely");
    expect(cls({ title: "x", publisher: "World Bank Group" })).toBe("open-likely");
    expect(cls({ title: "PISA for Development", authors: ["OECD"] })).toBe("open-likely");
    expect(cls({ title: "x", publisher: "Asian Development Bank" })).toBe("open-likely");
  });

  it("recognises an explicit open licence", () => {
    expect(cls({ title: "x", publisher: "Someone (CC BY 4.0)" })).toBe("open-likely");
    expect(cls({ title: "An Open Access Reader" })).toBe("open-likely");
  });

  it("does not let a short acronym match inside an ordinary word", () => {
    // "who" inside "whole", "nie" inside "convenience".
    expect(cls({ publisher: "The Whole Child Trust" })).toBe("unknown");
    expect(cls({ publisher: "Convenience Press" })).toBe("unknown");
  });

  it("reads a short acronym as an institution only where a CREATOR is named", () => {
    // The pronoun. An English title may say "who" for entirely ordinary
    // reasons, and reading that as the World Health Organization would tell a
    // librarian there is nothing here to review.
    expect(cls({ title: "Students Who Struggle With Reading" })).toBe("unknown");
    expect(cls({ title: "Who Teaches the Teachers?" })).toBe("unknown");
    // The institution, credited where an institution is credited.
    expect(cls({ authors: ["World Health Organization (WHO)"], title: "Safe schools" })).toBe(
      "open-likely",
    );
    expect(cls({ authors: ["OECD"], title: "PISA in Focus" })).toBe("open-likely");
    expect(cls({ authors: ["វិទ្យាស្ថានជាតិអប់រំ (NIE)"], title: "x" })).toBe("open-likely");
  });
});

describe("classifyRights — restraint (rule 2)", () => {
  it("never decides commercial from a title alone", () => {
    // Every one of these IS a commercial textbook title. None may be flagged
    // without a publisher or an ISBN, because each is also a subject taught here.
    for (const title of [
      "Educational Psychology",
      "Pearson Guide to Teaching",
      "Research Methods in Education 6th Edition",
    ]) {
      expect(cls({ title })).toBe("unknown");
    }
  });

  it("does not flag an unrecognised publisher", () => {
    const v = classifyRights({ title: "x", publisher: "Cambodian Education Forum" });
    expect(v.rightsClass).toBe("unknown");
    expect(v.reason).toContain("not in either vocabulary");
  });

  it("does not flag an ISBN outside the table", () => {
    // 978-9924 is Cambodia's group. Nothing in the table may match it.
    const v = classifyRights({ title: "x", isbn: "978-9924-00-123-4" });
    expect(v.rightsClass).toBe("unknown");
  });

  it("says WHY nothing was decided, so unknown reads as unmeasured", () => {
    expect(classifyRights({ title: "x" }).reason).toContain("no publisher and no usable ISBN");
  });
});

describe("review-queue ordering", () => {
  it("puts the rows a human must read first at the top", () => {
    const order = (["open-likely", "unknown", "commercial-likely"] as const)
      .slice()
      .sort((a, b) => RIGHTS_CLASS_ORDER[a] - RIGHTS_CLASS_ORDER[b]);
    expect(order).toEqual(["commercial-likely", "unknown", "open-likely"]);
  });
});

describe("review priority", () => {
  it("puts a commercial verdict first, whatever the script", () => {
    expect(reviewPriority({ rightsClass: "commercial-likely", title: "Anything" })).toBe("P1");
    // First match wins, so the script rule cannot hide a commercial verdict.
    expect(reviewPriority({ rightsClass: "commercial-likely", title: "សៀវភៅ" })).toBe("P1");
  });

  it("separates the Latin unknowns a human can actually check", () => {
    // Carries an ISBN → checkable by hand.
    expect(
      reviewPriority({ rightsClass: "unknown", title: "Some Manual", isbn: "978-9924-00-123-4" }),
    ).toBe("P2");
    // Carries an edition word → checkable by hand.
    expect(reviewPriority({ rightsClass: "unknown", title: "Statistics, 3rd Edition" })).toBe("P2");
    // Neither → still Latin and still unmeasured, but nothing to go on.
    expect(reviewPriority({ rightsClass: "unknown", title: "Some Manual" })).toBe("P3");
  });

  it("files Khmer-script titles last among the unmeasured", () => {
    expect(reviewPriority({ rightsClass: "unknown", title: "សៀវភៅណែនាំគ្រូបង្រៀន" })).toBe("P4");
    expect(reviewPriority({ rightsClass: "open-likely", title: "សៀវភៅ" })).toBe("P4");
  });

  it("gives the Latin open-likely gap its own bucket rather than someone else's", () => {
    // P1-P4 as stated do not cover this row: not commercial, not unknown,
    // not Khmer. Filing it under P4 would assert a script rule it fails.
    expect(reviewPriority({ rightsClass: "open-likely", title: "PISA in Focus" })).toBe("P5");
  });

  it("reads the script from any Khmer character present", () => {
    expect(titleScript("PISA ២០២២")).toBe("khmer");
    expect(titleScript("PISA 2022")).toBe("latin");
    expect(titleScript(null)).toBe("latin");
  });
});

describe("isbnPrefix8", () => {
  it("gives a lookup block, and nothing when there is no usable ISBN", () => {
    expect(isbnPrefix8("978-0-13-000000-0")).toBe("97801300");
    expect(isbnPrefix8("0-13-000000-9")).toBe("97801300");
    expect(isbnPrefix8("")).toBe("");
    expect(isbnPrefix8("N/A")).toBe("");
  });
});
