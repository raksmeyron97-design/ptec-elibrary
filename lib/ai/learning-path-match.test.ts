import { describe, expect, it } from "vitest";
import { queryTerms } from "./evidence";
import { matchLearningPaths, type MatchablePath } from "./learning-path-match";
import { normalizeSearchText } from "@/lib/search/normalize";

/**
 * The nine paths production actually publishes, as `searchLearningPaths`
 * prepares them (title in both languages joined; subject + audience + tags as
 * the topic; description as the body), read out of the live curriculum on
 * 2026-09-17.
 *
 * Real rows rather than invented ones, because the defect this file exists to
 * pin was invisible against a synthetic fixture: every one of these paths is
 * MoEYS early-grade READING or MATHEMATICS for Grades 1–3, so the collection
 * has no curriculum for research methods at all — and a scorer that counted
 * any word anywhere answered "where do I start with action research" with a
 * Grade 3 maths package.
 */
const norm = (...parts: (string | null)[]) => normalizeSearchText(parts.filter(Boolean).join(" "));

const PATHS: MatchablePath[] = [
  {
    slug: "early-grade-mathematics-grade-1-curriculum-manipulatives",
    position: 1,
    title: norm("Early Grade Mathematics: Grade 1 Curriculum & Manipulatives", "កញ្ចប់គណិតវិទ្យាថ្នាក់ដំបូង ថ្នាក់ទី១៖ វិធីសាស្ត្របង្រៀន និងកម្រងលំហាត់"),
    topic: norm("គណិតវិទ្យា", "គរុនិស្សិត, គ្រូបង្រៀនបឋមសិក្សាថ្នាក់ទី១, និងអ្នកអប់រំ / Grade 1 Teachers & Trainees", "គណិតវិទ្យា ថ្នាក់ទី១ កញ្ចប់សម្ភារៈ កូនស្វាឆ្លាត បឋមសិក្សា ក្រសួងអប់រំ"),
    body: norm("Comprehensive Grade 1 Mathematics professional curriculum based on the Ministry of Education, Youth and Sport (MoEYS) package. Designed for teacher trainees and educators."),
  },
  {
    slug: "early-grade-learning-package",
    position: 2,
    title: norm("Early Grade Learning: MoEYS Reading & Mathematics Curriculum (Grades 1–3)", "កញ្ចប់សិក្សាថ្នាក់ដំបូង៖ អំណាន និងគណិតវិទ្យា (ថ្នាក់ទី១ ដល់ទី៣)"),
    topic: norm("អំណាន និងគណិតវិទ្យា", "គរុនិស្សិត, គ្រូបង្រៀនបឋមសិក្សា (ថ្នាក់ទី១-៣), នាយកសាលា / Primary School Teachers, Trainees & Educators", "អំណាន គណិតវិទ្យា ភាសាខ្មែរ បឋមសិក្សា ក្រសួងអប់រំ"),
    body: norm("The national early grade learning curriculum by MoEYS (Komar Rien Komar Cheh) integrating Early Reading and Mathematics across Grades 1, 2, and 3 (28 textbooks)."),
  },
  {
    slug: "early-grade-math",
    position: 3,
    title: norm("Early Grade Mathematics: Complete Primary Curriculum (Grades 1–3)", "កញ្ចប់គណិតវិទ្យាថ្នាក់ដំបូង (ថ្នាក់ទី១ ទី២ និងទី៣)"),
    topic: norm("គណិតវិទ្យា", "គរុនិស្សិត / Primary Math Educators & Trainees", "គណិតវិទ្យា ថ្នាក់ដំបូង បឋមសិក្សា ក្រសួងអប់រំ"),
    body: norm("The complete MoEYS Early Grade Mathematics package spanning Grades 1 to 3 (18 textbooks and workbooks). Designed for primary educators and teacher trainees."),
  },
  {
    slug: "early-grade-math-grade-2",
    position: 4,
    title: norm("Early Grade Mathematics: Grade 2 Curriculum & Manipulatives", "កញ្ចប់គណិតវិទ្យាថ្នាក់ដំបូង ថ្នាក់ទី២"),
    topic: norm("គណិតវិទ្យា", "Grade 2 Teachers & Trainees", "គណិតវិទ្យា ថ្នាក់ទី២ បឋមសិក្សា"),
    body: norm("Comprehensive Grade 2 Mathematics professional curriculum developed under the MoEYS early grade learning package."),
  },
  {
    slug: "early-grade-math-grade-3",
    position: 5,
    title: norm("Early Grade Mathematics: Grade 3 Curriculum & Advanced Foundations", "កញ្ចប់គណិតវិទ្យាថ្នាក់ដំបូង ថ្នាក់ទី៣"),
    topic: norm("គណិតវិទ្យា", "Grade 3 Teachers & Trainees", "គណិតវិទ្យា ថ្នាក់ទី៣ បឋមសិក្សា"),
    body: norm("Comprehensive Grade 3 Mathematics professional curriculum developed under the MoEYS early grade learning package."),
  },
  {
    slug: "early-grade-reading",
    position: 6,
    title: norm("Early Grade Reading: Complete Khmer Literacy Curriculum (Grades 1–3)", "កញ្ចប់អំណានថ្នាក់ដំបូង ភាសាខ្មែរ (ថ្នាក់ទី១ ទី២ និងទី៣)"),
    topic: norm("ភាសាខ្មែរ", "Primary Teachers & Literacy Trainees", "ភាសាខ្មែរ អំណាន ថ្នាក់ដំបូង បឋមសិក្សា"),
    body: norm("The complete MoEYS Early Grade Reading package spanning Grades 1 to 3. Designed for primary educators, student teachers, and literacy coordinators."),
  },
  {
    slug: "early-grade-reading-grade-1",
    position: 7,
    title: norm("Early Grade Reading: Grade 1 Literacy & Phonics Curriculum", "កញ្ចប់អំណានថ្នាក់ដំបូង ថ្នាក់ទី១"),
    topic: norm("ភាសាខ្មែរ", "Grade 1 Teachers & Trainees", "ភាសាខ្មែរ ថ្នាក់ទី១ អំណាន បឋមសិក្សា"),
    body: norm("Grade 1 early reading curriculum covering foundational phonics, vowels, consonants, consonant clusters, and student practice books."),
  },
  {
    slug: "early-grade-reading-grade-2",
    position: 8,
    title: norm("Early Grade Reading: Grade 2 Reading Fluency & Writing Curriculum", "កញ្ចប់អំណានថ្នាក់ដំបូង ថ្នាក់ទី២"),
    topic: norm("ភាសាខ្មែរ", "Grade 2 Teachers & Trainees", "ភាសាខ្មែរ ថ្នាក់ទី២ អំណាន"),
    body: norm("Grade 2 literacy curriculum focusing on reading fluency, sentence composition, and structured daily lesson plans."),
  },
  {
    slug: "early-grade-reading-grade-3",
    position: 9,
    title: norm("Early Grade Reading: Grade 3 Comprehension, Grammar & Homework Curriculum", "កញ្ចប់អំណានថ្នាក់ដំបូង ថ្នាក់ទី៣"),
    topic: norm("ភាសាខ្មែរ", "Grade 3 Teachers & Trainees", "ភាសាខ្មែរ ថ្នាក់ទី៣ អំណាន"),
    body: norm("Grade 3 literacy curriculum emphasizing advanced reading comprehension, grammar foundations, creative essay writing."),
  },
];

