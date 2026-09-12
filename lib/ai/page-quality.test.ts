// lib/ai/page-quality.test.ts — a book's furniture is not evidence.
//
// Every fixture below is REAL text, copied from `book_pages` rows in the PTEC
// collection during the AI Brain 2.1 audit, with the page it came from named.
// A synthetic contents page would prove only that the regex matches itself;
// these are the exact strings the retrieval benchmark's misses returned.

import { describe, expect, it } from "vitest";
import { assessPageText, isSubstantivePage } from "./page-quality";

// Research Methods in Education (8th Edition) p.10 — retrieved instead of the
// labelled sampling page. The letter-spaced running head is how pdf.js
// extracts Routledge's contents heading.
const RME_CONTENTS =
  "ix c o n t e n t s 11.13 Managing the planning of research 194 11.14 A worked example 196 " +
  "11.15 Ensuring quality in the planning of research 201 12 Sampling 202 12.1 Introduction 202 " +
  "12.2 The sample size 203 12.3 Sampling error 205 12.4 The representativeness of the sample 207 " +
  "12.5 The access to the sample 208 12.6 The sampling strategy to be used 209 12.7 Probability samples 210 " +
  "12.8 Non-probability samples 217 12.9 Planning a sampling strategy 223 12.10 Conclusion 225 " +
  "13 Sensitive educational research 226 13.1 What is sensitive research? 226 13.2 Sampling and access 229";

// Social Research Methods (4th Edition) p.15.
const SRM_CONTENTS =
  "Detailed contents xiv Sampling error 188 Types of probability sample 190 Simple random sample 190 " +
  "Systematic sample 191 Stratified random sampling 192 Multi-stage cluster sampling 193 " +
  "The qualities of a probability sample 195 Sample size 197 Absolute and relative sample size 197 " +
  "Time and cost 198 Non-response 199 Heterogeneity of the population 200 Kinds of non-probability sample 201";

// Qualitative Inquiry and Research Design (4th Edition) p.7 — no page numbers
// at all. Its entry numbering ("1. Introduction") is what used to read as
// sentence structure.
const QI_CONTENTS =
  "Detailed Contents About the Authors Acknowledgments Analytic Table of Contents by Approach " +
  "List of Tables and Figures 1. Introduction Purpose and Rationale for the Book What Is New in This Edition " +
  "Positioning Ourselves Definition of Terms 2. Philosophical Assumptions and Interpretive Frameworks " +
  "Questions for Discussion Philosophical Assumptions Interpretive Frameworks";

// Research Methods in Education (8th Edition) p.20 — a list of figures. Fewer
// numbers than a contents page, and the reason the locator floor is 10%.
const RME_FIGURES =
  "xix 1.1 The functions of science 11 1.2 The hypothesis 13 1.3 Stages in the development of a science 13 " +
  "1.4 An eight- stage model of the scientific method 14 1.5 A classroom episode 18 7.1 The costs/benefits ratio 113 " +
  "7.2 Absolute and relative ethics 115 8.1 Informed consent 122 9.1 Data protection 141 10.1 Reliability 155 " +
  "11.1 A planning matrix 180 11.2 A planning sequence 183 12.1 Sample sizes 204 12.2 Sampling error 206";

// Research Design (Creswell) p.338 — a back-of-book subject index.
const CRESWELL_INDEX =
  "Self-Control schedule, 69 Single-group interrupted time-series design, 172 Single-subject design, 169, 174 " +
  "Single-subject experimental research: Applications for literacy (Neuman, McCormick), 182 " +
  "The Social Construction of Reality (Berger, Luekmann), 8 Social constructivists, 8 " +
  "Social science research problems, 115 theories in, 69–70 traditional approaches to, 199 " +
  "Social Sciences Citation Index (SSCI), 34 Socioeconomic status (SES), 52 Sociological Abstracts, 34 " +
  "Solomon four-group design, 173 Spurious variables. See Confounding variables " +
  "Statistical conclusion validity, 176–177 Statistical testing, 164 table, 165 " +
  "Strategies inquiry, 12 mixed methods studies, 219 qualitative reports, 204–205 validity, 201–202 " +
  "Strategies of inquiry, 12 Style guides, 32 Style manuals, 41–42 Survey design data collection in, 157 " +
  "function of, 155 instrumentation in, 159–161 method section, example, 165–166 po";

