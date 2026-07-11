import { describe, expect, it } from "vitest";

import type { PublicationReference } from "@/lib/publications";
import {
  CITATION_TOKEN_EXAMPLE,
  MAX_PUBLICATION_REFERENCES,
  MAX_REFERENCES_PER_CITATION,
  MAX_REFERENCE_TEXT_LENGTH,
  academicTextToPlainText,
  citationToken,
  collectCitationOccurrences,
  countCitationsByReference,
  countCitationsByReferenceAndSource,
  createPublicationReferenceId,
  deterministicReferenceId,
  domSafeCitationPart,
  extractCitationTokens,
  formatCitationNumbers,
  getCitationOccurrenceId,
  getReferenceTargetId,
  isValidDoi,
  isValidReferenceId,
  normalizeDoi,
  normalizePublicationReferences,
  normalizeReferenceUrl,
  removeCitationTokensForReference,
  resolveCitation,
  resolveCitationGroup,
  splitCitationKeys,
  upgradeLegacyCitationTokens,
  validatePublicationCitations,
} from "./citations";

const references: PublicationReference[] = [
  {
    id: "ref-atoms",
    index: 1,
    text: "Rutherford, E. Atomic structure.",
    doi: "10.1000/atoms",
  },
  {
    id: "ref-models",
    index: 2,
    text: "Johnstone, A. H. Mental models.",
    url: "https://example.edu/models",
  },
];

describe("publication reference IDs and normalization", () => {
  it("recognizes constrained, DOM-safe stable IDs", () => {
    expect(isValidReferenceId("ref-atoms_2026")).toBe(true);
    expect(isValidReferenceId("-ref-atoms")).toBe(false);
    expect(isValidReferenceId("ref atoms")).toBe(false);
    expect(isValidReferenceId(`r${"x".repeat(80)}`)).toBe(false);
  });

  it("creates valid, distinct IDs for new references", () => {
    const first = createPublicationReferenceId();
    const second = createPublicationReferenceId();

    expect(first).toMatch(/^ref-/);
    expect(isValidReferenceId(first)).toBe(true);
    expect(isValidReferenceId(second)).toBe(true);
    expect(second).not.toBe(first);
  });

  it("generates the same legacy ID for the same row and position", () => {
    const legacy = {
      text: "ការសិក្សាអំពី H₂O និង ΔG°.",
      doi: "10.1000/example",
    };

    expect(deterministicReferenceId(legacy, 3)).toBe(
      deterministicReferenceId({ ...legacy }, 3),
    );
    expect(deterministicReferenceId(legacy, 3)).toMatch(/^ref-[a-z0-9]+$/);
    expect(deterministicReferenceId(legacy, 4)).not.toBe(
      deterministicReferenceId(legacy, 3),
    );
  });

  it("normalizes legacy JSON, preserves valid IDs, and derives visible indexes", () => {
    const input = [
      {
        id: "ref-kept",
        index: 88,
        text: "  First reference  ",
        doi: "https://doi.org/10.1000/FIRST",
        url: "https://example.org/source",
      },
      { index: 1, text: "អាតូម H₂O និង x²" },
    ];

    const result = normalizePublicationReferences(input);

    expect(result).toEqual([
      {
        id: "ref-kept",
        index: 1,
        text: "First reference",
        doi: "10.1000/FIRST",
        url: "https://example.org/source",
      },
      {
        id: expect.stringMatching(/^ref-/),
        index: 2,
        text: "អាតូម H₂O និង x²",
      },
    ]);
    expect(normalizePublicationReferences(input)).toEqual(result);
  });

  it("ignores invalid read shapes and assigns unique IDs to collisions", () => {
    const result = normalizePublicationReferences([
      null,
      "not an object",
      { id: "ref-same", text: "First" },
      { id: "ref-same", text: "Second" },
      { id: "invalid id", text: "Third" },
      { id: "blank", text: "   " },
    ]);

    expect(result.map((reference) => reference.index)).toEqual([1, 2, 3]);
    expect(result.map((reference) => reference.id)).toEqual([
      "ref-same",
      "ref-same-2",
      expect.stringMatching(/^ref-/),
    ]);
    expect(new Set(result.map((reference) => reference.id)).size).toBe(3);
    expect(normalizePublicationReferences({ references: [] })).toEqual([]);
  });

  it("preserves bounded structured metadata and drops empty or invalid meta", () => {
    const result = normalizePublicationReferences([
      {
        id: "ref-meta",
        text: "Smith, J. (2024). Teacher training.",
        meta: {
          type: "journal-article",
          title: "Teacher training",
          year: 2024,
          bogusKey: "dropped",
        },
      },
      { id: "ref-bare", text: "Bare", meta: { type: "other" } },
      { id: "ref-junk", text: "Junk meta", meta: "not-an-object" },
    ]);

    expect(result[0].meta).toEqual({
      type: "journal-article",
      title: "Teacher training",
      year: 2024,
    });
    expect(result[1].meta).toBeUndefined();
    expect(result[2].meta).toBeUndefined();
  });

  it("caps defensive read normalization at the supported reference count", () => {
    const input = Array.from(
      { length: MAX_PUBLICATION_REFERENCES + 5 },
      (_, index) => ({ id: `ref-${index}`, text: `Reference ${index}` }),
    );

    expect(normalizePublicationReferences(input)).toHaveLength(
      MAX_PUBLICATION_REFERENCES,
    );
  });
});

