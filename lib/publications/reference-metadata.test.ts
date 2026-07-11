import { describe, expect, it } from "vitest";

import {
  MAX_PARSED_REFERENCE_ENTRIES,
  countWords,
  detectKhmerFieldLanguageMismatch,
  findLikelyReferenceDuplicates,
  detectLikelyReferenceDuplicates,
  formatReadableReference,
  isLikelyLatinContentInKhmerField,
  mapCrossrefLikeMetadata,
  normalizeReferenceDoi,
  normalizeReferenceHttpUrl,
  parsePastedReferenceList,
  summarizeReference,
  type StructuredReferenceMetadata,
} from "./reference-metadata";

describe("DOI and URL normalization for structured references", () => {
  it.each([
    ["10.1021/ed500184t", "10.1021/ed500184t"],
    ["doi: 10.1021/ed500184t", "10.1021/ed500184t"],
    ["DOI:10.1021/ed500184t.", "10.1021/ed500184t"],
    ["https://doi.org/10.1021/ed500184t", "10.1021/ed500184t"],
    ["https://dx.doi.org/10.1021/ed500184t,", "10.1021/ed500184t"],
    ["10.5555/(SICI)1234", "10.5555/(SICI)1234"],
    ["11.1021/not-a-doi", undefined],
    ["10.1021/has space", undefined],
    ["", undefined],
    [42, undefined],
  ])("normalizes DOI input %j", (input, expected) => {
    expect(normalizeReferenceDoi(input)).toBe(expected);
  });

  it("keeps balanced closing parentheses but strips unbalanced trailing ones", () => {
    expect(normalizeReferenceDoi("10.5555/(SICI)1234)")).toBe("10.5555/(SICI)1234");
  });

  it("accepts only http(s) URLs and strips fragments", () => {
    expect(normalizeReferenceHttpUrl("https://example.org/a?b=1#frag")).toBe(
      "https://example.org/a?b=1",
    );
    expect(normalizeReferenceHttpUrl("http://example.org/paper.")).toBe(
      "http://example.org/paper",
    );
    expect(normalizeReferenceHttpUrl("javascript:alert(1)")).toBeUndefined();
    expect(normalizeReferenceHttpUrl("ftp://example.org/x")).toBeUndefined();
    expect(normalizeReferenceHttpUrl("not a url")).toBeUndefined();
  });
});

describe("formatReadableReference", () => {
  it("formats a journal article with volume, issue, pages, and DOI link", () => {
    const reference: StructuredReferenceMetadata = {
      type: "journal-article",
      authors: [{ family: "Sok", given: "Dara" }, { family: "Chan", given: "Bopha" }],
      title: "Digital pedagogy adoption",
      containerTitle: "PTEC Journal of Education",
      year: 2026,
      volume: "12",
      issue: "3",
      pageStart: "101",
      pageEnd: "118",
      doi: "10.1000/ptec.2026.001",
    };

    expect(formatReadableReference(reference)).toBe(
      "Sok, Dara & Chan, Bopha. (2026). Digital pedagogy adoption. " +
        "PTEC Journal of Education, 12(3), 101–118. https://doi.org/10.1000/ptec.2026.001",
    );
  });

  it("formats a book with edition and publisher", () => {
    expect(
      formatReadableReference({
        type: "book",
        authors: ["DiBerardinis, L. J."],
        title: "Guidelines for Laboratory Design",
        year: "2013",
        edition: "4th ed.",
        publisher: "Wiley",
      }),
    ).toBe("DiBerardinis, L. J. (2013). Guidelines for Laboratory Design. (4th ed). Wiley.");
  });

  it("prefers an explicit administrator override verbatim", () => {
    expect(
      formatReadableReference({
        type: "other",
        title: "Ignored title",
        formattedCitationOverride: "Custom formatted citation, exactly as typed.",
      }),
    ).toBe("Custom formatted citation, exactly as typed.");
  });

  it("falls back to the original imported text when nothing is structured", () => {
    expect(
      formatReadableReference({ type: "other", originalText: "Raw pasted line" }),
    ).toBe("Raw pasted line");
    expect(formatReadableReference({ type: "other" })).toBe("Untitled reference");
  });

  it("labels theses with their institution", () => {
    expect(
      formatReadableReference({
        type: "thesis-dissertation",
        thesisKind: "dissertation",
        authors: ["Vann, S."],
        title: "Teacher preparation in Cambodia",
        year: 2024,
        institution: "Royal University of Phnom Penh",
      }),
    ).toBe(
      "Vann, S. (2024). Teacher preparation in Cambodia. " +
        "[Dissertation, Royal University of Phnom Penh].",
    );
  });
});