// Research Methods in Education (8th Edition) p.97 — a real chapter opening,
// and the page the filter must never touch.
const RME_PROSE =
  "Educational researchers are frequently exhorted to root their research in a theoretical framework. " +
  "This short chapter explores what this means and addresses the following issues: What does 'theory' mean " +
  "and how does it relate to research? Theory is a way of explaining phenomena. A theory is a set of " +
  "interrelated constructs and propositions that specify relations among variables in order to explain " +
  "and predict. Researchers should be clear about which theory they are using and why they are using it. " +
  "The choice is never neutral, and it shapes both what is asked and what counts as an answer.";

// 100 Activities for Teaching Research Methods p.379 — 35 words that name
// three definitions without containing any of them. It is KEPT, and that is
// the point: whether a paragraph is useful is a judgement about its subject,
// and this module does not make those. Retrieval's scoring ranks it low.
const CROSS_REFERENCE =
  "Useful terms See 'useful terms' in Activity 37 for a definition of 'structured', 'semi-structured' " +
  "and 'unstructured' interviews and Activity 40 for a definition of 'focus groups'. " +
  "The student handout gives a definition of 'interview schedule'.";

describe("front matter is recognised as furniture", () => {
  it("a letter-spaced contents running head with entry numbers", () => {
    const a = assessPageText(RME_CONTENTS);
    expect(a.kind).toBe("front_matter");
    expect(a.substantive).toBe(false);
  });

  it("a detailed-contents page", () => {
    expect(assessPageText(SRM_CONTENTS).substantive).toBe(false);
  });

  it("a contents page with NO page numbers — entry numbering is not sentences", () => {
    // "1. Introduction" gave this page 2.2 sentence ends per 100 words and let
    // it through as evidence until the digit lookbehind was added.
    const a = assessPageText(QI_CONTENTS);
    expect(a.sentenceDensity).toBeLessThan(1.5);
    expect(a.substantive).toBe(false);
  });

  it("a list of figures, which carries fewer numbers than a contents page", () => {
    const a = assessPageText(RME_FIGURES);
    expect(a.numericRatio).toBeGreaterThanOrEqual(0.1);
    expect(a.numericRatio).toBeLessThan(0.2);
    expect(a.kind).toBe("index");
    expect(a.substantive).toBe(false);
  });

  it("a back-of-book subject index — its author initials are not sentences", () => {
    // "(Neuman, McCormick), 182" and "Spradley, J. P., 190": every initial was
    // read as a sentence boundary until the capital-letter lookbehind.
    const a = assessPageText(CRESWELL_INDEX);
    expect(a.kind).toBe("index");
    expect(a.substantive).toBe(false);
  });

  it("a title page and a cross-reference stub carry no claim at all", () => {
    // 16, 9 and 17 words. Everything this floor exists for is this short.
    for (const stub of [
      "Interviewing as Qualitative Research A Guide for Researchers Third Edition",
      "Qualitative Coding The Manual Researchers for Johnny Saldaña 3E",
      "Related activities Activity 36: Undertaking ethnographic work Activity 45: Using observation techniques",
    ]) {
      expect(assessPageText(stub).kind, stub).toBe("sparse");
    }
  });
});

