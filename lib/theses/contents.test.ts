import { describe, it, expect } from "vitest";
import {
  CONTENTS_LIMITS,
  draftContents,
  parseContentsText,
  sanitizeContents,
  type IndexedPage,
} from "@/lib/theses/contents";

// Inputs are shaped like `book_pages.content`: pdf.js items joined with single
// spaces, no line breaks (lib/pdf-page-index.ts) — which is the whole reason
// the parser has to infer where an entry ends.

const EN_CONTENTS_P1 =
  "TABLE OF CONTENTS Page DECLARATION i ACKNOWLEDGEMENTS ii ABSTRACT iii TABLE OF CONTENTS iv " +
  "LIST OF TABLES vi CHAPTER 1 INTRODUCTION 1 1.1 Background of the Study 1 1.2 Statement of the Problem 3 " +
  "1.3 Research Questions 4 1.3.1 Sub-question one 4 CHAPTER 2 LITERATURE REVIEW 6 2.1 Play-based learning 6 " +
  "2.2 Early numeracy in Grade 1 pupils 9 v";
const EN_CONTENTS_P2 =
  "TABLE OF CONTENTS (continued) CHAPTER 3 METHODOLOGY 14 3.1 Research design 14 3.2 Participants 16 " +
  "CHAPTER 4 FINDINGS 21 CHAPTER 5 DISCUSSION AND RECOMMENDATIONS 30 REFERENCES 40 APPENDICES 45 vi";
const LIST_OF_TABLES =
  "LIST OF TABLES Table 1 Participants by school 16 Table 2 Pre-test scores 22 Table 3 Post-test scores 24 " +
  "Table 4 Classroom observations 26 Table 5 Teacher interviews 28 vii";
const PROSE =
  "This chapter describes the design of the study. The researcher selected two public primary schools in " +
  "Phnom Penh. Sixty-four pupils took part over eight weeks. The contents of each lesson followed the national " +
  "curriculum for Grade 1. Data were collected through tests and observations. Ethical approval was obtained.";

describe("parseContentsText — English", () => {
  const entries = parseContentsText(EN_CONTENTS_P1 + " " + EN_CONTENTS_P2);

  it("reads front matter with its roman page numbers", () => {
    expect(entries.slice(0, 3)).toEqual([
      { level: 1, label: "DECLARATION", page: "i" },
      { level: 1, label: "ACKNOWLEDGEMENTS", page: "ii" },
      { level: 1, label: "ABSTRACT", page: "iii" },
    ]);
  });

  it("keeps 'List of Tables' as an ENTRY when a page number follows it", () => {
    expect(entries).toContainEqual({ level: 1, label: "LIST OF TABLES", page: "vi" });
  });

  it("opens chapters on the chapter word and keeps the number", () => {
    expect(entries).toContainEqual({ level: 1, number: "1", label: "INTRODUCTION", page: "1" });
    expect(entries).toContainEqual({ level: 1, number: "5", label: "DISCUSSION AND RECOMMENDATIONS", page: "30" });
  });

  it("reads sections as level 2 and drops a third level", () => {
    expect(entries).toContainEqual({ level: 2, number: "1.2", label: "Statement of the Problem", page: "3" });
    expect(entries.some((e) => e.number === "1.3.1")).toBe(false);
  });

  it("keeps a number INSIDE a title when it would run the pages backwards", () => {
    expect(entries).toContainEqual({ level: 2, number: "2.2", label: "Early numeracy in Grade 1 pupils", page: "9" });
  });

  it("reads unnumbered back matter", () => {
    expect(entries.slice(-2)).toEqual([
      { level: 1, label: "REFERENCES", page: "40" },
      { level: 1, label: "APPENDICES", page: "45" },
    ]);
  });

  it("never turns the page's own folio or the column header into an entry", () => {
    expect(entries.some((e) => e.label === "v" || e.label === "vi" || /^Page\b/.test(e.label))).toBe(false);
  });

  it("strips dot leaders", () => {
    expect(
      parseContentsText("CONTENTS Introduction .......... 1 Methodology ............ 12 Findings …… 20"),
    ).toEqual([
      { level: 1, label: "Introduction", page: "1" },
      { level: 1, label: "Methodology", page: "12" },
      { level: 1, label: "Findings", page: "20" },
    ]);
  });

  it("reads chapters numbered without a chapter word, and spelled-out chapter numbers", () => {
    expect(parseContentsText("Contents 1 Introduction 1 2 Literature Review 5 3 Method 12")).toEqual([
      { level: 1, number: "1", label: "Introduction", page: "1" },
      { level: 1, number: "2", label: "Literature Review", page: "5" },
      { level: 1, number: "3", label: "Method", page: "12" },
    ]);
    expect(parseContentsText("CONTENTS CHAPTER ONE: INTRODUCTION 1 CHAPTER TWO: METHOD 8")).toEqual([
      { level: 1, number: "ONE", label: "INTRODUCTION", page: "1" },
      { level: 1, number: "TWO", label: "METHOD", page: "8" },
    ]);
  });

  it("keeps a chapter heading that the contents prints without a page", () => {
    expect(parseContentsText("CONTENTS CHAPTER 1 INTRODUCTION 1.1 Background 1 1.2 Aims 2")).toEqual([
      { level: 1, number: "1", label: "INTRODUCTION" },
      { level: 2, number: "1.1", label: "Background", page: "1" },
      { level: 2, number: "1.2", label: "Aims", page: "2" },
    ]);
  });
});

