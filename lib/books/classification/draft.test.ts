import { describe, expect, it } from "vitest";
import { draftClassification, draftKey } from "@/lib/books/classification/draft";

describe("draftClassification — pinned on real titles", () => {
  it("a teacher's guide, grade 2, part 2", () => {
    expect(draftClassification("សៀវភៅណែនាំសម្រាប់គ្រូបង្រៀនថ្នាក់ទី២ ភាគ២")).toMatchObject({
      resourceType: "teacher_guide",
      gradeFrom: 2,
      gradeTo: 2,
      partNo: 2,
    });
  });

  it("an answer key, grade 6", () => {
    expect(draftClassification("កំណែភាសាខ្មែរ ថ្នាក់ទី៦")).toMatchObject({ resourceType: "answer_key", gradeFrom: 6, gradeTo: 6 });
  });

  it("a curriculum, grades 1–6", () => {
    expect(draftClassification("កម្មវិធីសិក្សាលម្អិត-បំណិនជីវិត-ថ្នាក់ទី១-៦")).toMatchObject({
      resourceType: "curriculum",
      gradeFrom: 1,
      gradeTo: 6,
    });
  });

  it("a student textbook is a subject and a grade with no other type word", () => {
    expect(draftClassification("គណិតវិទ្យា ថ្នាក់ទី៤")).toMatchObject({ resourceType: "student_textbook", gradeFrom: 4 });
    expect(draftClassification("ថ្នាក់ទី៩៖ សិក្សាសង្គម")).toMatchObject({ resourceType: "student_textbook", gradeFrom: 9 });
  });

  it("a lab manual with a part", () => {
    expect(draftClassification("សៀវភៅពិសោធគីមីវិទ្យា ភាគ២")).toMatchObject({ resourceType: "lab_manual", partNo: 2, gradeFrom: null });
  });

  it("exam, homework, lesson plan, supplementary", () => {
    expect(draftClassification("វិញ្ញាសាប្រឡងគណិតវិទ្យា")?.resourceType).toBe("exam_paper");
    expect(draftClassification("កិច្ចការផ្ទះ ភាសាខ្មែរ ថ្នាក់ទី៣")?.resourceType).toBe("homework_exercise");
    expect(draftClassification("កិច្ចតែងការបង្រៀន ថ្នាក់ទី១")?.resourceType).toBe("lesson_plan");
    expect(draftClassification("សៀវភៅជំនួយការអាន")?.resourceType).toBe("supplementary");
  });

  it("a children's reader comes from its hub, not its title", () => {
    expect(draftClassification("ឆ្មា និងកណ្ដុរ", "អំណានកុមារ")?.resourceType).toBe("children_reader");
    expect(draftClassification("ឆ្មា និងកណ្ដុរ")).toBeNull();
  });

  it("Volume N is a part", () => {
    expect(draftClassification("Teaching Mathematics Volume 2")).toMatchObject({ partNo: 2, resourceType: null });
  });
});

describe("negative controls — numbers that are not grades", () => {
  it("a year is not a grade", () => {
    expect(draftClassification("របាយការណ៍ប្រចាំឆ្នាំ ២០២៥")).toBeNull();
    expect(draftClassification("Annual Report 2025")).toBeNull();
  });

  it("ISBN digits are not a grade", () => {
    expect(draftClassification("Research Methods 978-9924-000-01-1")).toBeNull();
  });

  it("grade 13 does not exist; 12 does", () => {
    expect(draftClassification("គណិតវិទ្យា ថ្នាក់ទី១៣")).toBeNull();
    expect(draftClassification("គណិតវិទ្យា ថ្នាក់ទី១២")).toMatchObject({ gradeFrom: 12 });
  });

  it("a reversed range is not a range", () => {
    expect(draftClassification("កម្មវិធីសិក្សា ថ្នាក់ទី៦-១")).toMatchObject({ gradeFrom: 6, gradeTo: 6 });
  });

  it("no match is no draft", () => {
    expect(draftClassification("Research Methods in Education")).toBeNull();
    expect(draftClassification("")).toBeNull();
  });
});

describe("draftKey", () => {
  it("is equal exactly when every value agrees", () => {
    const a = draftClassification("គណិតវិទ្យា ថ្នាក់ទី៤")!;
    const b = draftClassification("ភាសាខ្មែរ ថ្នាក់ទី៤")!;
    const c = draftClassification("ភាសាខ្មែរ ថ្នាក់ទី៥")!;
    expect(draftKey(a)).toBe(draftKey(b));
    expect(draftKey(a)).not.toBe(draftKey(c));
  });
});