describe("prose is never dropped", () => {
  it("a short paragraph is still a paragraph", () => {
    // Found by CI: at a 40-word floor these five seeded pages were dropped as
    // `sparse` and six e2e tests failed with an empty sources panel. They are
    // 30–37 words with 5.4–6.7 sentence ends per 100 words.
    for (const page of [
      "Formative assessment is best understood as a continuous process rather than an event. The teacher gathers evidence of learning during instruction, interprets it against the intended outcome, and adjusts the next step accordingly.",
      "Assessment for certification and assessment for learning answer different questions. Confusing the two produces a classroom where every task is graded and none of the grading changes what happens next.",
    ]) {
      const a = assessPageText(page);
      expect(a.kind, page.slice(0, 40)).toBe("prose");
      expect(a.substantive).toBe(true);
    }
  });

  it("a paragraph that only POINTS at a definition is still prose", () => {
    // Dropping it would be a judgement about the subject, not the structure.
    expect(assessPageText(CROSS_REFERENCE).substantive).toBe(true);
  });

  it("a chapter opening with no numbers at all", () => {
    const a = assessPageText(RME_PROSE);
    expect(a.kind).toBe("prose");
    expect(a.substantive).toBe(true);
    expect(a.sentenceDensity).toBeGreaterThan(1.5);
  });

  it("prose that happens to mention contents or acknowledgements is kept", () => {
    // A marker ALONE may never decide — two signals are always required.
    const text =
      "The acknowledgements of a research report should name every funder. " +
      "Researchers often overlook this, and journals increasingly require it. " +
      "A table of contents, by contrast, is a navigational aid and carries no claim. " +
      "This chapter explains why the distinction matters to readers of educational research, " +
      "and what a reviewer should look for when neither section is present in a submitted manuscript.";
    const a = assessPageText(text);
    expect(a.kind).toBe("prose");
    expect(a.substantive).toBe(true);
  });

  it("a dense statistics page is prose, because it has sentences around its numbers", () => {
    const text =
      "Table 12.2 reports the sampling error for each sample size. At 30 cases the error is 18 per cent, " +
      "at 100 cases it is 10 per cent, and at 1000 cases it falls to 3 per cent. The relationship is not " +
      "linear, and researchers routinely misread it. A sample of 400 gives an error of 5 per cent, which is " +
      "the figure most survey work is designed around. Doubling that sample to 800 buys only 2 percentage points.";
    expect(assessPageText(text).substantive).toBe(true);
  });

  it("Khmer prose is kept — the khan is its sentence terminator", () => {
    const text =
      "ការស្រាវជ្រាវសកម្មភាពគឺជាវិធីសាស្ត្រមួយដែលគ្រូបង្រៀនប្រើដើម្បីកែលម្អការបង្រៀនរបស់ខ្លួន។ " +
      "វិធីសាស្ត្រនេះមានជំហានបួន គឺការគ្រោងទុក សកម្មភាព ការសង្កេត និងការឆ្លុះបញ្ចាំង។ " +
      "គ្រូបង្រៀនត្រូវប្រមូលទិន្នន័យពីថ្នាក់រៀនរបស់ខ្លួនជាប្រចាំ។ " +
      "លទ្ធផលនៃការស្រាវជ្រាវនេះជួយឱ្យគ្រូយល់ដឹងអំពីសិស្សកាន់តែច្បាស់។";
    const a = assessPageText(text);
    expect(a.kind).toBe("prose");
    expect(a.substantive).toBe(true);
  });

  it("Khmer front matter is recognised by its own heading", () => {
    const text =
      "មាតិកា ជំពូកទី១ សេចក្តីផ្តើម ១ ជំពូកទី២ វិធីសាស្ត្រ ១៥ ជំពូកទី៣ លទ្ធផល ៤២ " +
      "ជំពូកទី៤ ការពិភាក្សា ៦៨ ជំពូកទី៥ សេចក្តីសន្និដ្ឋាន ៩០ ឯកសារយោង ៩៥ ឧបសម្ព័ន្ធ ១០២ " +
      "តារាងទី១ ចំនួនសិស្ស ២០ តារាងទី២ លទ្ធផលតេស្ត ៥៥ តារាងទី៣ ការវិភាគ ៧៨";
    expect(assessPageText(text).substantive).toBe(false);
  });
});

describe("the helper agrees with the assessment", () => {
  it("isSubstantivePage is assessPageText().substantive", () => {
    expect(isSubstantivePage(RME_PROSE)).toBe(true);
    expect(isSubstantivePage(RME_CONTENTS)).toBe(false);
    expect(isSubstantivePage("")).toBe(false);
  });
});