describe("parseContentsText — Khmer", () => {
  const KM =
    "មាតិកា ទំព័រ សេចក្ដីថ្លែងអំណរគុណ ក សេចក្ដីសង្ខេប ខ ជំពូកទី១ សេចក្ដីផ្ដើម ១ ១.១ ផ្ទៃរឿង ១ " +
    "១.២ បញ្ហាស្រាវជ្រាវ ៣ ជំពូកទី២ ការសិក្សាឯកសារ ៩ ជំពូក ៣ វិធីសាស្ត្រស្រាវជ្រាវ ១៤ ឯកសារយោង ៧៤";

  it("reads Khmer chapters, Khmer digits and the Khmer-letter front-matter pages", () => {
    expect(parseContentsText(KM)).toEqual([
      { level: 1, label: "សេចក្ដីថ្លែងអំណរគុណ", page: "ក" },
      { level: 1, label: "សេចក្ដីសង្ខេប", page: "ខ" },
      { level: 1, number: "១", label: "សេចក្ដីផ្ដើម", page: "១" },
      { level: 2, number: "១.១", label: "ផ្ទៃរឿង", page: "១" },
      { level: 2, number: "១.២", label: "បញ្ហាស្រាវជ្រាវ", page: "៣" },
      { level: 1, number: "២", label: "ការសិក្សាឯកសារ", page: "៩" },
      { level: 1, number: "៣", label: "វិធីសាស្ត្រស្រាវជ្រាវ", page: "១៤" },
      { level: 1, label: "ឯកសារយោង", page: "៧៤" },
    ]);
  });

  it("orders Khmer digits numerically, not by code point order of the string", () => {
    const e = parseContentsText("មាតិកា ជំពូកទី១ ក ៩ ជំពូកទី២ ខ ១០");
    expect(e.map((x) => x.page)).toEqual(["៩", "១០"]);
  });
});

describe("draftContents — finding the contents pages", () => {
  const pages: IndexedPage[] = [
    { pageNo: 1, content: "PHNOM PENH TEACHER EDUCATION COLLEGE Using Play-Based Learning Sok Dara 2024" },
    { pageNo: 3, content: PROSE },
    { pageNo: 5, content: EN_CONTENTS_P1 },
    { pageNo: 6, content: EN_CONTENTS_P2 },
    { pageNo: 7, content: LIST_OF_TABLES },
    { pageNo: 12, content: PROSE },
  ];

  it("drafts from the contents page and its continuation, and stops at the next list", () => {
    const d = draftContents(pages);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.sourcePages).toEqual([5, 6]);
    expect(d.entries.some((e) => /^Table \d/.test(e.label))).toBe(false);
    expect(d.entries.at(-1)).toEqual({ level: 1, label: "APPENDICES", page: "45" });
  });

  it("does not glue across a gap (an unindexed, scanned page)", () => {
    const d = draftContents(pages.filter((p) => p.pageNo !== 6).map((p) => (p.pageNo === 7 ? { ...p, pageNo: 8 } : p)));
    expect(d.ok && d.sourcePages).toEqual([5]);
  });

  it("does not take a chapter that talks ABOUT contents for the contents page", () => {
    expect(draftContents([{ pageNo: 9, content: PROSE }])).toEqual({ ok: false, reason: "no_contents_page" });
  });

  it("says when there is nothing indexed, or nothing it could read", () => {
    expect(draftContents([])).toEqual({ ok: false, reason: "no_pages" });
    expect(draftContents([{ pageNo: 4, content: "CONTENTS Introduction" }])).toEqual({ ok: false, reason: "unparseable" });
  });

  it("ignores pages past the front matter", () => {
    expect(draftContents([{ pageNo: 60, content: EN_CONTENTS_P1 }])).toEqual({ ok: false, reason: "no_contents_page" });
  });
});

describe("sanitizeContents — what the save path stores", () => {
  it("re-shapes every entry and drops what cannot be rendered", () => {
    expect(
      sanitizeContents([
        { level: 2, number: " 1.1 ", label: "  Background  ", page: 1, extra: "x" },
        { level: 7, label: "Introduction" },
        { level: "2", label: "Aims", page: "" },
        { label: "   " },
        "not an entry",
        null,
      ]),
    ).toEqual([
      { level: 2, number: "1.1", label: "Background", page: "1" },
      { level: 1, label: "Introduction" },
      { level: 2, label: "Aims" },
    ]);
  });

  it("stores nothing rather than an empty list", () => {
    expect(sanitizeContents([])).toBeNull();
    expect(sanitizeContents([{ label: "" }])).toBeNull();
    expect(sanitizeContents("[]")).toBeNull();
    expect(sanitizeContents(null)).toBeNull();
  });

  it("bounds entry count and string lengths", () => {
    const many = Array.from({ length: CONTENTS_LIMITS.entries + 20 }, (_, i) => ({ label: `Entry ${i}` }));
    expect(sanitizeContents(many)).toHaveLength(CONTENTS_LIMITS.entries);
    const [long] = sanitizeContents([{ label: "x".repeat(1000), number: "9".repeat(50), page: "1".repeat(50) }])!;
    expect(long.label).toHaveLength(CONTENTS_LIMITS.label);
    expect(long.number).toHaveLength(CONTENTS_LIMITS.number);
    expect(long.page).toHaveLength(CONTENTS_LIMITS.page);
  });

  it("matches the migration's entry cap", async () => {
    const fs = await import("node:fs");
    const sql = fs.readFileSync("supabase/migrations/0160_thesis_bilingual_contents.sql", "utf8");
    expect(sql).toContain(`jsonb_array_length(table_of_contents) <= ${CONTENTS_LIMITS.entries}`);
  });
});
