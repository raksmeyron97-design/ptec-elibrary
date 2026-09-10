// lib/ai/answer-failure.test.ts
//
// The rule these protect is the one in §29 of the brief and in the module's own
// header: nothing may be called a MODEL failure without evidence that every
// upstream stage was correct. A classifier that reaches for "the model is bad"
// is how a team ends up fine-tuning its way around a keyword table.

import { describe, expect, it } from "vitest";
import { diagnoseAnswer, modelReasoningAssessable, type AnswerFacts } from "./answer-failure";

/** A question that went perfectly. Each test breaks exactly one thing. */
function healthy(over: Partial<AnswerFacts> = {}): AnswerFacts {
  return {
    routingOk: true,
    retrievalDisabled: false,
    deterministic: false,
    templateAcceptable: false,
    expectNoAnswer: false,
    answeredAsRefusal: false,
    evidenceCount: 4,
    expectedSourceFound: true,
    contextPrecision: 1,
    expectedSourcesExhaustive: true,
    expectGrounded: true,
    grounded: true,
    hallucinatedCitations: 0,
    answerNonEmpty: true,
    modelAnswered: true,
    ...over,
  };
}

describe("diagnoseAnswer", () => {
  it("returns null when nothing failed", () => {
    expect(diagnoseAnswer(healthy())).toBeNull();
  });

  it("A — a question sent to an intent that cannot answer it", () => {
    // "What is action research?" reaching the catch-all, or "Explain X as the
    // books describe it" reaching a catalogue search.
    expect(diagnoseAnswer(healthy({ routingOk: false }))?.letter).toBe("A");
  });

  it("A — a template where the reader needed evidence", () => {
    const d = diagnoseAnswer(healthy({ deterministic: true, templateAcceptable: false }));
    expect(d?.letter).toBe("A");
    expect(d?.remedy).toMatch(/deterministicAnswer/);
  });

  it("A — a correct intent whose mode retrieves nothing", () => {
    const d = diagnoseAnswer(healthy({ retrievalDisabled: true, evidenceCount: 0, expectedSourceFound: false }));
    expect(d?.letter).toBe("A");
    expect(d?.remedy).toMatch(/retrievalModeFor/);
  });

  it("B — the corpus can answer it and retrieval returned nothing", () => {
    const d = diagnoseAnswer(healthy({ evidenceCount: 0, expectedSourceFound: false, contextPrecision: null }));
    expect(d?.letter).toBe("B");
  });

  it("B — passages came back and none from a source that answers the question", () => {
    expect(diagnoseAnswer(healthy({ expectedSourceFound: false, contextPrecision: 0 }))?.letter).toBe("B");
  });

  it("D — the right source was found but the prompt is mostly other books", () => {
    expect(diagnoseAnswer(healthy({ contextPrecision: 0.2 }))?.letter).toBe("D");
  });

  it("D does NOT fire where the label cannot bear the weight", () => {
    // "What does the literature say about X" is labelled with a recall list,
    // not an exhaustive one, so an answer drawing on an unlabelled book scores
    // low precision while being a better answer. Reporting that as a context
    // defect sends someone to tune a diversity cap that is working.
    expect(
      diagnoseAnswer(healthy({ contextPrecision: 0.2, expectedSourcesExhaustive: false })),
    ).toBeNull();
  });

  it("E — evidence reached the prompt and the answer still refused", () => {
    const d = diagnoseAnswer(healthy({ answeredAsRefusal: true }));
    expect(d?.letter).toBe("E");
    expect(d?.remedy).toMatch(/prompts\.ts/);
  });

  it("H — a citation the retrieval set does not contain", () => {
    expect(diagnoseAnswer(healthy({ hallucinatedCitations: 2 }))?.letter).toBe("H");
  });

  it("G — substance with no citation that survived grounding", () => {
    expect(diagnoseAnswer(healthy({ grounded: false }))?.letter).toBe("G");
  });

  it("I — a subject the collection does not hold, answered anyway", () => {
    const d = diagnoseAnswer(healthy({ expectNoAnswer: true, answeredAsRefusal: false, evidenceCount: 3 }));
    expect(d?.letter).toBe("I");
  });

  it("I — a correct refusal is not a failure at all", () => {
    expect(
      diagnoseAnswer(healthy({ expectNoAnswer: true, answeredAsRefusal: true, evidenceCount: 0 })),
    ).toBeNull();
  });

  describe("the model is the LAST resort", () => {
    it("never blames the model while an upstream stage is broken", () => {
      // Every one of these has an empty answer — the only symptom that can
      // reach F — and every one must still be attributed upstream.
      const upstreamBroken: Partial<AnswerFacts>[] = [
        { routingOk: false },
        { expectedSourceFound: false },
        { contextPrecision: 0.1 },
        { hallucinatedCitations: 1 },
        { answeredAsRefusal: true },
        { deterministic: true, templateAcceptable: false },
      ];
      for (const over of upstreamBroken) {
        const d = diagnoseAnswer(healthy({ answerNonEmpty: false, ...over }));
        expect(d?.stage).not.toBe("MODEL_REASONING");
      }
    });

    it("does not blame the model for an empty answer no model produced", () => {
      const d = diagnoseAnswer(healthy({ answerNonEmpty: false, grounded: true, modelAnswered: false }));
      expect(d?.letter).toBe("E");
    });

    it("reaches F only with every upstream stage verified AND a model in the loop", () => {
      const d = diagnoseAnswer(healthy({ answerNonEmpty: false, modelAnswered: true }));
      expect(d?.letter).toBe("F");
      expect(d?.remedy).toMatch(/ONLY class of failure/);
    });
  });

  it("says plainly that F cannot be assessed without a live model", () => {
    // A run under the mock provider reporting zero model failures is reporting
    // that it could not look, not that it looked and found none.
    expect(modelReasoningAssessable(false)).toBe(false);
    expect(modelReasoningAssessable(true)).toBe(true);
  });
});