describe("summarizeReference", () => {
  it("builds a compact first-author + year citation", () => {
    const summary = summarizeReference({
      type: "journal-article",
      authors: [{ family: "DiBerardinis", given: "Louis" }, "Baum, J."],
      title: "Guidelines for Laboratory Design, 4th ed.",
      year: 2013,
    });

    expect(summary.shortCitation).toBe("DiBerardinis et al. (2013)");
    expect(summary.title).toBe("Guidelines for Laboratory Design, 4th ed.");
  });

  it("uses the final token of Latin personal names and keeps others intact", () => {
    expect(
      summarizeReference({ type: "book", authors: ["Louis DiBerardinis"], year: 2013 })
        .firstAuthor,
    ).toBe("DiBerardinis");
    expect(
      summarizeReference({ type: "book", authors: ["សុខ ដារ៉ា"], year: 2020 }).firstAuthor,
    ).toBe("សុខ ដារ៉ា");
  });

  it("falls back to organization, n.d., and a truncated original text", () => {
    const summary = summarizeReference({
      type: "website",
      organization: "UNESCO",
      originalText: `${"very long title ".repeat(20)}end`,
    });

    expect(summary.firstAuthor).toBe("UNESCO");
    expect(summary.year).toBe("n.d.");
    expect(summary.shortCitation).toBe("UNESCO (n.d.)");
    expect(summary.title.length).toBeLessThanOrEqual(140);
    expect(summary.title.endsWith("…")).toBe(true);
  });
});

describe("parsePastedReferenceList", () => {
  it("returns nothing for blank or non-string input", () => {
    expect(parsePastedReferenceList("")).toEqual({
      candidates: [],
      truncated: false,
      ignoredEntryCount: 0,
    });
    expect(parsePastedReferenceList(null).candidates).toEqual([]);
  });

  it("splits numbered single-line references and extracts fields", () => {
    const result = parsePastedReferenceList(
      [
        "[1] Smith, J. (2024). Teacher training in Southeast Asia. J. Educ. 12, 101–118. https://doi.org/10.1000/jed.2024.5",
        "[2] Chan, D. (2023). Lesson study. https://example.org/lesson-study",
      ].join("\n"),
    );

    expect(result.candidates).toHaveLength(2);
    expect(result.truncated).toBe(false);

    const [first, second] = result.candidates;
    expect(first.metadata.doi).toBe("10.1000/jed.2024.5");
    expect(first.metadata.year).toBe("2024");
    expect(first.metadata.type).toBe("journal-article");
    expect(first.metadata.title).toBe("Teacher training in Southeast Asia");
    expect(first.metadata.originalText).toContain("Smith, J. (2024)");
    expect(first.confidence).toBe("high");

    expect(second.metadata.type).toBe("website");
    expect(second.metadata.url).toBe("https://example.org/lesson-study");
  });

  it("keeps continuation lines attached to their numbered entry", () => {
    const result = parsePastedReferenceList(
      "1. Smith, J. (2024). A very long reference\n   that wraps onto a second line.\n2. Chan, D. (2023). Second entry.",
    );

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].originalInput).toContain("wraps onto a second line");
  });

  it("splits blank-line-separated blocks", () => {
    const result = parsePastedReferenceList("First entry (2020).\n\nSecond entry (2021).");
    expect(result.candidates).toHaveLength(2);
  });

  it("warns instead of guessing when fields are missing", () => {
    const [candidate] = parsePastedReferenceList("???").candidates;
    expect(candidate.confidence).toBe("low");
    expect(candidate.warnings.length).toBeGreaterThan(0);
    expect(candidate.originalInput).toBe("???");
  });

  it("caps the number of parsed entries and reports the overflow", () => {
    const input = Array.from(
      { length: MAX_PARSED_REFERENCE_ENTRIES + 7 },
      (_, i) => `${i + 1}. Reference number ${i + 1} (2020).`,
    ).join("\n");
    const result = parsePastedReferenceList(input);

    expect(result.candidates).toHaveLength(MAX_PARSED_REFERENCE_ENTRIES);
    expect(result.truncated).toBe(true);
    expect(result.ignoredEntryCount).toBe(7);
  });
});

describe("duplicate reference detection", () => {
  const existing = [
    { id: "ref-a", text: "Smith, J. (2024). Teacher training in Southeast Asia. 10.1000/jed.2024.5" },
    { id: "ref-b", title: "Lesson study in Cambodia", year: 2023, url: "https://example.org/ls" },
  ];

  it("treats an exact DOI match as a certain duplicate", () => {
    const matches = findLikelyReferenceDuplicates(
      { type: "journal-article", doi: "10.1000/JED.2024.5" },
      existing,
    );
    expect(matches[0]).toMatchObject({ existingId: "ref-a", reason: "doi", confidence: 1 });
  });

  it("matches canonicalized URLs and title+year pairs", () => {
    expect(
      findLikelyReferenceDuplicates(
        { type: "website", url: "https://EXAMPLE.org/ls" },
        existing,
      )[0],
    ).toMatchObject({ existingId: "ref-b", reason: "url" });

    expect(
      findLikelyReferenceDuplicates(
        { type: "journal-article", title: "Lesson Study in Cambodia", year: "2023" },
        existing,
      )[0],
    ).toMatchObject({ existingId: "ref-b", reason: "title-year" });
  });

  it("returns no match for unrelated references", () => {
    expect(
      findLikelyReferenceDuplicates(
        { type: "book", title: "Completely different subject", year: 1999 },
        existing,
      ),
    ).toEqual([]);
  });

  it("maps candidate indexes onto their duplicate matches", () => {
    const results = detectLikelyReferenceDuplicates(
      [
        { type: "book", title: "No match here", year: 1990 },
        { type: "journal-article", doi: "10.1000/jed.2024.5" },
      ],
      existing,
    );
    expect(results).toHaveLength(1);
    expect(results[0].candidateIndex).toBe(1);
  });
});

