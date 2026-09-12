// lib/ai/query.test.ts — the structured reading of a question.
//
// Each frame here is a shape a PTEC reader actually types, and each guard is a
// question that a naive "what is (.+)" would have misread. The parser is pure,
// so these run offline and pin the exact topic retrieval will embed.

import { describe, expect, it } from "vitest";
import { compareSides, detectFrame, detectQueryLanguage, parseQuery } from "./query";

describe("detectQueryLanguage", () => {
  it("tells English, Khmer and mixed apart", () => {
    expect(detectQueryLanguage("What is validity?")).toBe("en");
    expect(detectQueryLanguage("តើបណ្ណាល័យបើកម៉ោងប៉ុន្មាន?")).toBe("km");
    expect(detectQueryLanguage("តើសៀវភៅនេះនិយាយអ្វីអំពី sampling?")).toBe("mixed");
  });
});

describe("definition frame", () => {
  it.each([
    ["What is action research?", "action research"],
    ["What is validity?", "validity"],
    ["What are focus groups?", "focus groups"],
    ["What is a case study?", "case study"],
    ["What is the meaning of triangulation?", "triangulation"],
    ["Define grounded theory", "grounded theory"],
    ["What does scaffolding mean?", "scaffolding"],
    ["តើការស្រាវជ្រាវសកម្មភាពគឺជាអ្វី?", "ការស្រាវជ្រាវសកម្មភាព"],
    ["អ្វីទៅជាការវាយតម្លៃ?", "ការវាយតម្លៃ"],
  ])("%s → %s", (q, topic) => {
    expect(detectFrame(q)).toEqual({ frame: "definition", topic });
  });

  it("keeps a word that begins with an article's letters", () => {
    // `(?:a|an|the)?\s*` once consumed the "a" of "action".
    expect(detectFrame("What is action research?")?.topic).toBe("action research");
    expect(detectFrame("What is an interview?")?.topic).toBe("interview");
  });

  it("refuses to call a pointer at the reader's page a topic", () => {
    expect(detectFrame("what is this book about?")).toBeNull();
    expect(detectFrame("What is in this book?")).toBeNull();
    expect(detectFrame("what is your phone number")).toBeNull();
    expect(detectFrame("What is the library's address")).toBeNull();
  });
});

describe("explanation frame", () => {
  it.each([
    ["Explain ethics as the library's books describe it.", "ethics"],
    ["Explain classroom management as the library's books describe it.", "classroom management"],
    ["Explain the concept of scaffolding", "scaffolding"],
    ["Can you explain reflective practice?", "reflective practice"],
    ["How does differentiated instruction work?", "differentiated instruction"],
    ["ពន្យល់អំពី scaffolding", "scaffolding"],
  ])("%s → %s", (q, topic) => {
    expect(detectFrame(q)).toEqual({ frame: "explanation", topic });
  });

  it("does not turn 'explain how this works' into a corpus topic", () => {
    expect(detectFrame("explain deeply how this works")).toBeNull();
  });
});

describe("evidence frame", () => {
  it.each([
    ["What does the literature say about triangulation?", "triangulation"],
    ["What does the library's literature say about validity?", "validity"],
    ["What do the books say about classroom management?", "classroom management"],
    ["Across the library's books, how is scaffolding handled?", "scaffolding"],
    ["Across the library's books, how is assessment for learning handled?", "assessment for learning"],
    ["Across the collection, what is said about ethics?", "ethics"],
    ["According to the books, what is grounded theory?", "grounded theory"],
    ["According to the literature, how is reliability established?", "reliability established"],
    ["How is inclusive education handled in the library's books?", "inclusive education"],
    ["តើអក្សរសិល្ប៍និយាយអំពី sampling?", "sampling"],
  ])("%s → %s", (q, topic) => {
    expect(detectFrame(q)).toEqual({ frame: "evidence", topic });
  });
});

