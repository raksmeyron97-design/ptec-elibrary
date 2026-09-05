import { describe, expect, it } from "vitest";
import { admitLabel, collectEvidence, scoreTopic, supportedTopics, EVIDENCE_RULES } from "./topics";
import type { ClassifiedPage } from "./passages";

function body(pageNo: number, text: string): ClassifiedPage {
  return { pageNo, kind: "body", body: text, furnitureChars: 0 };
}
function nonBody(pageNo: number, kind: ClassifiedPage["kind"], text: string): ClassifiedPage {
  return { pageNo, kind, body: text, furnitureChars: 0 };
}

describe("admitLabel", () => {
  it.each([
    ["educational research", true],
    ["qualitative research", true],
    ["purposeful sampling", true],
    ["t-test", true],
    ["Cambodia", true],
  ])("admits the real topic %s", (label, expected) => {
    expect(admitLabel(label).admissible).toBe(expected);
  });

  it.each([
    ["ថ្នាក់ទី៧", "locator"],
    ["Grade 7", "locator"],
    ["Volume 1", "locator"],
    ["2024", "locator"],
    ["ក្រសួងអប់រំ", "organization"],
    ["Ministry of Education", "organization"],
    ["PTEC", "organization"],
    ["RCI Fund", "organization"],
    ["STEPSAM3", "project-code"],
    ["សទ្ទានុក្រម", "document-type"],
    ["handbook", "document-type"],
  ])("refuses %s as a %s", (label, reason) => {
    const verdict = admitLabel(label);
    expect(verdict).toEqual({ admissible: false, reason });
  });

  it("refuses a publisher — a book does not cover its own imprint", () => {
    // Both reached a dry run over the real collection before this rule
    // existed: a SAGE textbook names SAGE on dozens of pages, so the evidence
    // gate passes it easily and the resulting claim is false.
    for (const publisher of ["SAGE", "Springer", "Routledge"]) {
      expect(admitLabel(publisher)).toEqual({ admissible: false, reason: "organization" });
    }
  });

  it("refuses a tag that merely restates the record's own title or author", () => {
    const context = { title: "Modern Teaching Strategies", authors: ["Louis Cohen"] };
    expect(admitLabel("Modern Teaching Strategies", context).admissible).toBe(false);
    expect(admitLabel("Louis Cohen", context).admissible).toBe(false);
    // Near-restatements too: "Topics covered: teaching strategies" under a
    // book titled "Modern Teaching Strategies" tells a reader nothing the
    // heading above it did not.
    expect(admitLabel("teaching strategies", context).admissible).toBe(false);
    // A genuine sub-topic of the same book is unaffected.
    expect(admitLabel("classroom management", context).admissible).toBe(true);
  });
});

describe("collectEvidence", () => {
  const pages = [
    nonBody(1, "front-matter", "Sampling and Measurement in Educational Research. A textbook."),
    nonBody(2, "contents", "Contents Sampling 12 Measurement 40 Validity 71 Ethnography 96"),
    body(12, "Sampling is the process of selecting cases. Purposive sampling is one strategy."),
    body(13, "In practice sampling decisions precede every other design decision."),
    body(14, "A researcher weighing sampling against cost will usually compromise."),
    body(40, "Measurement error is the difference between the observed and true score."),
    nonBody(96, "references", "Cohen (2007) Ethnography and Educational Research. Patton (2015)."),
  ];

  it("counts only body pages", () => {
    const [sampling] = collectEvidence(["sampling"], pages);
    expect(sampling.pages).toEqual([12, 13, 14]);
    // Page 1 names it on the cover and page 2 lists it in the contents. Those
    // are mentions, not coverage — admitting them would let a contents page
    // make a book "cover" everything it lists.
    expect(sampling.pages).not.toContain(1);
    expect(sampling.pages).not.toContain(2);
  });

  it("counts every occurrence, not every page", () => {
    const [sampling] = collectEvidence(["sampling"], pages);
    expect(sampling.mentions).toBe(4); // twice on p12, once each on p13 and p14
  });

  it("matches a phrase as a phrase", () => {
    const [purposive] = collectEvidence(["purposive sampling"], pages);
    expect(purposive.pages).toEqual([12]);
  });

  it("does not match inside a longer word", () => {
    const [sample] = collectEvidence(["sample"], [body(5, "Oversampling and subsampling are distinct.")]);
    expect(sample.pages).toEqual([]);
  });

  it("returns nothing when a record has no body pages", () => {
    expect(collectEvidence(["sampling"], [nonBody(1, "contents", "Sampling 12")])).toEqual([]);
  });

  it("skips inadmissible labels before looking for evidence at all", () => {
    const evidence = collectEvidence(["sampling", "Grade 7", "SAGE"], pages);
    expect(evidence.map((e) => e.label)).toEqual(["sampling"]);
  });
});

describe("scoreTopic and the evidence gate", () => {
  const longDocument = { bodyPages: 400 };

  it("refuses a topic carried by too few pages", () => {
    const scored = scoreTopic({ label: "x", key: "x", pages: [10, 11], mentions: 20, ...longDocument });
    expect(scored.supported).toBe(false);
    expect(scored.score).toBe(0);
  });

  it("refuses a topic mentioned once in passing on each of several pages", () => {
    const scored = scoreTopic({ label: "x", key: "x", pages: [10, 50, 90], mentions: 3, ...longDocument });
    expect(scored.mentions).toBeLessThan(EVIDENCE_RULES.minMentions);
    expect(scored.supported).toBe(false);
  });

  it("accepts two pages in a short document, where three would be most of it", () => {
    const scored = scoreTopic({ label: "x", key: "x", pages: [7, 9], mentions: 12, bodyPages: 9 });
    expect(scored.supported).toBe(true);
  });

  it("scores a theme spread through a book above a topic confined to one stretch", () => {
    const spread = scoreTopic({ label: "a", key: "a", pages: [10, 120, 240, 380], mentions: 40, ...longDocument });
    const confined = scoreTopic({ label: "b", key: "b", pages: [10, 11, 12, 13], mentions: 40, ...longDocument });
    expect(spread.score).toBeGreaterThan(confined.score);
  });

  it("orders by evidence and breaks ties on the label, so a rerun is byte-identical", () => {
    const evidence = [
      { label: "beta", key: "beta", pages: [1, 2, 3, 4], mentions: 20, bodyPages: 100 },
      { label: "alpha", key: "alpha", pages: [1, 2, 3, 4], mentions: 20, bodyPages: 100 },
    ];
    expect(supportedTopics(evidence).map((t) => t.label)).toEqual(["alpha", "beta"]);
    expect(supportedTopics([...evidence].reverse()).map((t) => t.label)).toEqual(["alpha", "beta"]);
  });
});
