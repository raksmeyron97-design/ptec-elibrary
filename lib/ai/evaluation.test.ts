// lib/ai/evaluation.test.ts — the benchmark's label model.
//
// Every case here is a claim about what a LABEL means, and each one fails if
// the defect it describes is reintroduced. The defects are real: each was
// measured on the AI Brain 2.0 fixtures before this module existed.

import { describe, expect, it } from "vitest";
import {
  claimsSatisfied,
  deriveEvidenceScope,
  evaluateAnswer,
  requiredDocuments,
  scopeCensus,
  type AnswerObservation,
  type ObservedPassage,
  type QuestionLabel,
} from "./evaluation";

const passage = (slug: string, page: number, extra: Partial<ObservedPassage> = {}): ObservedPassage => ({
  slug,
  page,
  lexical: 3,
  ...extra,
});

function observation(over: Partial<AnswerObservation> = {}): AnswerObservation {
  return {
    intent: "research_help",
    deterministic: false,
    answeredAsRefusal: false,
    answerNonEmpty: true,
    answerText: "an answer",
    passages: [],
    resultSlugs: [],
    citedSlugs: [],
    groundedCitations: 1,
    hallucinatedCitations: 0,
    resolvedEntitySlug: null,
    finishReason: "stop",
    ...over,
  };
}

describe("deriveEvidenceScope — a scope is a fact about the question", () => {
  it("an unanswerable question is no_evidence, before anything else is read", () => {
    expect(deriveEvidenceScope({ id: "n", category: "no_answer", expectNoAnswer: true, scoped: true })).toBe(
      "no_evidence",
    );
  });

  it("a fixture that states its own scope is believed", () => {
    expect(
      deriveEvidenceScope({ id: "x", category: "definition", evidenceScope: "exact_page", sources: ["a"] }),
    ).toBe("exact_page");
  });

  it("a reader inside one record gets an exhaustive single_document label", () => {
    expect(deriveEvidenceScope({ id: "s", category: "single_document", scoped: true, sources: ["a"] })).toBe(
      "single_document",
    );
  });

  it("a catalogue fact is metadata, not a context-precision question", () => {
    // exact_book/factual_lookup/library_faq/citation are all templateOk in v1.
    expect(deriveEvidenceScope({ id: "e", category: "exact_book", templateOk: true, sources: ["a"] })).toBe(
      "metadata",
    );
  });

  it("a comparison that NAMES its works requires both", () => {
    const q: QuestionLabel = {
      id: "c",
      category: "comparison",
      question: 'Compare "Practical Research Methods" and "Social Research Methods"',
      sources: ["practical-research-methods", "social-research-methods"],
    };
    expect(deriveEvidenceScope(q)).toBe("multi_document");
    expect(requiredDocuments(q, "multi_document")).toEqual([
      "practical-research-methods",
      "social-research-methods",
    ]);
  });

  it("a `comparison` that names NOTHING is a topic, whatever the category says", () => {
    // v2-cmp-001, verbatim: filed under comparison, labelled against eight
    // books, and naming none of them. Counting sources cannot separate this
    // from a real comparison; reading the question can.
    const q: QuestionLabel = {
      id: "v2-cmp-001",
      category: "comparison",
      question: "What is the difference between validity and reliability?",
      sources: ["a-book", "b-book", "c-book", "d-book", "e-book", "f-book", "g-book", "h-book"],
    };
    expect(deriveEvidenceScope(q)).toBe("topic_unscoped");
    expect(requiredDocuments(q, deriveEvidenceScope(q))).toEqual([]);
  });

  it("a synthesis labelled against FOUR books, naming none, is still a topic", () => {
    // v2-synth-002 — under the recall-list threshold, so only reading the
    // question keeps it out of multi_document.
    const q: QuestionLabel = {
      id: "v2-synth-002",
      category: "cross_book_synthesis",
      question: "What does the literature say about phonics?",
      sources: ["one-book", "two-book", "three-book", "four-book"],
    };
    expect(deriveEvidenceScope(q)).toBe("topic_unscoped");
  });

  it("a third labelled book that the question does not name is not required", () => {
    const q: QuestionLabel = {
      id: "c",
      category: "comparison",
      question: 'Compare "Practical Research Methods" and "Social Research Methods"',
      sources: ["practical-research-methods", "social-research-methods", "a-third-book-on-the-topic"],
    };
    expect(requiredDocuments(q, "multi_document")).toEqual([
      "practical-research-methods",
      "social-research-methods",
    ]);
  });

  it("v1's `multi_document` category is a recall list, and is NOT multi_document", () => {
    // "Across the library's books, how is ethics handled?" names no work at
    // all and is labelled against six. Reading that as a multi-document
    // question is the mislabel this module corrects.
    const q: QuestionLabel = {
      id: "multi-003",
      category: "multi_document",
      sources: ["a", "b", "c", "d", "e", "f"],
    };
    expect(deriveEvidenceScope(q)).toBe("topic_unscoped");
    expect(requiredDocuments(q, deriveEvidenceScope(q))).toEqual([]);
  });

  it("ONE labelled record is a choice; several unnamed ones are a recall list", () => {
    const wide = Array.from({ length: 6 }, (_, i) => `s${i}`);
    expect(deriveEvidenceScope({ id: "w", category: "definition", sources: wide })).toBe("topic_unscoped");
    expect(deriveEvidenceScope({ id: "two", category: "definition", sources: ["a", "b"] })).toBe(
      "topic_unscoped",
    );
    expect(deriveEvidenceScope({ id: "one", category: "definition", sources: ["a"] })).toBe("single_document");
  });

  it("an unlabelled question has no set to be precise against", () => {
    expect(deriveEvidenceScope({ id: "a", category: "ambiguous" })).toBe("topic_unscoped");
  });

  it("page labels outrank everything but a refusal", () => {
    expect(deriveEvidenceScope({ id: "p", category: "x", pages: { a: [50] }, sources: ["a"] })).toBe("exact_page");
    expect(deriveEvidenceScope({ id: "r", category: "x", pageRange: { a: [40, 50] }, sources: ["a"] })).toBe(
      "page_range",
    );
  });
});