describe("entity frames", () => {
  it("reads 'who wrote X' as a work named X", () => {
    const q = parseQuery('Who wrote "English for Writing Research Papers"?');
    expect(q.frame).toBe("author_lookup");
    expect(q.titleCandidates).toEqual(["English for Writing Research Papers"]);
    expect(q.authorCandidates).toEqual([]);
    expect(q.exactEntityRequired).toBe(true);
    expect(parseQuery("Who wrote Practical Research Methods?").titleCandidates).toEqual(["Practical Research Methods"]);
    expect(parseQuery("តើអ្នកណាសរសេរសៀវភៅ Practical Research Methods?").titleCandidates).toEqual(["Practical Research Methods"]);
  });

  it("reads 'do you have the book X' as an availability check on X", () => {
    const q = parseQuery('Do you have the book "Interviewing as Qualitative Research (3rd Edition)"?');
    expect(q.frame).toBe("availability");
    expect(q.topic).toBe("Interviewing as Qualitative Research (3rd Edition)");
    expect(q.exactEntityRequired).toBe(true);
    expect(parseQuery("Is Research Methods in Education available?").titleCandidates).toEqual(["Research Methods in Education"]);
    expect(parseQuery("Do you have a copy of the book Practical Research Methods in the library?").topic).toBe("Practical Research Methods");
  });

  it("keeps 'do you have books about X' a topic search", () => {
    const q = parseQuery("Do you have any books about educational psychology?");
    expect(q.frame).toBe("none");
    expect(q.exactEntityRequired).toBe(false);
    expect(parseQuery("តើមានសៀវភៅអំពីគរុកោសល្យទេ?").frame).toBe("none");
  });

  it("recognises a bare ISBN in any of its written forms", () => {
    expect(parseQuery("9781473946293").isbnCandidates).toEqual(["9781473946293"]);
    expect(parseQuery("978-1-4739-4629-3").isbnCandidates).toEqual(["9781473946293"]);
    expect(parseQuery("SPSS 16.0 explained").isbnCandidates).toEqual([]);
  });

  it("names an unquoted title after 'the book'", () => {
    expect(parseQuery("Tell me about the book Practical Research Methods").titleCandidates).toEqual(["Practical Research Methods"]);
  });
});

describe("comparison", () => {
  it("believes quotation marks over the word 'and'", () => {
    expect(compareSides('Compare "English for Writing Research Papers" and "Essentials of Research Design and Methodology"')).toEqual([
      "English for Writing Research Papers",
      "Essentials of Research Design and Methodology",
    ]);
  });

  it("reads a difference-between question as a comparison of two concepts", () => {
    const q = parseQuery("What is the difference between validity and reliability?");
    expect(q.frame).toBe("comparison");
    expect(q.compareTargets).toEqual(["validity", "reliability"]);
    expect(q.requiresEvidence).toBe(true);
  });

  it("refuses to invent a second side", () => {
    expect(compareSides("compare these two")).toEqual([]);
  });

  it("reads the comparison word at the END, which is where Khmer puts it", () => {
    // `តើ X និង Y ខុសគ្នាយ៉ាងណា?` is "how do X and Y differ?". COMPARE_LEAD
    // anchors at the start, so every Khmer concept comparison used to fall
    // through to document_compare with no sides parsed, resolve no works, and
    // answer with the insufficient-text refusal. Measured 2026-09-12: the
    // English form of the same question retrieved five passages and cited
    // two; the Khmer form retrieved zero, with or without the misspellings
    // that were being blamed for it.
    expect(compareSides("តើ validity និង reliability ខុសគ្នាយ៉ាងណា?")).toEqual(["validity", "reliability"]);
    expect(compareSides("តើ validty និង reliabilty ខុសគ្នាយ៉ាងណា?")).toEqual(["validty", "reliabilty"]);
    expect(compareSides("ប្រៀបធៀប validity និង reliability")).toEqual(["validity", "reliability"]);
    expect(parseQuery("តើ validity និង reliability ខុសគ្នាយ៉ាងណា?").frame).toBe("comparison");
  });

  it("reads the English trailing form too", () => {
    expect(compareSides("How do validity and reliability differ?")).toEqual(["validity", "reliability"]);
  });

  it("does not read every sentence containing 'and' as a comparison", () => {
    // The trailing pattern is anchored on a comparison WORD; without one
    // there is no comparison, however many conjunctions the sentence has.
    for (const q of [
      "What does the library say about validity and reliability?",
      "Do you have research methods and evaluation?",
      "How is action research handled?",
      "Explain sampling and its uses",
      "តើសៀវភៅណាដែលពន្យល់អំពី validity និង reliability?",
    ]) {
      expect(compareSides(q), q).toEqual([]);
    }
  });
});

describe("answer-policy flags", () => {
  it("marks concept questions as evidence-requiring and synthesisable", () => {
    for (const q of ["What is validity?", "Explain sampling", "What does the literature say about ethics?"]) {
      const p = parseQuery(q);
      expect(p.requiresEvidence, q).toBe(true);
      expect(p.allowsSynthesis, q).toBe(true);
      expect(p.noAnswerAllowed, q).toBe(true);
    }
  });

  it("marks an unframed question as undecided, not as evidence-requiring", () => {
    const p = parseQuery("who won the world cup in 1998");
    expect(p.frame).toBe("none");
    expect(p.requiresEvidence).toBe(false);
    expect(p.topic).toBe("who won the world cup in 1998");
  });

  it("never throws on hostile input", () => {
    for (const q of ["", "   ", "!!!", "\"\"", "a".repeat(600), "🙂", "<script>"]) {
      expect(() => parseQuery(q)).not.toThrow();
    }
  });
});

