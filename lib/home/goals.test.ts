import { describe, it, expect } from "vitest";
import { GOALS, resolveGoals, type GoalPathCandidate } from "./goals";

// The four published learning paths as they exist in the live collection.
// Titles/descriptions are the real ones, because the two production mislinks
// this module fixes were caused by that exact prose.
const REAL_PATHS: (GoalPathCandidate & { description: string; audience: string })[] = [
  {
    slug: "foundation-of-mathematics",
    title: "foundation of Mathematics",
    title_km: "មូលដ្ធានគ្រឹះគណិតវិទ្យា",
    description: "This course free for all student",
    audience: "Years 1",
  },
  {
    slug: "foundations-of-pedagogy",
    title: "Foundations of Pedagogy",
    title_km: "មូលដ្ឋានគរុកោសល្យ",
    description:
      "Start here as a Year 1 trainee: the core ideas behind teaching practice, and how to apply them in a real secondary-school classroom.",
    audience: "Year 1 Trainee",
  },
  {
    slug: "classroom-and-school-management",
    title: "Classroom & School Management",
    title_km: "ការគ្រប់គ្រងថ្នាក់រៀន និងសាលារៀន",
    description:
      "For in-service teachers moving into classroom leadership: running an effective classroom, fair assessment, and what a strong practicum looks like.",
    audience: "In-service Teacher",
  },
  {
    slug: "intro-to-classroom-action-research",
    title: "Intro to Classroom Action Research",
    title_km: "ការស្រាវជ្រាវសកម្មភាពក្នុងថ្នាក់រៀន",
    description:
      "Capstone prep: what action research is, how to run a cycle of it in your own classroom, and the research-methods foundation behind it.",
    audience: "Capstone / Research Prep",
  },
];

const byKey = (paths: GoalPathCandidate[] = REAL_PATHS) =>
  Object.fromEntries(resolveGoals(paths).map((g) => [g.key, g.href]));

describe("resolveGoals", () => {
  it("returns one entry per goal, in declaration order", () => {
    const resolved = resolveGoals(REAL_PATHS);
    expect(resolved.map((g) => g.key)).toEqual(GOALS.map((g) => g.key));
  });

  it("never sends two goals to the same destination", () => {
    const hrefs = resolveGoals(REAL_PATHS).map((g) => g.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  // ── The two production regressions, pinned by name ────────────────────────

  it("does not send 'Prepare for PISA' to the classroom-management path", () => {
    // Regression: "assessment" used to match that path's description.
    expect(byKey().Pisa).toBe("/search?q=PISA");
  });

  it("does not send 'Develop as a teacher' to a path matched only by audience prose", () => {
    // Regression: "in-service" used to match audience "In-service Teacher".
    // It now matches on the TITLE ("... School Management"), which is a fair
    // description of the card — but it must be the only goal that claims it.
    expect(byKey().Teacher).toBe("/paths/classroom-and-school-management");
    expect(byKey().Pisa).not.toBe(byKey().Teacher);
  });

  it("routes each goal to the path that actually matches its label", () => {
    expect(byKey()).toEqual({
      Lesson: "/paths/foundations-of-pedagogy",
      Thesis: "/theses",
      Research: "/paths/intro-to-classroom-action-research",
      Pisa: "/search?q=PISA",
      Teacher: "/paths/classroom-and-school-management",
      Khmer: "/books?language=Khmer",
    });
  });

  it("ignores description and audience entirely", () => {
    // A path whose prose is stuffed with every keyword must still not be
    // claimed, because none of it is a name field.
    const decoy: GoalPathCandidate & { description: string; audience: string } = {
      slug: "decoy",
      title: "Something Else Entirely",
      title_km: null,
      description: "pisa assessment thesis dissertation action research khmer language",
      audience: "In-service professional development",
    };
    const hrefs = resolveGoals([decoy]).map((g) => g.href);
    expect(hrefs.some((h) => h.startsWith("/paths/decoy"))).toBe(false);
  });

  it("matches subject and tags, which are name fields", () => {
    const tagged: GoalPathCandidate = {
      slug: "pisa-readiness",
      title: "Readiness Programme",
      title_km: null,
      tags: ["PISA", "assessment"],
    };
    expect(byKey([tagged]).Pisa).toBe("/paths/pisa-readiness");
  });

  it("falls back to a curated route for every goal when no paths are published", () => {
    const hrefs = resolveGoals([]).map((g) => g.href);
    expect(hrefs).toEqual(GOALS.map((g) => g.fallback));
    // A fallback is never a path URL — a dead /paths link is exactly what the
    // fallbacks exist to avoid.
    expect(hrefs.every((h) => !h.startsWith("/paths/"))).toBe(true);
  });

  it("gives the contested path to the earlier goal, and the later goal its fallback", () => {
    const only = [REAL_PATHS[2]]; // Classroom & School Management
    const resolved = resolveGoals(only);
    const teacher = resolved.find((g) => g.key === "Teacher")!;
    expect(teacher.href).toBe("/paths/classroom-and-school-management");
    // Every other goal must have fallen back, not doubled up.
    for (const g of resolved) {
      if (g.key !== "Teacher") expect(g.href).not.toContain("classroom-and-school-management");
    }
  });

  it("declares an absolute, in-app fallback for every goal", () => {
    for (const goal of GOALS) {
      expect(goal.fallback.startsWith("/")).toBe(true);
      expect(goal.match.length).toBeGreaterThan(0);
      // Keywords must be lowercase, or `includes` on a lowercased haystack
      // silently never matches.
      for (const kw of goal.match) expect(kw).toBe(kw.toLowerCase());
    }
  });
});
