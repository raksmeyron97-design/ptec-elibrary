import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkCoworkDraft,
  numbersIn,
  unsupportedNumbers,
  type CoworkBook,
  type CoworkDraft,
} from "@/lib/seo/cowork-description";

const book = (over: Partial<CoworkBook> = {}): CoworkBook => ({
  book_id: "b1",
  slug: "khmer-literature-grade-9",
  title: "អក្សរសាស្ត្រខ្មែរ ថ្នាក់ទី៩",
  language: "km",
  locale: "km",
  author: "ក្រសួងអប់រំ យុវជន និងកីឡា",
  publisher: "ក្រសួងអប់រំ យុវជន និងកីឡា",
  year: 2018,
  pages: 210,
  subject: { name: "ភាសាខ្មែរ", name_en: "Khmer Language" },
  tags: [],
  views: 40,
  current_description: "សៀវភៅសិក្សាគោល។",
  readable: true,
  downloadable: true,
  contents_headings: ["កំណាព្យ", "រឿងព្រេង", "និទានកថា"],
  pages_text: [{ page: 3, kind: "contents", text: "មាតិកា ជំពូកទី១ កំណាព្យ ១ ជំពូកទី២ រឿងព្រេង ៣៥" }],
  ...over,
});

// A Khmer paragraph long enough for the band, using only numbers the book has.
const KM =
  "សៀវភៅអក្សរសាស្ត្រខ្មែរ ថ្នាក់ទី៩ នេះ ត្រូវបានរៀបចំឡើងដោយក្រសួងអប់រំ យុវជន និងកីឡា ក្នុងឆ្នាំ២០១៨ សម្រាប់សិស្សានុសិស្សមធ្យមសិក្សាបឋមភូមិ។ " +
  "ខ្លឹមសារនៃសៀវភៅចែកចេញជាជំពូកសំខាន់ៗ ដូចជា កំណាព្យ រឿងព្រេង និងនិទានកថា ដែលជួយឱ្យសិស្សស្គាល់ពីសម្បត្តិវប្បធម៌ និងអក្សរសិល្ប៍ជាតិ។ " +
  "មេរៀននីមួយៗផ្តល់នូវអត្ថបទគំរូ ការពន្យល់អំពីទម្រង់ និងអត្ថន័យ ព្រមទាំងលំហាត់អនុវត្តដែលជំរុញការគិតពិចារណា និងការសរសេរតែងសេចក្តី។ " +
  "សៀវភៅនេះមាន ២១០ ទំព័រ ហើយសមស្របសម្រាប់គ្រូបង្រៀន សិស្ស និងអ្នកស្រាវជ្រាវដែលចង់ស្វែងយល់ពីអក្សរសាស្ត្រខ្មែរ។ " +
  "អ្នកអានអាចអានអត្ថបទពេញតាមអនឡាញដោយឥតគិតថ្លៃ និងអាចទាញយកបាន។";

const EN =
  "Practical Research Methods is an English-language guide for students and teachers who are planning their first research project. " +
  "It explains how to frame a research question, choose between qualitative and quantitative designs, select a sample and collect data " +
  "through surveys, interviews and observation. Later chapters show how to analyse results, judge validity and reliability, and write " +
  "a clear report that others can evaluate. Each chapter combines short explanations with worked examples drawn from education settings, " +
  "so the book suits trainee teachers at a teacher education college as well as anyone carrying out action research in their own " +
  "classroom. The full text can be read online free of charge.";

const run = (draft: Partial<CoworkDraft>, b: CoworkBook = book()) =>
  checkCoworkDraft({ book_id: b.book_id, slug: b.slug, ...draft }, new Map([[b.book_id, b]]));
const problems = (v: ReturnType<typeof run>) => v.problems.map((p) => p.problem);

describe("numbers a draft states", () => {
  it("are read in both scripts", () => {
    expect(numbersIn("ឆ្នាំ២០១៨ និង 210 ទំព័រ")).toEqual(["2018", "210"]);
  });
  it("must appear in the material the draft was written from", () => {
    expect(unsupportedNumbers(KM, book())).toEqual([]);
    expect(unsupportedNumbers("បោះពុម្ពឆ្នាំ២០២០", book())).toEqual(["2020"]);
  });
});