const ask = (goal: string) => matchLearningPaths(PATHS, queryTerms(goal), normalizeSearchText(goal));

// The assertions are about the TRACK, not about which of several correct paths
// wins. Three of the nine cover reading, four cover mathematics, and
// `early-grade-learning-package` covers both — so for a reading goal it is as
// right an answer as the reading-specific one, and demanding a particular slug
// would pin a preference rather than a property. What must never happen is a
// reading goal led by a mathematics-only path, or the reverse.
const MATHS_ONLY = /^early-grade-math/;
const READING_ONLY = /^early-grade-reading/;

describe("matchLearningPaths — a curriculum only leads on what it teaches", () => {
  it("never answers a reading goal with a mathematics-only path", () => {
    for (const goal of [
      "read first to learn how to teach reading",
      "where do i start with khmer literacy",
      "study plan for grade 1 literacy",
    ]) {
      const slug = ask(goal).leading?.slug;
      expect(slug, goal).toBeDefined();
      expect(slug, goal).not.toMatch(MATHS_ONLY);
    }
  });

  it("never answers a mathematics goal with a reading-only path", () => {
    for (const goal of ["learning path for teaching mathematics", "where do i start with mathematics"]) {
      const slug = ask(goal).leading?.slug;
      expect(slug, goal).toBeDefined();
      expect(slug, goal).not.toMatch(READING_ONLY);
    }
  });

  it("matches a Khmer goal on the Khmer half of the curriculum's own fields", () => {
    // The titles, subjects and tags are bilingual, so a Khmer goal must reach
    // them without any translation step.
    expect(ask("អំណាន").leading?.slug, "អំណាន").not.toMatch(MATHS_ONLY);
    expect(ask("គណិតវិទ្យា").leading?.slug, "គណិតវិទ្យា").not.toMatch(READING_ONLY);
  });

  it("a ubiquitous word cannot carry a match on its own", () => {
    // "early" and "grade" are in all nine titles, so they separate nothing and
    // must not make any path the answer. ("primary" is deliberately NOT here:
    // it appears in three of the nine audiences, so it still discriminates —
    // the rule neutralises what the whole collection shares, not every word
    // that feels generic.)
    expect(ask("early grade").leading).toBeNull();
    expect(ask("early grade").ranked.length).toBeGreaterThan(0);
  });
});