describe("topic_unscoped — the label may not be used as a precision measure", () => {
  const q: QuestionLabel = {
    id: "def-001",
    category: "definition",
    sources: ["labelled-1", "labelled-2", "labelled-3", "labelled-4", "labelled-5", "labelled-6"],
    expectGrounded: true,
    expectIntent: ["research_help"],
  };

  it("an answer from an unlabelled but relevant book is not a context failure", () => {
    // The AI Brain 2.0 case, verbatim: the six-slug label names neither of the
    // two books the pipeline retrieved, and both carry 40+ pages on the topic.
    const e = evaluateAnswer(
      q,
      observation({ passages: [passage("social-research-methods-4th", 210), passage("research-design-3rd", 88)] }),
    );
    expect(e.scope).toBe("topic_unscoped");
    expect(e.contextRelevance).toBeNull();
    expect(e.wrongDocument).toBe(false);
    // The label-free measures still have something to say, and say it well:
    expect(e.evidenceCoverage).toBe(1);
    expect(e.irrelevantContextRatio).toBe(0);
  });

  it("retrieval still counts a labelled record when one is drawn on", () => {
    const e = evaluateAnswer(q, observation({ passages: [passage("labelled-2", 12)] }));
    expect(e.retrievalOk).toBe(true);
  });

  it("passages with no signal at all are counted as irrelevant context", () => {
    const e = evaluateAnswer(
      q,
      observation({
        passages: [
          passage("a", 1, { lexical: 0, semantic: 0.41 }),
          passage("b", 2, { lexical: 0, semantic: 0.2 }),
          passage("c", 3, { lexical: 4 }),
          passage("d", 4, { lexical: 0, semantic: 0.83 }),
        ],
      }),
    );
    expect(e.evidenceCoverage).toBe(0.5);
    expect(e.irrelevantContextRatio).toBe(0.5);
  });

  it("a repeated (record, page) is a duplicate, whatever ranked it twice", () => {
    const e = evaluateAnswer(
      q,
      observation({ passages: [passage("a", 7), passage("a", 7), passage("b", 3)] }),
    );
    expect(e.duplicateContextRatio).toBeCloseTo(1 / 3);
  });
});

describe("single_document — the label IS exhaustive, so precision means something", () => {
  const q: QuestionLabel = {
    id: "single-001",
    category: "single_document",
    scoped: true,
    sources: ["the-book"],
    expectGrounded: true,
    expectIntent: ["research_help"],
  };

  it("a passage from another book is wrong, not merely weaker", () => {
    const e = evaluateAnswer(q, observation({ passages: [passage("the-book", 10), passage("other", 4)] }));
    expect(e.contextRelevance).toBe(0.5);
    expect(e.retrievalOk).toBe(true);
    expect(e.wrongDocument).toBe(false);
  });

  it("no passage from the named record is a wrong-document failure", () => {
    const e = evaluateAnswer(q, observation({ passages: [passage("other", 4)] }));
    expect(e.retrievalOk).toBe(false);
    expect(e.wrongDocument).toBe(true);
    expect(e.contextSufficiency).toBe(false);
  });
});

