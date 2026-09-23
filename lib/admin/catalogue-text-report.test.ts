import { describe, expect, it } from "vitest";

import {
  buildCatalogueTextReport,
  descriptionShape,
  titleLength,
  TITLE_TRUNCATION_LENGTH,
  type CatalogueTextRow,
} from "@/lib/admin/catalogue-text-report";

const row = (over: Partial<CatalogueTextRow> = {}): CatalogueTextRow => ({
  id: "b1",
  title: "Introduction to Psychology",
  description: null,
  subject: null,
  editUrl: "/admin/edit/b1",
  ...over,
});

// The production template, abbreviated. It opens by quoting the book's title.
const KM_TEMPLATE = (title: string) =>
  `សៀវភៅ «${title}» គឺជាឯកសារជំនួយស្មារតី និងការសិក្សាស្រាវជ្រាវដ៏មានសារៈសំខាន់សម្រាប់សិស្ស និស្សិត`;

describe("a description's SHAPE is what is left once the record is taken out", () => {
  it("sees one template behind two books that quote their own titles", () => {
    const a = row({ id: "a", title: "Algebra", description: KM_TEMPLATE("Algebra") });
    const b = row({ id: "b", title: "Chemistry", description: KM_TEMPLATE("Chemistry") });
    expect(descriptionShape(a)).toBe(descriptionShape(b));
    expect(descriptionShape(a).length).toBeGreaterThan(0);
  });

  it("masks the subject name, so interpolating it does not make a shape bespoke", () => {
    const a = row({ id: "a", title: "Algebra", subject: "គណិតវិទ្យា", description: "A book about គណិតវិទ្យា held by the library for students" });
    const b = row({ id: "b", title: "Optics", subject: "រូបវិទ្យា", description: "A book about រូបវិទ្យា held by the library for students" });
    expect(descriptionShape(a)).toBe(descriptionShape(b));
  });

  it("masks digits in BOTH scripts", () => {
    // Grade-numbered textbooks are most of this collection; a template that
    // interpolates the grade is still one template.
    const a = row({ id: "a", title: "Algebra", description: "Teacher guide for grade 7 of the national curriculum" });
    const b = row({ id: "b", title: "Algebra", description: "Teacher guide for grade 12 of the national curriculum" });
    const km1 = row({ id: "c", title: "គីមីវិទ្យា", description: "សៀវភៅណែនាំគ្រូបង្រៀន ថ្នាក់ទី៧ នៃកម្មវិធីសិក្សា" });
    const km2 = row({ id: "d", title: "គីមីវិទ្យា", description: "សៀវភៅណែនាំគ្រូបង្រៀន ថ្នាក់ទី១២ នៃកម្មវិធីសិក្សា" });
    expect(descriptionShape(a)).toBe(descriptionShape(b));
    expect(descriptionShape(km1)).toBe(descriptionShape(km2));
  });

  it("keeps two genuinely different descriptions apart", () => {
    const a = row({ id: "a", description: "A field study of teacher retention in rural Cambodian schools" });
    const b = row({ id: "b", description: "An introduction to organic reaction mechanisms for undergraduates" });
    expect(descriptionShape(a)).not.toBe(descriptionShape(b));
  });

  it("gives no shape to an absent or near-empty description", () => {
    // Otherwise every blank record joins one enormous template and the metric
    // reports the library's missing prose as its most popular sentence.
    expect(descriptionShape(row({ description: null }))).toBe("");
    expect(descriptionShape(row({ description: "   " }))).toBe("");
    expect(descriptionShape(row({ title: "Algebra", description: "Algebra" }))).toBe("");
    expect(descriptionShape(row({ description: "Short one" }))).toBe("");
  });
});

