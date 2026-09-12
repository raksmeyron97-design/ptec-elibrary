// lib/ai/entity-answers.test.ts — what the reader is TOLD when a question
// names a work. Pure: deterministicAnswer over a retrieval outcome.
//
// "Do you have the book X?" used to be answered "I found 5 books related to
// X" whether or not X was among them (docs/AI_BRAIN_2_AUDIT.md §7). Now the
// catalogue's resolution decides the sentence: a resolved work is a yes, a
// named work the catalogue lacks is an honest no, and a topic search keeps
// its neutral count.

import { describe, expect, it } from "vitest";
import { EMPTY_RETRIEVAL, deterministicAnswer } from "./plan";
import { classifyIntent } from "./intent";
import type { SearchResult } from "./response";

const card = (slug: string, title: string): SearchResult => ({
  slug,
  title,
  author: "Irving Seidman",
  coverUrl: null,
  url: `/books/${slug}`,
  type: "book",
});

const INTERVIEWING = card("interviewing-as-qualitative-research-3rd-edition", "Interviewing as Qualitative Research (3rd Edition)");
const NEIGHBOUR = card("research-design", "Research Design");

describe("a question that names a work", () => {
  it("says yes when the work resolved, and shows it first", () => {
    const intent = classifyIntent('Do you have the book "Interviewing as Qualitative Research (3rd Edition)"?');
    const answer = deterministicAnswer(
      intent,
      { ...EMPTY_RETRIEVAL, results: [INTERVIEWING, NEIGHBOUR], entity: { slug: INTERVIEWING.slug, title: INTERVIEWING.title, band: "exact", via: "title" } },
      [],
    );
    expect(answer).toMatch(/^Yes — “Interviewing as Qualitative Research \(3rd Edition\)” by Irving Seidman is in the PTEC Library/);
    expect(answer).toContain("1 related title is shown below");
  });

  it("says no when the named work did not resolve, and labels the neighbours as not it", () => {
    const intent = classifyIntent('Do you have the book "Zebrafish Cardiac Regeneration Handbook"?');
    const answer = deterministicAnswer(intent, { ...EMPTY_RETRIEVAL, results: [NEIGHBOUR] }, []);
    expect(answer).toMatch(/^I couldn’t find a work titled “Zebrafish Cardiac Regeneration Handbook” in the PTEC Library/);
    expect(answer).toContain("not that book");
  });

  it("answers an ISBN that is not in the catalogue as an ISBN", () => {
    const intent = classifyIntent("9781473946293");
    const answer = deterministicAnswer(intent, { ...EMPTY_RETRIEVAL, results: [] }, []);
    expect(answer).toContain("ISBN 9781473946293");
    expect(answer).not.toContain("titled");
  });

  it("keeps a topic search neutral even when a title starts with the topic", () => {
    // "educational psychology" is a topic; a book titled "Educational
    // Psychology (14th Edition)" resolves at the `edition` band and leads the
    // cards, but the reader did not ask whether one specific book exists.
    const intent = classifyIntent("Do you have any books about educational psychology?");
    const answer = deterministicAnswer(
      intent,
      { ...EMPTY_RETRIEVAL, results: [card("ed-psych", "Educational Psychology (14th Edition)"), NEIGHBOUR], entity: { slug: "ed-psych", title: "Educational Psychology (14th Edition)", band: "prefix", via: "title" } },
      [],
    );
    expect(answer).toMatch(/^I found 2 books/);
  });

  it("answers in Khmer when asked in Khmer", () => {
    const intent = classifyIntent("តើមានសៀវភៅ Interviewing as Qualitative Research ទេ?");
    expect(intent.parsed?.frame).toBe("availability");
    const answer = deterministicAnswer(
      intent,
      { ...EMPTY_RETRIEVAL, results: [INTERVIEWING], entity: { slug: INTERVIEWING.slug, title: INTERVIEWING.title, band: "edition", via: "title" } },
      [],
    );
    expect(answer).toContain("បាទ/ចាស មាន");
    expect(answer).toContain(INTERVIEWING.url);
  });
});