describe("multi_document — every named work must contribute", () => {
  const q: QuestionLabel = {
    id: "cmp-001",
    category: "comparison",
    question: 'Compare "Book Alpha Methods" and "Book Beta Methods"',
    sources: ["book-alpha-methods", "book-beta-methods"],
    expectIntent: ["document_compare"],
  };

  it("a comparison answered wholly from one side is NOT retrieval-correct", () => {
    // `sources.some(...)` scored this 100%: the defect that made the answer
    // benchmark's multi-document number meaningless.
    const e = evaluateAnswer(q, observation({ passages: [passage("book-alpha-methods", 3), passage("book-alpha-methods", 9)] }));
    expect(e.retrievalOk).toBe(false);
    expect(e.multiDocumentRecall).toBe(0.5);
    expect(e.contextSufficiency).toBe(false);
    expect(e.wrongDocument).toBe(true);
  });

  it("both sides present passes, and a third book does not break it", () => {
    const e = evaluateAnswer(
      q,
      observation({ passages: [passage("book-alpha-methods", 3), passage("book-beta-methods", 9), passage("book-gamma-methods", 1)] }),
    );
    expect(e.retrievalOk).toBe(true);
    expect(e.multiDocumentRecall).toBe(1);
    expect(e.contextSufficiency).toBe(true);
    expect(e.contextRelevance).toBeCloseTo(2 / 3);
  });

  it("an explicit requiredDocuments list narrows what must appear", () => {
    const optional: QuestionLabel = {
      ...q,
      sources: ["book-alpha-methods", "book-beta-methods", "book-gamma-methods"],
      requiredDocuments: ["book-alpha-methods", "book-beta-methods"],
    };
    const e = evaluateAnswer(optional, observation({ passages: [passage("book-alpha-methods", 1), passage("book-beta-methods", 2)] }));
    expect(e.retrievalOk).toBe(true);
    expect(e.multiDocumentRecall).toBe(1);
  });
});

describe("page scopes — the right book at the wrong page is its own failure", () => {
  const exact: QuestionLabel = { id: "p1", category: "page", sources: ["b"], pages: { b: [50] } };
  const range: QuestionLabel = { id: "p2", category: "page", sources: ["b"], pageRange: { b: [40, 50] } };

  it("exact_page accepts the page named", () => {
    expect(evaluateAnswer(exact, observation({ passages: [passage("b", 50)] })).retrievalOk).toBe(true);
  });

  it("exact_page reports a wrong PAGE, not a wrong document", () => {
    const e = evaluateAnswer(exact, observation({ passages: [passage("b", 51)] }));
    expect(e.retrievalOk).toBe(false);
    expect(e.wrongPage).toBe(true);
    expect(e.wrongDocument).toBe(true);
  });

  it("a merged run of adjacent pages covers every page in the run", () => {
    const e = evaluateAnswer(exact, observation({ passages: [passage("b", 48, { pageEnd: 51 })] }));
    expect(e.retrievalOk).toBe(true);
    expect(e.wrongPage).toBe(false);
  });

  it("page_range accepts any page inside the span and rejects one outside", () => {
    expect(evaluateAnswer(range, observation({ passages: [passage("b", 44)] })).retrievalOk).toBe(true);
    const out = evaluateAnswer(range, observation({ passages: [passage("b", 60)] }));
    expect(out.retrievalOk).toBe(false);
    expect(out.wrongPage).toBe(true);
  });

  it("the wrong book entirely is a wrong document and not a wrong page", () => {
    const e = evaluateAnswer(exact, observation({ passages: [passage("other", 50)] }));
    expect(e.wrongPage).toBe(false);
    expect(e.wrongDocument).toBe(true);
  });
});

describe("metadata — a catalogue answer has no context to be precise about", () => {
  const q: QuestionLabel = {
    id: "exact-001",
    category: "exact_book",
    templateOk: true,
    sources: ["the-book"],
    expectIntent: ["book_search"],
  };

  it("five result cards around the right book is the correct behaviour, scored as such", () => {
    // Measured at 20% context under the 2.0 evaluator, for a perfect answer.
    const e = evaluateAnswer(
      q,
      observation({ deterministic: true, resultSlugs: ["the-book", "a", "b", "c", "d"] }),
    );
    expect(e.scope).toBe("metadata");
    expect(e.retrievalOk).toBe(true);
    expect(e.contextRelevance).toBeNull();
    expect(e.evidenceCoverage).toBeNull();
  });

  it("the named book missing from the results is a wrong-document failure", () => {
    const e = evaluateAnswer(q, observation({ deterministic: true, resultSlugs: ["a", "b"] }));
    expect(e.retrievalOk).toBe(false);
    expect(e.wrongDocument).toBe(true);
  });
});