describe("DOI and reference URL normalization", () => {
  it.each([
    ["10.1000/ABC.123", "10.1000/ABC.123"],
    [" doi: 10.1000/ABC.123 ", "10.1000/ABC.123"],
    ["https://doi.org/10.1000/ABC.123", "10.1000/ABC.123"],
    ["http://dx.doi.org/10.1000/ABC.123", "10.1000/ABC.123"],
    ["", undefined],
  ])("normalizes DOI input %j", (input, expected) => {
    expect(normalizeDoi(input)).toBe(expected);
  });

  it("validates DOI shape without erasing case or scientific punctuation", () => {
    expect(isValidDoi("10.1021/ed500184t")).toBe(true);
    expect(isValidDoi("10.5555/(SICI)1234-5678")).toBe(true);
    expect(isValidDoi("11.1021/not-a-doi")).toBe(false);
    expect(isValidDoi("10.1021/has whitespace")).toBe(false);
  });

  it("accepts only absolute HTTP(S) URLs", () => {
    expect(normalizeReferenceUrl("https://example.org/path?q=H2O")).toBe(
      "https://example.org/path?q=H2O",
    );
    expect(normalizeReferenceUrl("http://example.org")).toBe(
      "http://example.org/",
    );
    expect(normalizeReferenceUrl("ftp://example.org/file")).toBeUndefined();
    expect(normalizeReferenceUrl("/relative/path")).toBeUndefined();
    expect(normalizeReferenceUrl("not a URL")).toBeUndefined();
  });
});

describe("citation token extraction and resolution", () => {
  it("builds the canonical stored token", () => {
    expect(CITATION_TOKEN_EXAMPLE).toBe("[cite:reference-id]");
    expect(citationToken("ref-atoms")).toBe("[cite:ref-atoms]");
  });

  it("extracts every token with its exact source range", () => {
    const content = "Atoms [cite:ref-atoms], then [CITE: 2 ].";
    const tokens = extractCitationTokens(content);

    expect(tokens).toEqual([
      {
        keys: ["ref-atoms"],
        key: "ref-atoms",
        raw: "[cite:ref-atoms]",
        start: 6,
        end: 22,
      },
      {
        keys: ["2"],
        key: "2",
        raw: "[CITE: 2 ]",
        start: 29,
        end: 39,
      },
    ]);
    expect(content.slice(tokens[0].start, tokens[0].end)).toBe(tokens[0].raw);
  });

  it("returns no tokens for absent content", () => {
    expect(extractCitationTokens(null)).toEqual([]);
    expect(extractCitationTokens(undefined)).toEqual([]);
    expect(extractCitationTokens("ordinary [text]")).toEqual([]);
  });

  it("resolves stable IDs to current array-order numbers", () => {
    const reordered = [references[1], references[0]];

    expect(resolveCitation("ref-atoms", reordered)).toEqual({
      reference: references[0],
      number: 2,
    });
    expect(resolveCitation("missing", reordered)).toBeNull();
  });

  it("supports legacy one-based numeric tokens", () => {
    expect(resolveCitation(" 2 ", references)).toEqual({
      reference: references[1],
      number: 2,
    });
    expect(resolveCitation("0", references)).toBeNull();
    expect(resolveCitation("3", references)).toBeNull();
  });

  it("upgrades resolvable numeric tokens while leaving other tokens intact", () => {
    expect(
      upgradeLegacyCitationTokens(
        "A [cite:1], B [cite:ref-models], C [cite:8].",
        references,
      ),
    ).toBe(
      "A [cite:ref-atoms], B [cite:ref-models], C [cite:8].",
    );
  });

  it("removes only tokens that resolve to the selected reference", () => {
    expect(
      removeCitationTokensForReference(
        "Atoms [cite:ref-atoms]; models [cite:2]; again [cite:ref-atoms].",
        "ref-atoms",
        references,
      ),
    ).toBe("Atoms; models [cite:2]; again.");
  });
});

