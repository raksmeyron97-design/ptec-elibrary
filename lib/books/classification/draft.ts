// Draft a book's resource type, grade and part from its title (SEO audit
// 2026-10, WI-6). Pure. A DRAFT: only a librarian's confirmation writes the
// public columns (migration 0175).
//
// The rules read what MoEYS titles state in words. Khmer digits are folded to
// Latin first, and a grade needs its word (`ថ្នាក់ទី`, or "Grade"): a year
// (២០២៥), an ISBN or an edition number is never a grade. No match → no draft.

export const RESOURCE_TYPES = [
  "student_textbook",
  "teacher_guide",
  "answer_key",
  "supplementary",
  "homework_exercise",
  "exam_paper",
  "lesson_plan",
  "curriculum",
  "lab_manual",
  "children_reader",
  "reference",
  "research_report",
  "other",
] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export function isResourceType(value: unknown): value is ResourceType {
  return typeof value === "string" && (RESOURCE_TYPES as readonly string[]).includes(value);
}

export type ClassificationDraft = {
  resourceType: ResourceType | null;
  gradeFrom: number | null;
  gradeTo: number | null;
  partNo: number | null;
  /** Which rules fired, e.g. "type:teacher_guide grade part". */
  rule: string;
};

/** Precedence matters: a teacher's guide to an exam is a teacher's guide. */
const TYPE_RULES: readonly [ResourceType, RegExp][] = [
  ["teacher_guide", /ណែនាំគ្រូ|សៀវភៅគ្រូ|សម្រាប់គ្រូ/],
  ["answer_key", /កំណែ/],
  ["curriculum", /កម្មវិធីសិក្សា/],
  ["lesson_plan", /កិច្ចតែងការ/],
  ["exam_paper", /វិញ្ញាសា|ប្រឡង|ប្រលង/],
  ["homework_exercise", /កិច្ចការផ្ទះ|លំហាត់/],
  ["supplementary", /សៀវភៅជំនួយ/],
  ["lab_manual", /ពិសោធ/],
];

/** The children's-reader hub, by its category name. */
const CHILDREN_READER_HUB = "អំណានកុមារ";

export function foldKhmerDigits(text: string): string {
  return text.replace(/[០-៩]/g, (d) => String(d.charCodeAt(0) - 0x17e0));
}

const GRADE_RANGE = /(?:ថ្នាក់ទី|grade\s*)(\d{1,2})\s*(?:[-–]|ដល់(?:\s*ថ្នាក់)?\s*ទី)\s*(\d{1,2})(?!\d)/i;
const GRADE_ONE = /(?:ថ្នាក់ទី|grade\s*)(\d{1,2})(?!\d)/i;
const PART = /(?:ភាគ(?:ទី)?\s*|volume\s+|vol\.\s*)(\d{1,2})(?!\d)/i;

function grade(n: number): number | null {
  return Number.isInteger(n) && n >= 0 && n <= 12 ? n : null;
}

export function draftClassification(title: string | null | undefined, category?: string | null): ClassificationDraft | null {
  const text = foldKhmerDigits((title ?? "").normalize("NFC"));
  if (!text.trim()) return null;
  const fired: string[] = [];

  let resourceType: ResourceType | null = null;
  for (const [type, re] of TYPE_RULES) {
    if (re.test(text)) {
      resourceType = type;
      break;
    }
  }
  if (!resourceType && category?.normalize("NFC").trim() === CHILDREN_READER_HUB) resourceType = "children_reader";

  let gradeFrom: number | null = null;
  let gradeTo: number | null = null;
  const range = GRADE_RANGE.exec(text);
  if (range) {
    const a = grade(Number(range[1]));
    const b = grade(Number(range[2]));
    if (a !== null && b !== null && b >= a) {
      gradeFrom = a;
      gradeTo = b;
    }
  }
  if (gradeFrom === null) {
    const one = GRADE_ONE.exec(text);
    const g = one ? grade(Number(one[1])) : null;
    if (g !== null) {
      gradeFrom = g;
      gradeTo = g;
    }
  }

  // "{subject} ថ្នាក់ទីN" with no other type word is the student textbook.
  if (!resourceType && gradeFrom !== null) resourceType = "student_textbook";

  const part = PART.exec(text);
  const partNo = part && Number(part[1]) > 0 ? Number(part[1]) : null;

  if (resourceType) fired.push(`type:${resourceType}`);
  if (gradeFrom !== null) fired.push("grade");
  if (partNo !== null) fired.push("part");
  if (fired.length === 0) return null;
  return { resourceType, gradeFrom, gradeTo, partNo, rule: fired.join(" ") };
}

/** Two drafts are the same set for bulk confirmation when every value agrees. */
export function draftKey(d: Pick<ClassificationDraft, "resourceType" | "gradeFrom" | "gradeTo" | "partNo">): string {
  return [d.resourceType ?? "-", d.gradeFrom ?? "-", d.gradeTo ?? "-", d.partNo ?? "-"].join("|");
}
