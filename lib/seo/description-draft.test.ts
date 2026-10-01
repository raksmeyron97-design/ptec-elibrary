import { describe, expect, it } from "vitest";
import {
  composeDescriptionDraft,
  contentsHeadings,
  isContentsPage,
  KM_REVIEW_MARKER,
  MIN_HEADINGS,
  type DraftFacts,
} from "./description-draft";
import { carriesReviewMarker } from "./description-review";

// Real `book_pages` text from production, copied from lib/ai/page-quality.test.ts
// (Research Methods in Education, 8th ed., p.10; Social Research Methods p.15).
const RME_CONTENTS =
  "ix c o n t e n t s 11.13 Managing the planning of research 194 11.14 A worked example 196 " +
  "11.15 Ensuring quality in the planning of research 201 12 Sampling 202 12.1 Introduction 202 " +
  "12.2 The sample size 203 12.3 Sampling error 205 12.4 The representativeness of the sample 207 " +
  "12.5 The access to the sample 208 12.6 The sampling strategy to be used 209 12.7 Probability samples 210 " +
  "12.8 Non-probability samples 217 12.9 Planning a sampling strategy 223 12.10 Conclusion 225 " +
  "13 Sensitive educational research 226 13.1 What is sensitive research? 226 13.2 Sampling and access 229";
const SRM_CONTENTS =
  "Detailed contents xiv Sampling error 188 Types of probability sample 190 Simple random sample 190 " +
  "Systematic sample 191 Stratified random sampling 192 Multi-stage cluster sampling 193 " +
  "The qualities of a probability sample 195 Sample size 197 Absolute and relative sample size 197 " +
  "Time and cost 198 Non-response 199 Heterogeneity of the population 200 Kinds of non-probability sample 201";
// The Khmer contents shape page-quality.test.ts pins.
const KM_CONTENTS =
  "មាតិកា ជំពូកទី១ សេចក្តីផ្តើម ១ ជំពូកទី២ វិធីសាស្ត្រ ១៥ ជំពូកទី៣ លទ្ធផល ៤២ " +
  "ជំពូកទី៤ ការពិភាក្សា ៦៨ ជំពូកទី៥ សេចក្តីសន្និដ្ឋាន ៩០ ឯកសារយោង ៩៥ ឧបសម្ព័ន្ធ ១០២ " +
  "តារាងទី១ ចំនួនសិស្ស ២០ តារាងទី២ លទ្ធផលតេស្ត ៥៥ តារាងទី៣ ការវិភាគ ៧៨";
const PROSE =
  "Sampling is the process of choosing who will take part in a study. A researcher must decide how many " +
  "participants are needed. The decision depends on the purpose of the research and on the population. " +
  "Probability samples allow inference to a population. Non-probability samples do not, but they are useful.";

const page = (pageNo: number, content: string) => ({ pageNo, content });

describe("contentsHeadings", () => {
  it("reads the top-level chapters of a real contents page and skips its numbered sections", () => {
    expect(contentsHeadings([page(10, RME_CONTENTS)])).toEqual(["Sampling", "Sensitive educational research"]);
  });

  it("reads labelled Khmer chapters, Khmer digits, and drops the entries every book has", () => {
    expect(contentsHeadings([page(4, KM_CONTENTS)])).toEqual(["វិធីសាស្ត្រ", "លទ្ធផល", "ការពិភាក្សា"]);
  });

  it("an unnumbered contents page yields nothing — there is no way to tell a chapter from a section", () => {
    expect(isContentsPage(SRM_CONTENTS)).toBe(true);
    expect(contentsHeadings([page(15, SRM_CONTENTS)])).toEqual([]);
  });

  it("a page number is not a chapter number: 7, 9, 15, 42 … is no run", () => {
    const text =
      "Contents Foreword 7 Introduction 9 Learning to read in the early grades 15 Learning to write with purpose 42 " +
      "Numbers and counting for young learners 68 Shapes and space in the classroom 90 " +
      "Assessment in the early grades 112 Working with families 120 References 130 Index 140";
    expect(isContentsPage(text)).toBe(true);
    expect(contentsHeadings([page(5, text)])).toEqual([]);
  });

  it("reads only the front matter, and never a prose page", () => {
    expect(contentsHeadings([page(40, KM_CONTENTS)])).toEqual([]);
    expect(contentsHeadings([page(3, PROSE)])).toEqual([]);
  });

  it("joins a contents page with its continuation, in page order", () => {
    // Synthetic shape (labelled English chapters over two pages).
    const p1 =
      "Contents Chapter 1 Foundations of literacy ........ 1 Chapter 2 Phonics and decoding ........ 23 " +
      "Chapter 3 Reading fluency ........ 47 Preface ........ v Acknowledgements ........ vii About this guide ........ ix";
    const p2 =
      "Chapter 4 Vocabulary in the classroom ........ 71 Chapter 5 Assessment for learning ........ 95 " +
      "References ........ 120 Index ........ 131 Glossary ........ 128 Appendix ........ 126";
    expect(contentsHeadings([page(7, p2), page(6, p1)])).toEqual([
      "Foundations of literacy",
      "Phonics and decoding",
      "Reading fluency",
      "Vocabulary in the classroom",
      "Assessment for learning",
    ]);
  });
});