describe("a question that names its SOURCE", () => {
  it("reads 'according to X, what is Y' as evidence about Y scoped to the work X", () => {
    const q = parseQuery("According to Essentials of Research Design and Methodology, what is validity?");
    expect(q.frame).toBe("evidence");
    expect(q.topic).toBe("validity");
    expect(q.scopeTitle).toBe("Essentials of Research Design and Methodology");
    expect(q.titleCandidates).toContain("Essentials of Research Design and Methodology");
  });

  it("reads 'what does X say about Y' the same way, quoted or not", () => {
    expect(parseQuery('What does "SPSS Explained" say about regression?')).toMatchObject({ frame: "evidence", topic: "regression", scopeTitle: "SPSS Explained" });
    expect(parseQuery("What does Practical Research Methods say about interviews?")).toMatchObject({ topic: "interviews", scopeTitle: "Practical Research Methods" });
  });

  it("never mistakes the collection nouns for a work", () => {
    expect(parseQuery("What do the books say about triangulation?").scopeTitle).toBeUndefined();
    expect(parseQuery("According to the literature, how is reliability established?").scopeTitle).toBeUndefined();
    expect(parseQuery("What does this book say about sampling?").scopeTitle).toBeUndefined();
  });
});

describe("an ISBN carried inside a sentence", () => {
  it("is found and canonicalised", () => {
    expect(parseQuery("Do you have ISBN 0471470538?").isbnCandidates).toEqual(["9780471470533"]);
    expect(parseQuery("do you have 978-0-415-27410-4 in stock").isbnCandidates).toEqual(["9780415274104"]);
  });
  it("does not read a page number or a year as an ISBN", () => {
    expect(parseQuery("what does it say on page 1234567890?").isbnCandidates).toEqual([]);
    expect(parseQuery("books published in 2019").isbnCandidates).toEqual([]);
  });
});

describe("v2 edge cases", () => {
  it("reads an unquoted Title-Case phrase after 'do you have' as a work", () => {
    // "action research" is a thesis keyword; the title must not be a thesis search.
    const q = parseQuery("Do you have The Action Research Guidebook: A Four-Step Process?");
    expect(q.frame).toBe("availability");
    expect(q.titleCandidates).toEqual(["The Action Research Guidebook: A Four-Step Process"]);
    expect(parseQuery("Do you have Research Methods in Education?").frame).toBe("availability");
  });

  it("keeps a lower-case or single-capital request a topic search", () => {
    expect(parseQuery("Do you have anything on reading?").frame).toBe("none");
    expect(parseQuery("do you have books about educational psychology").frame).toBe("none");
    expect(parseQuery("Do you have Piaget?").frame).toBe("none");
  });

  it("reads 'summarize X' as a summary of the work X", () => {
    const q = parseQuery("Summarize SPSS Explained");
    expect(q.frame).toBe("summary");
    expect(q.titleCandidates).toEqual(["SPSS Explained"]);
    expect(parseQuery("Summarize this book").frame).toBe("none");
    expect(parseQuery("សង្ខេបសៀវភៅនេះ").frame).toBe("none");
  });
});

describe("regexes over reader input are linear, not exponential", () => {
  it("TITLE_CASE does not backtrack on a crafted capitalised run", () => {
    // CodeQL js/redos, found on PR #175. The old alternation
    // `(?:[a-z]{1,3}|[A-Z0-9:&-]\S*|\S*[A-Z]\S*)` under a `*` let one token
    // match three ways — `\S*[A-Z]\S*` matches "AA" with an empty prefix OR
    // an "A" prefix — so `"A " + "AA ".repeat(n) + "!"` cost 2 ms at n=8 and
    // 2,885 ms at n=16. This regex runs on the reader's own topic on every AI
    // request, so a crafted question could have pinned a CPU.
    const attack = `A ${"AA ".repeat(400)}!`;
    const started = performance.now();
    // detectFrame is where TITLE_CASE is applied to reader input.
    detectFrame(`Do you have the book ${attack}`);
    parseQuery(attack);
    expect(performance.now() - started).toBeLessThan(250);
  });

  it("and it still recognises a title written without quotes", () => {
    for (const title of [
      "Practical Research Methods",
      "Research Methods in Education",
      "From Teacher to Manager: Managing Language Teaching Organizations",
      "100 Activities for Teaching Research Methods",
    ]) {
      expect(parseQuery(`Do you have the book ${title}?`).titleCandidates.length, title).toBeGreaterThan(0);
    }
  });

  it("COMPARE_TRAIL needs real whitespace before the conjunction", () => {
    // The separator was `\s*(?:\s|^)`, whose `^` could never match — it sat
    // after a group that must consume two characters. Requiring `\s+` is what
    // it was reaching for: without it "brand new" splits at "br|and".
    expect(compareSides("How do brand and generic differ?")).toEqual(["brand", "generic"]);
    expect(compareSides("How do brandnew items differ?")).toEqual([]);
  });
});