describe("no-answer, both directions", () => {
  const unanswerable: QuestionLabel = { id: "na", category: "no_answer", expectNoAnswer: true };
  const answerable: QuestionLabel = { id: "ok", category: "definition", sources: ["a"], expectGrounded: true };

  it("a refused unanswerable question passes and is not an unsupported answer", () => {
    const e = evaluateAnswer(unanswerable, observation({ answeredAsRefusal: true, groundedCitations: 0 }));
    expect(e.noAnswerOk).toBe(true);
    expect(e.unsupportedAnswer).toBe(false);
    expect(e.falseNoAnswer).toBe(false);
  });

  it("an unanswerable question answered from an adjacent page is UNSUPPORTED", () => {
    const e = evaluateAnswer(unanswerable, observation({ passages: [passage("x", 3)] }));
    expect(e.noAnswerOk).toBe(false);
    expect(e.unsupportedAnswer).toBe(true);
  });

  it("an answerable question refused is a FALSE no-answer — a different defect", () => {
    // `What is validty?` — the misspelt concept. Counting it with the
    // unanswerable ones is how a refusal reads as correctness.
    const e = evaluateAnswer(answerable, observation({ answeredAsRefusal: true, groundedCitations: 0 }));
    expect(e.falseNoAnswer).toBe(true);
    expect(e.unsupportedAnswer).toBe(false);
    expect(e.noAnswerOk).toBeNull();
  });
});

describe("entity resolution, citations and answer correctness", () => {
  const q: QuestionLabel = { id: "a", category: "exact_book", templateOk: true, sources: ["right-book"] };

  it("resolving the work the question named passes; another work fails", () => {
    expect(evaluateAnswer(q, observation({ resolvedEntitySlug: "right-book" })).entityOk).toBe(true);
    expect(evaluateAnswer(q, observation({ resolvedEntitySlug: "other-book" })).entityOk).toBe(false);
  });

  it("a question that named no work has no entity to get wrong", () => {
    expect(evaluateAnswer(q, observation({ resolvedEntitySlug: null })).entityOk).toBeNull();
  });

  it("a deleted citation is a citation failure even when the answer survives", () => {
    expect(evaluateAnswer(q, observation({ hallucinatedCitations: 2 })).citationOk).toBe(false);
    expect(evaluateAnswer(q, observation({ hallucinatedCitations: 0 })).citationOk).toBe(true);
  });

  it("answer correctness is deterministic substrings, and null when unstated", () => {
    const claimed: QuestionLabel = { ...q, requiredClaims: ["triangulation", "Multiple Methods"] };
    expect(
      evaluateAnswer(claimed, observation({ answerText: "Triangulation uses multiple methods." })).answerCorrect,
    ).toBe(true);
    expect(evaluateAnswer(claimed, observation({ answerText: "It is a kind of survey." })).answerCorrect).toBe(false);
    expect(evaluateAnswer(q, observation()).answerCorrect).toBeNull();
    expect(claimsSatisfied("A B C", ["a", "c"])).toBe(true);
  });
});

describe("scopeCensus — the derivation is auditable in the report", () => {
  it("counts every question under exactly one scope", () => {
    const labels: QuestionLabel[] = [
      { id: "1", category: "no_answer", expectNoAnswer: true },
      { id: "2", category: "single_document", scoped: true, sources: ["a"] },
      { id: "3", category: "exact_book", templateOk: true, sources: ["a"] },
      {
        id: "4",
        category: "comparison",
        question: 'Compare "Alpha Research Methods" and "Beta Research Methods"',
        sources: ["alpha-research-methods", "beta-research-methods"],
      },
      { id: "5", category: "definition", sources: ["a", "b", "c", "d", "e", "f"] },
    ];
    const census = scopeCensus(labels);
    expect(census).toMatchObject({
      no_evidence: 1,
      single_document: 1,
      metadata: 1,
      multi_document: 1,
      topic_unscoped: 1,
    });
    expect(Object.values(census).reduce((a, b) => a + b, 0)).toBe(labels.length);
  });
});
