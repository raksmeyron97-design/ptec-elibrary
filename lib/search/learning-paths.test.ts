import { describe, expect, it } from "vitest";
import {
  pathBodyText,
  pathDurationMinutes,
  pathModuleCount,
  pathStepCount,
  type PathModulesRaw,
} from "./learning-paths";

const modules: PathModulesRaw = [
  {
    title: "Foundations",
    title_km: "មូលដ្ឋាន",
    learning_path_steps: [
      { resource_title: "Intro to Pedagogy", instruction: "Read chapter 1", est_minutes: 30 },
      { resource_title: "Classroom Basics", instruction: null, est_minutes: 15 },
    ],
  },
  {
    title: "Practice",
    title_km: null,
    learning_path_steps: [
      { resource_title: "Action Research", instruction: "Design a study", instruction_km: "រៀបចំការសិក្សា", est_minutes: 45 },
    ],
  },
];

describe("pathModuleCount", () => {
  it("counts modules", () => {
    expect(pathModuleCount(modules)).toBe(2);
  });
  it("handles null/empty", () => {
    expect(pathModuleCount(null)).toBe(0);
    expect(pathModuleCount([])).toBe(0);
    expect(pathModuleCount(undefined)).toBe(0);
  });
});

describe("pathStepCount", () => {
  it("sums steps across modules", () => {
    expect(pathStepCount(modules)).toBe(3);
  });
  it("treats a module without a steps array as zero", () => {
    expect(pathStepCount([{ title: "Empty" }])).toBe(0);
  });
});

describe("pathDurationMinutes", () => {
  it("sums est_minutes", () => {
    expect(pathDurationMinutes(modules)).toBe(90);
  });
  it("returns null when no step carries an estimate", () => {
    expect(
      pathDurationMinutes([{ title: "M", learning_path_steps: [{ resource_title: "x", est_minutes: null }] }]),
    ).toBeNull();
    expect(pathDurationMinutes([])).toBeNull();
  });
  it("ignores non-finite / non-positive estimates", () => {
    expect(
      pathDurationMinutes([
        {
          title: "M",
          learning_path_steps: [
            { resource_title: "a", est_minutes: 0 },
            { resource_title: "b", est_minutes: 20 },
          ],
        },
      ]),
    ).toBe(20);
  });
});

describe("pathBodyText", () => {
  it("flattens module + step text for ranking", () => {
    const text = pathBodyText(modules);
    expect(text).toContain("Foundations");
    expect(text).toContain("មូលដ្ឋាន");
    expect(text).toContain("Intro to Pedagogy");
    expect(text).toContain("Design a study");
    expect(text).toContain("រៀបចំការសិក្សា");
  });
  it("dedupes repeated fragments so long paths don't drown their own title", () => {
    const dup: PathModulesRaw = [
      { title: "Repeat", learning_path_steps: [{ resource_title: "Repeat" }, { resource_title: "Repeat" }] },
    ];
    // "Repeat" collapses to a single token rather than appearing three times.
    expect(pathBodyText(dup)).toBe("Repeat");
  });
  it("handles empty input", () => {
    expect(pathBodyText(null)).toBe("");
    expect(pathBodyText([])).toBe("");
  });
});
