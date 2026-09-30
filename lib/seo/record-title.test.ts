import { describe, expect, it } from "vitest";
import { bookGrade, composeRecordTitle, gradeLabel } from "./record-title";

const EN = { locale: "en", brandSuffix: " · PTEC Library" };
const KM = { locale: "km", brandSuffix: " · បណ្ណាល័យ វ.គ.ភ" };

describe("bookGrade", () => {
  it("reads one grade from a tag or the title, in either script", () => {
    expect(bookGrade({ title: "Science", tags: ["ថ្នាក់ទី៨"] })).toBe(8);
    expect(bookGrade({ title: "សៀវភៅណែនាំគ្រូបង្រៀន គណិតវិទ្យា ថ្នាក់ទី៨ (STEPSAM3)" })).toBe(8);
    expect(bookGrade({ title: "Mathematics Grade 10 Workbook" })).toBe(10);
    expect(bookGrade({ title: "ថ្នាក់ទី១០ ភូមិវិទ្យា" })).toBe(10);
  });
  it("is null for a range or a list — several grades are not one", () => {
    expect(bookGrade({ title: "កញ្ចប់សិក្សាថ្នាក់ដំបូង៖ អំណាន និងគណិតវិទ្យា (ថ្នាក់ទី១ ដល់ទី៣)" })).toBeNull();
    expect(bookGrade({ title: "កញ្ចប់គណិតវិទ្យាថ្នាក់ដំបូង (ថ្នាក់ទី១ ទី២ និងទី៣)" })).toBeNull();
    expect(bookGrade({ title: "Early Grade Mathematics (Grades 1–3)" })).toBeNull();
  });
  it("ignores a volume or an edition, and numbers outside 1–12", () => {
    expect(bookGrade({ title: "គណិតវិទ្យា ភាគទី២" })).toBeNull();
    expect(bookGrade({ title: "Research Methods, 8th Edition" })).toBeNull();
    expect(bookGrade({ title: "Grade 99 nonsense" })).toBeNull();
  });
  it("prefers the tags to the title", () => {
    expect(bookGrade({ title: "Grade 3 reader", tags: ["Grade 4"] })).toBe(4);
  });
});

describe("gradeLabel", () => {
  it("writes the grade in the page's language and digits", () => {
    expect(gradeLabel(8, "en")).toBe("Grade 8");
    expect(gradeLabel(12, "km")).toBe("ថ្នាក់ទី១២");
  });
});

describe("composeRecordTitle", () => {
  it("builds {title} — {subject}, Grade N (PDF) and keeps the brand when it fits", () => {
    expect(composeRecordTitle({ title: "Algebra", subject: "Mathematics", grade: 8, format: "(PDF)" }, EN)).toBe(
      "Algebra — Mathematics, Grade 8 (PDF)",
    );
  });
  it("includes only the parts the record has", () => {
    expect(composeRecordTitle({ title: "Algebra" }, EN)).toBe("Algebra");
    expect(composeRecordTitle({ title: "Algebra", grade: 8 }, EN)).toBe("Algebra — Grade 8");
  });
  it("never repeats a subject or grade the title already states", () => {
    expect(composeRecordTitle({ title: "Mathematics Grade 8", subject: "Mathematics", grade: 8 }, EN)).toBe(
      "Mathematics Grade 8",
    );
    expect(composeRecordTitle({ title: "គណិតវិទ្យា ថ្នាក់ទី៨", subject: "គណិតវិទ្យា", grade: 8 }, KM)).toBe(
      "គណិតវិទ្យា ថ្នាក់ទី៨",
    );
  });
  it("drops brand, then format, then grade, then subject — and never cuts the title", () => {
    const title = "Teaching Mathematics in Primary Schools"; // 39
    const parts = { title, subject: "Mathematics Education", grade: 4, format: "(PDF)" };
    const a = composeRecordTitle(parts, EN);
    expect(a).toEqual({ absolute: `${title} — Mathematics Education` });
    const long = "A".repeat(80);
    expect(composeRecordTitle({ title: long, subject: "Maths", grade: 4, format: "(PDF)" }, EN)).toEqual({
      absolute: long,
    });
  });
  it("keeps the brand out before it drops a part", () => {
    // 50 + " — Maths" = 58 fits 65 alone, but not with the 15-character brand.
    const title = "B".repeat(50);
    expect(composeRecordTitle({ title, subject: "Maths" }, EN)).toEqual({ absolute: `${title} — Maths` });
  });
  it("uses the Khmer budget on /km pages", () => {
    const title = "ក".repeat(45);
    expect(composeRecordTitle({ title, subject: "គណិតវិទ្យា" }, KM)).toEqual({ absolute: title });
  });
});
