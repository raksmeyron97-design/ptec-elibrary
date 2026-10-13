// lib/search/subject-class.ts
//
// ONE subject vocabulary for the digital and the physical library: the Dewey
// Decimal hundreds classes, with Education (370) as a class of its own
// (Phase 9.2, docs/UNIFIED-DISCOVERY.md).
//
// Why a crosswalk and not the category names: the two collections file by
// different systems. Every print record carries a DDC call number ("510 ហៃ",
// "372.7 ZVO") — 2,638 of 2,638 in production — while digital books carry one
// of 35 subject categories ("គណិតវិទ្យា", "គរុកោសល្យ"). A Subject filter over
// both needs one set of values, and the call numbers already speak DDC.
//
// Why 370 stands alone (PTEC, 2026-09-28): PTEC is a teacher-education college;
// pedagogy is the core of what its readers study, and the librarians already
// file 496 print records under "370 អប់រំ និងគរុកោសល្យ". Folding it into
// 300 Social sciences would bury the library's largest subject.
//
// Print records take their class from the CALL NUMBER, not their category
// label: 216 print records carry a label that is not a DDC class at all
// ("ប្រលោមលោក", "សៀវភៅសិក្សាគោល") and 92 carry none, but every one has a call
// number. Digital books take theirs from the category — only where the mapping
// is confirmed. A category awaiting review maps to nothing (the record is simply
// not under any Subject value) rather than to a guess.
//
// Pure: no server imports; shared by the search route and the sidebar.

export const SUBJECT_CLASSES = ["000", "100", "200", "300", "370", "400", "500", "600", "700", "800", "900"] as const;
export type SubjectClass = (typeof SUBJECT_CLASSES)[number];

export function isSubjectClass(value: string | null | undefined): value is SubjectClass {
  return (SUBJECT_CLASSES as readonly string[]).includes(value ?? "");
}

/** Khmer digits to ASCII: a call number may be written ៣៧២.៧. */
function foldDigits(value: string): string {
  return value.replace(/[០-៩]/g, (d) => String(d.charCodeAt(0) - 0x17e0));
}

/**
 * The class of a print record's call number: its leading three digits, with
 * 370–379 as Education. `null` when the call number does not start with a
 * DDC number — never a guess.
 */
export function subjectClassOfCallNumber(callNumber: string | null | undefined): SubjectClass | null {
  const match = foldDigits(callNumber ?? "").match(/^\s*(\d{3})(?!\d)/);
  if (!match) return null;
  const n = Number(match[1]);
  if (n >= 370 && n <= 379) return "370";
  return String(Math.floor(n / 100) * 100).padStart(3, "0") as SubjectClass;
}

/**
 * Digital categories whose class is CONFIRMED (PTEC, 2026-09-28: "proceed with
 * the clear mappings"). Keyed by the category name exactly as stored.
 */
export const CATEGORY_SUBJECT_CLASS: Readonly<Record<string, SubjectClass>> = {
  "ចំណេះដឹងទូទៅ": "000", // general knowledge
  "ទស្សនវិជ្ជា": "100", // philosophy
  "ច្បាប់": "300", // law
  "សិក្សាសង្គម": "300", // social studies
  "កម្មវិធី PISA": "370", // PISA programme
  "កម្មវិធីសិក្សា": "370", // curriculum
  "គរុកោសល្យ": "370", // pedagogy
  "អប់រំ": "370", // education
  "ភាសា": "400", // language
  "ភាសាខ្មែរ": "400", // Khmer language
  "ភាសាបារាំង": "400", // French
  "ភាសាអង់គ្លេសសិក្សា": "400", // English studies
  "កញ្ចប់គណិតវិទ្យា": "500", // mathematics package
  "គណិតវិទ្យា": "500", // mathematics
  "គីមីវិទ្យា": "500", // chemistry
  "ជីវវិទ្យា": "500", // biology
  "រូបវិទ្យា": "500", // physics
  "វិទ្យាសាស្ត្រ": "500", // science
  "បច្ចេកវិទ្យា": "600", // technology
  "អក្សរសិល្ប៍": "800", // literature
  "ប្រវត្តិសាស្ត្រ": "900", // history
};

/**
 * Categories whose class awaits the librarians' decision, with the candidate
 * classes. Documentation only: NOTHING reads this to classify a record. When a
 * decision is made, the entry moves to CATEGORY_SUBJECT_CLASS.
 */
export const CATEGORIES_AWAITING_REVIEW: Readonly<Record<string, readonly SubjectClass[]>> = {
  "ទស្សនវិជ្ជាអប់រំ": ["370", "100"], // philosophy of education
  "បច្ចេកវិទ្យាព័ត៌មាន": ["000", "600"], // information technology (DDC: computing is 004)
  "វប្បធម៌": ["300", "900"], // culture
  "សុខភាព": ["600", "300"], // health
  "ស្រាវជ្រាវប្រតិបត្តិ": ["370", "300"], // action research
  "បំណិនជីវិត": ["600", "370"], // life skills
  "វិញ្ញាសាប្រឡង": ["370"], // exam papers
  "វិធីសាស្ត្របង្រៀនរូបវិទ្យា": ["370", "500"], // physics teaching methods
  "ស្ថិតិ និងវិភាគទិន្នន័យ": ["500", "300"], // statistics and data analysis
  "ស្រាវជ្រាវ": ["000", "300", "370"], // research
  "ស្រាវជ្រាវបែបគុណភាព": ["300", "000", "370"], // qualitative research
  "អំណានកុមារ": ["800", "370"], // children's reading
  "អប់រំកាយ និងកីឡា": ["700", "370"], // physical education and sport
  "អប់រំសិល្បៈ": ["700", "370"], // arts education
};

/** The class of a digital category, or `null` when it is unmapped or awaiting review. */
export function subjectClassOfCategory(category: string | null | undefined): SubjectClass | null {
  const key = (category ?? "").normalize("NFC").trim();
  return key ? (CATEGORY_SUBJECT_CLASS[key] ?? null) : null;
}

/** Sidebar order: the DDC order, never by count — a reader scans classes in that order. */
export function compareSubjectClass(a: string, b: string): number {
  const ia = (SUBJECT_CLASSES as readonly string[]).indexOf(a);
  const ib = (SUBJECT_CLASSES as readonly string[]).indexOf(b);
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
}