const facts = (over: Partial<DraftFacts> = {}): DraftFacts => ({
  title: "Teaching Early Reading",
  author: "Sok Dara",
  publisher: "MoEYS",
  year: 2019,
  language: "en",
  pages: 140,
  subject: { name: "ភាសា", nameEn: "Language" },
  readable: true,
  downloadable: false,
  headings: ["Foundations of literacy", "Phonics and decoding", "Reading fluency", "Assessment for learning"],
  ...over,
});

describe("composeDescriptionDraft", () => {
  it("states only the facts it was given, and every heading", () => {
    const d = composeDescriptionDraft(facts());
    expect(d.status).toBe("drafted");
    if (d.status !== "drafted") return;
    expect(d.locale).toBe("en");
    expect(d.text).toBe(
      "Teaching Early Reading is an English-language book by Sok Dara, published by MoEYS in 2019. " +
        "It is catalogued under Language. It runs to 140 pages. Its chapters cover Foundations of literacy, " +
        "Phonics and decoding, Reading fluency and Assessment for learning. The full text can be read online free of charge.",
    );
    expect(carriesReviewMarker(d.text)).toBe(false);
  });

  it("is reported as short rather than padded to 80 words", () => {
    const d = composeDescriptionDraft(facts());
    expect(d.status === "drafted" && d.short && d.words < 80).toBe(true);
  });

  it("says nothing it does not know — no year, publisher, pages, subject or reading offer", () => {
    const d = composeDescriptionDraft(
      facts({ year: null, publisher: null, pages: null, subject: null, readable: false, author: "Windows User" }),
    );
    expect(d.status === "drafted" && d.text).toBe(
      "Teaching Early Reading is an English-language book. Its chapters cover Foundations of literacy, " +
        "Phonics and decoding, Reading fluency and Assessment for learning.",
    );
  });

  it("an unapproved English subject name is not invented: the Khmer name stands", () => {
    const d = composeDescriptionDraft(facts({ subject: { name: "ភាសា", nameEn: null } }));
    expect(d.status === "drafted" && d.text).toContain("catalogued under ភាសា.");
  });

  it("drafts a Khmer book in Khmer, marked for review so approval refuses it until checked", () => {
    const d = composeDescriptionDraft(
      facts({ title: "ការបង្រៀនអំណាន", language: "km", headings: ["វិធីសាស្ត្រ", "លទ្ធផល", "ការពិភាក្សា"], downloadable: true }),
    );
    expect(d.status).toBe("drafted");
    if (d.status !== "drafted") return;
    expect(d.locale).toBe("km");
    expect(d.text.startsWith(KM_REVIEW_MARKER)).toBe(true);
    expect(carriesReviewMarker(d.text)).toBe(true);
    expect(d.text).toContain("វិធីសាស្ត្រ, លទ្ធផល និង ការពិភាក្សា");
    expect(d.text).toContain("និងអាចទាញយកបាន");
  });

  it("no contents, or too few chapters, is no draft — a librarian writes that one", () => {
    expect(composeDescriptionDraft(facts({ headings: [] }))).toEqual({ status: "skipped", reason: "no_contents", headings: 0 });
    expect(composeDescriptionDraft(facts({ headings: ["A one", "B two"] }))).toEqual({
      status: "skipped",
      reason: "too_few_headings",
      headings: MIN_HEADINGS - 1,
    });
  });
});