describe("matchLearningPaths — and never on what it does not", () => {
  // The three that shipped as confident wrong answers before the strong/weak
  // split existed. Every one of them was scored a PASS by a benchmark that
  // checked only which intent the question reached.
  it.each([
    "where do i start with action research",
    "i want to learn qualitative research methods what comes next after the basics",
    "learning paths for underwater welding",
    "how do i learn statistics for my thesis",
  ])("refuses to lead for: %s", (goal) => {
    expect(ask(goal).leading).toBeNull();
  });

  it("a description mention ranks a path but never makes it the answer", () => {
    // "trainees" is in several descriptions and in no title or topic field.
    const out = ask("resources for trainees");
    expect(out.ranked.length).toBeGreaterThan(0);
    expect(out.ranked.every((m) => !m.strong)).toBe(true);
    expect(out.leading).toBeNull();
  });

  it("an empty goal leads with nothing", () => {
    expect(ask("").leading).toBeNull();
    expect(ask("").ranked).toEqual([]);
  });
});

describe("matchLearningPaths — ordering", () => {
  it("is stable: equal scores fall back to publication order", () => {
    const a = ask("early grade curriculum");
    const b = ask("early grade curriculum");
    expect(a.ranked.map((m) => m.path.slug)).toEqual(b.ranked.map((m) => m.path.slug));
  });

  it("ranks a title hit above a topic hit above a body hit", () => {
    const out = ask("mathematics");
    const scores = out.ranked.map((m) => m.score);
    expect(scores).toEqual([...scores].sort((x, y) => y - x));
    expect(out.ranked[0].strong).toBe(true);
  });
});

describe("matchLearningPaths — naming a subject", () => {
  it("a question about the ARTEFACT names no subject", () => {
    // Every word of these is how a reader asks for a learning path, so the
    // list is what was asked for — a different answer from "the curriculum
    // does not cover that", and the two must not collapse into one.
    expect(ask("what learning paths do you have").namedSubject).toBe(false);
    expect(ask("show me the study plan").namedSubject).toBe(false);
    expect(ask("មាគ៌ាសិក្សា").namedSubject).toBe(false);
  });

  it("a question about a SUBJECT names one, even when nothing covers it", () => {
    expect(ask("learning paths for underwater welding").namedSubject).toBe(true);
    expect(ask("where do i start with action research").namedSubject).toBe(true);
  });
});