describe("grouped citation tokens", () => {
  const third: PublicationReference = {
    id: "ref-third",
    index: 3,
    text: "Chan, D. Third reference.",
  };
  const many = [...references, third];

  it("splits singular and grouped keys without interpreting them", () => {
    expect(splitCitationKeys("ref-atoms")).toEqual(["ref-atoms"]);
    expect(splitCitationKeys(" ref-a , 2 ,, ref-b ")).toEqual(["ref-a", "2", "ref-b"]);
    expect(splitCitationKeys("  ,  ")).toEqual([]);
  });

  it("builds deduplicated grouped tokens", () => {
    expect(citationToken(["ref-atoms", "ref-models"])).toBe("[cite:ref-atoms,ref-models]");
    expect(citationToken(["ref-atoms", " ref-atoms ", ""])).toBe("[cite:ref-atoms]");
  });

  it("extracts grouped keys in source order", () => {
    const [token] = extractCitationTokens("Both [cite:ref-models, 1].");
    expect(token.keys).toEqual(["ref-models", "1"]);
  });

  it("resolves a group preserving source order and dropping misses and repeats", () => {
    const resolved = resolveCitationGroup("ref-models, 1, ref-missing, ref-models", many);
    expect(resolved.map((item) => item.number)).toEqual([2, 1]);
    expect(resolveCitationGroup(["ref-missing"], many)).toEqual([]);
  });

  it("formats grouped display numbers with ranges for runs of three or more", () => {
    expect(formatCitationNumbers([2])).toBe("[2]");
    expect(formatCitationNumbers([2, 1])).toBe("[1, 2]");
    expect(formatCitationNumbers([3, 1, 2])).toBe("[1–3]");
    expect(formatCitationNumbers([1, 2, 3, 7, 9, 10, 11])).toBe("[1–3, 7, 9–11]");
    expect(formatCitationNumbers([5, 5, 0, -1, 2.5])).toBe("[5]");
    expect(formatCitationNumbers([])).toBe("[?]");
    expect(formatCitationNumbers([1, 2, 3], { compressRanges: false })).toBe("[1, 2, 3]");
  });

  it("upgrades numeric keys inside grouped tokens without touching stable IDs", () => {
    expect(upgradeLegacyCitationTokens("Pair [cite:1,ref-models,9].", many)).toBe(
      "Pair [cite:ref-atoms,ref-models,9].",
    );
    expect(upgradeLegacyCitationTokens("Stable [cite:ref-atoms,ref-models].", many)).toBe(
      "Stable [cite:ref-atoms,ref-models].",
    );
  });

  it("shrinks a grouped token instead of deleting other members", () => {
    expect(
      removeCitationTokensForReference(
        "Group [cite:ref-atoms,ref-models] solo [cite:ref-atoms].",
        "ref-atoms",
        many,
      ),
    ).toBe("Group [cite:ref-models] solo.");
  });

  it("counts each group member once per occurrence, split by source", () => {
    const sources = [
      { id: "abstract-en", text: "All [cite:ref-atoms,ref-models,ref-third] one [cite:ref-atoms]." },
      { id: "abstract-km", text: "គូ [cite:ref-models,ref-third]." },
    ];
    expect(countCitationsByReferenceAndSource(sources, many)).toEqual({
      "ref-atoms": { "abstract-en": 2 },
      "ref-models": { "abstract-en": 1, "abstract-km": 1 },
      "ref-third": { "abstract-en": 1, "abstract-km": 1 },
    });
  });

  it("converts grouped tokens to compressed plain-text ranges", () => {
    expect(
      academicTextToPlainText("Runs [cite:ref-atoms,ref-models,ref-third].", many),
    ).toBe("Runs [1–3].");
  });

  it("rejects oversized groups and malformed group members on validation", () => {
    const oversized = `[cite:${Array.from({ length: MAX_REFERENCES_PER_CITATION + 1 }, (_, i) => `ref-${i}`).join(",")}]`;
    const result = validatePublicationCitations(references, [
      { id: "abstract", text: `${oversized} [cite:ref-atoms,bad key] [cite:ref-atoms,ref-missing]` },
    ]);

    expect(result.errors.map((error) => error.code)).toEqual([
      "citation_group_too_large",
      "invalid_citation_token",
      "missing_citation_target",
    ]);
  });
});