describe("checkCoworkDraft", () => {
  it("passes a grounded Khmer draft for a Khmer book", () => {
    const v = run({ draft_km: KM });
    expect(problems(v)).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it("refuses Arabic digits in Khmer prose", () => {
    expect(problems(run({ draft_km: KM.replace("២១០", "210") }))).toContain("km_has_arabic_digits");
  });

  it("refuses an invented number — the failure a reviewer is least likely to notice", () => {
    const v = run({ draft_km: KM.replace("២០១៨", "២០២១") });
    expect(v.problems).toContainEqual({ problem: "unsupported_number", detail: "2021" });
  });

  it("requires English as well when the book is English (the draft approval publishes)", () => {
    const en = book({ title: "Practical Research Methods", language: "en", locale: "en", year: null, pages: null, contents_headings: [], pages_text: [] });
    expect(problems(run({ draft_km: KM.replace(/[០-៩]+/gu, "") }, en))).toContain("missing_en");
    expect(problems(run({ draft_km: KM.replace(/[០-៩]+/gu, ""), draft_en: EN }, en))).toEqual([]);
  });

  it("holds English to 80–150 words", () => {
    const en = book({ title: "Practical Research Methods", language: "en", locale: "en", year: null, pages: null });
    expect(problems(run({ draft_km: KM.replace(/[០-៩]+/gu, ""), draft_en: "A short book about research." }, en))).toContain("en_length");
  });

  it("refuses a review marker, markup and a link", () => {
    expect(problems(run({ draft_km: `TODO ${KM}` }))).toContain("review_marker");
    expect(problems(run({ draft_km: `**${KM}**` }))).toContain("markup");
    expect(problems(run({ draft_km: `${KM} https://example.com` }))).toContain("markup");
  });

  it("refuses Khmer that breaks orthography (a vowel with no consonant)", () => {
    expect(problems(run({ draft_km: `${KM} ា` }))).toContain("km_orthography");
  });

  it("refuses a draft for a book outside the bundle, or under the wrong slug", () => {
    expect(problems(checkCoworkDraft({ book_id: "zz", slug: "x", draft_km: KM }, new Map()))).toEqual(["unknown_book"]);
    expect(problems(run({ slug: "other", draft_km: KM }))).toContain("slug_mismatch");
  });

  it("refuses a draft that repeats the current description", () => {
    const b = book({ current_description: KM });
    expect(problems(run({ draft_km: KM }, b))).toContain("same_as_current");
  });
});

describe("the batch stays a draft", () => {
  const ROOT = path.resolve(__dirname, "../..");
  const script = readFileSync(path.join(ROOT, "scripts/seo-cowork-descriptions.ts"), "utf8");
  const migration = readFileSync(path.join(ROOT, "supabase/migrations/0165_description_draft_source_claude.sql"), "utf8");

  it("writes only the drafts table and the status none → draft, never the description", () => {
    const writes = script.match(/write\(\s*"(POST|PATCH)",\s*`?"?([^"`?]+)/g) ?? [];
    expect(writes.length).toBe(2);
    expect(script).toMatch(/write\(\s*"POST",\s*"book_description_drafts\?on_conflict=book_id/);
    expect(script).toMatch(/resolution=ignore-duplicates/);
    expect(script).toMatch(/description_status=eq\.none&select=id`, \{ description_status: "draft" \}/);
    expect(script).not.toMatch(/write\([^;]*\bdescription:/);
  });

  it("checks every draft before it writes, and refuses a bundle from another database", () => {
    expect(script.indexOf("checkCoworkDraft(")).toBeLessThan(script.indexOf('write(\n      "POST"'));
    expect(script).toMatch(/bundle\.target !== host/);
  });

  it("0165 only widens the source check", () => {
    expect(migration).toMatch(/'librarian', 'ai_assisted', 'extracted', 'claude_cowork'/);
    expect(migration).not.toMatch(/\b(update|delete|insert)\b/i);
  });
});