describe("mapCrossrefLikeMetadata", () => {
  const message = {
    type: "journal-article",
    title: ["Teacher training in Southeast Asia"],
    "container-title": ["Journal of Education"],
    author: [
      { given: "Jane", family: "Smith", ORCID: "https://orcid.org/0000-0001-2345-6789" },
      { name: "PTEC Research Group" },
    ],
    published: { "date-parts": [[2024, 5, 2]] },
    volume: "12",
    issue: "3",
    page: "101-118",
    publisher: "PTEC Press",
    DOI: "10.1000/jed.2024.5",
    URL: "https://doi.org/10.1000/jed.2024.5",
  };

  it("maps a Crossref work message, with or without the response wrapper", () => {
    const direct = mapCrossrefLikeMetadata(message);
    const wrapped = mapCrossrefLikeMetadata({ message });

    expect(wrapped).toEqual(direct);
    expect(direct).toMatchObject({
      type: "journal-article",
      title: "Teacher training in Southeast Asia",
      containerTitle: "Journal of Education",
      year: "2024",
      volume: "12",
      issue: "3",
      pageStart: "101",
      pageEnd: "118",
      publisher: "PTEC Press",
      doi: "10.1000/jed.2024.5",
    });
    expect(direct?.authors).toEqual([
      { given: "Jane", family: "Smith", orcid: "0000-0001-2345-6789" },
      { literal: "PTEC Research Group" },
    ]);
  });

  it("maps proceedings to conference papers and dissertations to theses", () => {
    expect(mapCrossrefLikeMetadata({ type: "proceedings-article", "container-title": ["ICER 2025"] }))
      .toMatchObject({ type: "conference-paper", conferenceName: "ICER 2025" });
    expect(mapCrossrefLikeMetadata({ type: "dissertation", publisher: "RUPP" })).toMatchObject({
      type: "thesis-dissertation",
      institution: "RUPP",
    });
  });

  it("treats a bare electronic page identifier as an article number", () => {
    expect(mapCrossrefLikeMetadata({ type: "journal-article", page: "e0123" })).toMatchObject({
      articleNumber: "e0123",
    });
  });

  it("returns null for non-object payloads", () => {
    expect(mapCrossrefLikeMetadata(null)).toBeNull();
    expect(mapCrossrefLikeMetadata("10.1000/x")).toBeNull();
    expect(mapCrossrefLikeMetadata([1, 2])).toBeNull();
  });
});

describe("word counting and Khmer language mismatch", () => {
  it("counts words while ignoring citation tokens and formatting markers", () => {
    expect(countWords("**Two words** [cite:ref-a,ref-b] and H<sub>2</sub>O.")).toBe(4);
    expect(countWords("")).toBe(0);
    expect(countWords(null)).toBe(0);
  });

  it("counts Khmer words through Intl.Segmenter", () => {
    expect(countWords("ការសិក្សាអំពីគរុកោសល្យ", "km")).toBeGreaterThan(0);
  });

  it("flags a Khmer field that is substantially Latin text", () => {
    const warning = detectKhmerFieldLanguageMismatch(
      "This abstract was accidentally pasted in English instead of Khmer.",
    );
    expect(warning).toMatchObject({ code: "likely-latin-content", severity: "warning" });
    expect(warning!.latinRatio).toBeGreaterThan(0.9);
    expect(isLikelyLatinContentInKhmerField("This is definitely English text pasted here.")).toBe(true);
  });

  it("stays silent for Khmer prose, short snippets, and mixed scientific text", () => {
    expect(
      detectKhmerFieldLanguageMismatch(
        "ការសិក្សានេះពិនិត្យមើលការអនុវត្តគរុកោសល្យឌីជីថលនៅកម្ពុជា",
      ),
    ).toBeNull();
    expect(detectKhmerFieldLanguageMismatch("OK short")).toBeNull();
    expect(
      detectKhmerFieldLanguageMismatch(
        "ការសិក្សា STEM និង ICT ក្នុងការបណ្តុះបណ្តាលគ្រូបង្រៀននៅកម្ពុជា គឺជាការសិក្សាសំខាន់",
      ),
    ).toBeNull();
  });
});