describe("citation occurrence and backlink IDs", () => {
  const sources = [
    {
      id: "abstract-en",
      text: "Atoms [cite:ref-atoms] and models [cite:ref-models]; atoms again [cite:1].",
    },
    {
      id: "abstract-km",
      text: "អាតូម [cite:ref-atoms] និងគំរូ [cite:2].",
    },
  ];

  it("produces deterministic fragment IDs", () => {
    expect(domSafeCitationPart("Abstract EN / main")).toBe("abstract-en-main");
    expect(domSafeCitationPart("អរូបី")).toMatch(/^item-/);
    expect(getReferenceTargetId("ref-atoms")).toBe("reference-ref-atoms");
    expect(getCitationOccurrenceId("abstract-en", "ref-atoms", 2)).toBe(
      "citation-abstract-en-ref-atoms-2",
    );
  });

  it("numbers repeated citations per reference within each source", () => {
    const occurrences = collectCitationOccurrences(sources, references);

    expect(
      occurrences.map(({ sourceId, reference, number, occurrence, citationId }) => ({
        sourceId,
        referenceId: reference.id,
        number,
        occurrence,
        citationId,
      })),
    ).toEqual([
      {
        sourceId: "abstract-en",
        referenceId: "ref-atoms",
        number: 1,
        occurrence: 1,
        citationId: "citation-abstract-en-ref-atoms-1",
      },
      {
        sourceId: "abstract-en",
        referenceId: "ref-models",
        number: 2,
        occurrence: 1,
        citationId: "citation-abstract-en-ref-models-1",
      },
      {
        sourceId: "abstract-en",
        referenceId: "ref-atoms",
        number: 1,
        occurrence: 2,
        citationId: "citation-abstract-en-ref-atoms-2",
      },
      {
        sourceId: "abstract-km",
        referenceId: "ref-atoms",
        number: 1,
        occurrence: 1,
        citationId: "citation-abstract-km-ref-atoms-1",
      },
      {
        sourceId: "abstract-km",
        referenceId: "ref-models",
        number: 2,
        occurrence: 1,
        citationId: "citation-abstract-km-ref-models-1",
      },
    ]);
    expect(collectCitationOccurrences(sources, references)).toEqual(occurrences);
  });

  it("counts citations across all supplied content sources", () => {
    expect(countCitationsByReference(sources, references)).toEqual({
      "ref-atoms": 3,
      "ref-models": 2,
    });
  });
});

describe("academic plain-text conversion", () => {
  it("resolves citations and strips only supported inline formatting markers", () => {
    const content = [
      "**Atomic structure** uses H<sub>2</sub>O and x<sup>2</sup> [cite:ref-atoms].",
      "*ΔG° remains scientific Unicode* [cite:2].",
    ].join("\n\n");

    expect(academicTextToPlainText(content, references)).toBe(
      "Atomic structure uses H2O and x2 [1]. ΔG° remains scientific Unicode [2].",
    );
  });

  it("removes dangling citation tokens from clean plain text", () => {
    expect(academicTextToPlainText("Text [cite:missing].", references)).toBe(
      "Text .",
    );
    expect(academicTextToPlainText(null, references)).toBe("");
  });
});