describe("the template metric", () => {
  it("counts templated against DESCRIBED, never against everything", () => {
    // A record with no description has no template. Folding the two questions
    // together lets a library with no prose at all score 0% and read healthy.
    const rows = [
      row({ id: "a", title: "Algebra", description: KM_TEMPLATE("Algebra") }),
      row({ id: "b", title: "Chemistry", description: KM_TEMPLATE("Chemistry") }),
      row({ id: "c", title: "Biology", description: null }),
      row({ id: "d", title: "Physics", description: null }),
    ];
    const report = buildCatalogueTextReport(rows);
    expect(report.counts.examined).toBe(4);
    expect(report.counts.described).toBe(2);
    expect(report.counts.templated).toBe(2);
    expect(report.counts.templatedShare).toBe(1);
  });

  it("is 0 when nothing is described, rather than NaN", () => {
    const report = buildCatalogueTextReport([row({ description: null })]);
    expect(report.counts.templatedShare).toBe(0);
  });

  it("does not call a one-off description a template", () => {
    const rows = [
      row({ id: "a", description: "A field study of teacher retention in rural schools" }),
      row({ id: "b", description: "An introduction to organic reaction mechanisms here" }),
    ];
    expect(buildCatalogueTextReport(rows).templates).toEqual([]);
  });

  it("ranks the largest template first and carries a real sample", () => {
    const rows = [
      ...["Algebra", "Chemistry", "Biology"].map((title) =>
        row({ id: title, title, description: KM_TEMPLATE(title) }),
      ),
      ...["Physics", "Geology"].map((title) =>
        row({ id: title, title, description: `A short guide to ${title} for first-year students` }),
      ),
    ];
    const report = buildCatalogueTextReport(rows);
    expect(report.templates.map((t) => t.count)).toEqual([3, 2]);
    expect(report.templates[0].sample).toContain("សៀវភៅ");
    expect(report.templates[0].examples).toHaveLength(3);
  });

  it("carries examples for a drill-down but never the whole group", () => {
    const rows = Array.from({ length: 40 }, (_, i) =>
      row({
        id: `b${i}`,
        title: `Teacher's Guide, Volume ${i}`,
        description: KM_TEMPLATE(`Teacher's Guide, Volume ${i}`),
      }),
    );
    const report = buildCatalogueTextReport(rows);
    expect(report.templates[0].count).toBe(40);
    expect(report.templates[0].examples.length).toBeLessThanOrEqual(5);
  });
});

describe("the retitle queue", () => {
  const cut = (n: number) => "ក".repeat(n);

  it("finds a title sitting exactly on the truncation length", () => {
    const rows = [
      row({ id: "a", title: cut(TITLE_TRUNCATION_LENGTH) }),
      row({ id: "b", title: cut(TITLE_TRUNCATION_LENGTH - 1) }),
      row({ id: "c", title: cut(TITLE_TRUNCATION_LENGTH + 1) }),
    ];
    const report = buildCatalogueTextReport(rows);
    expect(report.truncatedTitles.map((t) => t.id)).toEqual(["a"]);
  });

  it("measures the title in CODE POINTS, not UTF-16 units", () => {
    // A title carrying an astral character counts double under `.length` and
    // would slip past a check that the cut left it exactly at the cap.
    const astral = "𝐀".repeat(TITLE_TRUNCATION_LENGTH);
    expect(astral.length).toBe(TITLE_TRUNCATION_LENGTH * 2);
    expect(titleLength(astral)).toBe(TITLE_TRUNCATION_LENGTH);
    expect(buildCatalogueTextReport([row({ title: astral })]).truncatedTitles).toHaveLength(1);
  });

  it("says how many other records the cut title collides with", () => {
    // This is what turns 57 real textbooks into 18 phantom duplicate groups.
    const shared = cut(TITLE_TRUNCATION_LENGTH);
    const rows = [
      row({ id: "a", title: shared }),
      row({ id: "b", title: shared }),
      row({ id: "c", title: shared }),
      row({ id: "d", title: cut(TITLE_TRUNCATION_LENGTH).replace(/ក$/, "ខ") }),
    ];
    const report = buildCatalogueTextReport(rows);
    expect(report.counts.truncatedTitles).toBe(4);
    expect(report.counts.truncatedAndColliding).toBe(3);
    expect(report.truncatedTitles[0].sharedWith).toBe(2);
    // Most-collided first, so the phantom groups are the top of the queue.
    expect(report.truncatedTitles.at(-1)?.sharedWith).toBe(0);
  });

  it("reports a cut title that collides with nothing", () => {
    // The title is cut either way. Only the duplicate it fakes is optional.
    const report = buildCatalogueTextReport([row({ title: cut(TITLE_TRUNCATION_LENGTH) })]);
    expect(report.truncatedTitles).toHaveLength(1);
    expect(report.truncatedTitles[0].sharedWith).toBe(0);
  });

  it("opens no write path", async () => {
    // The missing grade number is on the title page and nowhere in this
    // database; retitling is a librarian's decision, and retiring one of these
    // records would 301 a real textbook onto a different book.
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("lib/admin/catalogue-text-report.ts", "utf8");
    expect(src).not.toMatch(/supabase|createServiceClient|\.update\(|\.delete\(|\.insert\(/);
  });
});