describe("publication citation validation", () => {
  it("returns normalized references for a valid payload", () => {
    const result = validatePublicationCitations(
      [
        {
          id: "ref-a",
          index: 99,
          text: "  Reference A  ",
          doi: "doi: 10.1000/A",
          url: "https://example.org/a",
        },
        { id: "ref-b", text: "Reference B" },
      ],
      [
        { id: "abstract", text: "Claim [cite:ref-a]." },
        { id: "abstract-km", text: "សេចក្តី [cite:2]." },
      ],
    );

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.references).toEqual([
      {
        id: "ref-a",
        index: 1,
        text: "Reference A",
        doi: "10.1000/A",
        url: "https://example.org/a",
      },
      { id: "ref-b", index: 2, text: "Reference B" },
    ]);
  });

  it("rejects a non-array references shape", () => {
    const result = validatePublicationCitations({}, []);

    expect(result.references).toEqual([]);
    expect(result.errors).toMatchObject([{ code: "invalid_references" }]);
  });

  it("reports the count limit", () => {
    const input = Array.from(
      { length: MAX_PUBLICATION_REFERENCES + 1 },
      (_, index) => ({ id: `ref-${index}`, text: `Reference ${index}` }),
    );
    const result = validatePublicationCitations(input, []);

    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "too_many_references" }),
    );
    expect(result.references).toHaveLength(MAX_PUBLICATION_REFERENCES);
  });

  it("reports invalid rows, blank text, and overlong text", () => {
    const result = validatePublicationCitations(
      [
        "not an object",
        { id: "ref-blank", text: "  " },
        { id: "ref-long", text: "x".repeat(MAX_REFERENCE_TEXT_LENGTH + 1) },
      ],
      [],
    );

    expect(result.errors.map((error) => error.code)).toEqual([
      "invalid_reference",
      "missing_reference_text",
      "reference_text_too_long",
    ]);
  });

  it("reports invalid and duplicate IDs while upgrading missing legacy IDs", () => {
    const result = validatePublicationCitations(
      [
        { id: "bad id", text: "Invalid ID" },
        { id: "ref-same", text: "First duplicate" },
        { id: "ref-same", text: "Second duplicate" },
        { text: "Legacy row" },
      ],
      [],
    );

    expect(result.errors.map((error) => error.code)).toEqual([
      "invalid_reference_id",
      "duplicate_reference_id",
    ]);
    expect(result.warnings).toMatchObject([
      { code: "invalid_reference_id", referenceIndex: 3 },
    ]);
    expect(result.references[3]).toMatchObject({
      id: expect.stringMatching(/^ref-/),
      index: 4,
      text: "Legacy row",
    });
  });

  it("reports invalid and case-insensitive duplicate DOIs", () => {
    const result = validatePublicationCitations(
      [
        { id: "ref-a", text: "A", doi: "not-a-doi" },
        { id: "ref-b", text: "B", doi: "10.1000/DUPLICATE" },
        {
          id: "ref-c",
          text: "C",
          doi: "https://doi.org/10.1000/duplicate",
        },
      ],
      [],
    );

    expect(result.errors.map((error) => error.code)).toEqual([
      "invalid_doi",
      "duplicate_doi",
    ]);
  });

  it("reports non-HTTP and malformed URLs", () => {
    const result = validatePublicationCitations(
      [
        { id: "ref-a", text: "A", url: "javascript:alert(1)" },
        { id: "ref-b", text: "B", url: "/relative" },
      ],
      [],
    );

    expect(result.errors.map((error) => error.code)).toEqual([
      "invalid_url",
      "invalid_url",
    ]);
  });

  it("reports malformed and dangling stable or numeric citation targets", () => {
    const result = validatePublicationCitations(references, [
      {
        id: "abstract",
        text: [
          "[cite:]",
          "[cite:bad target]",
          "[cite:ref-missing]",
          "[cite:9]",
          "[cite:ref-atoms]",
          "[cite:2]",
        ].join(" "),
      },
    ]);

    expect(result.errors.map((error) => error.code)).toEqual([
      "invalid_citation_token",
      "invalid_citation_token",
      "missing_citation_target",
      "missing_citation_target",
    ]);
  });
});
