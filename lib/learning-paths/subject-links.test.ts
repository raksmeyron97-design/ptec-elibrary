import { describe, expect, it } from "vitest";
import { filterPathsForSubject, matchSubjectForPath } from "./subject-links";

describe("filterPathsForSubject", () => {
  const samplePaths = [
    {
      id: "p1",
      slug: "math-g1",
      title: "Grade 1 Math",
      subject: "គណិតវិទ្យា",
      status: "published",
      position: 1,
    },
    {
      id: "p2",
      slug: "math-g2",
      title: "Grade 2 Math",
      subject: "គណិតវិទ្យា",
      status: "published",
      position: 2,
    },
    {
      id: "p3",
      slug: "reading-g1",
      title: "Grade 1 Reading",
      subject: "ភាសាខ្មែរ",
      status: "published",
      position: 1,
    },
    {
      id: "p4",
      slug: "draft-math",
      title: "Draft Math Path",
      subject: "គណិតវិទ្យា",
      status: "draft",
      position: 3,
    },
    {
      id: "p5",
      slug: "combined-package",
      title: "Combined Package",
      subject: "អំណាន និងគណិតវិទ្យា",
      status: "published",
      position: 4,
    },
  ];

  it("filters published paths matching subject", () => {
    const mathPaths = filterPathsForSubject(samplePaths, "គណិតវិទ្យា");
    expect(mathPaths.map((p) => p.slug)).toEqual(["math-g1", "math-g2", "combined-package"]);
  });

  it("never includes draft or unpublished paths", () => {
    const mathPaths = filterPathsForSubject(samplePaths, "គណិតវិទ្យា");
    expect(mathPaths.some((p) => p.slug === "draft-math")).toBe(false);
  });

  it("filters reading paths for ភាសា", () => {
    const readingPaths = filterPathsForSubject(samplePaths, "ភាសា");
    expect(readingPaths.map((p) => p.slug)).toEqual(["reading-g1"]);
  });

  it("returns empty array for unrelated subject", () => {
    const physicsPaths = filterPathsForSubject(samplePaths, "រូបវិទ្យា");
    expect(physicsPaths).toEqual([]);
  });

  it("returns empty array for empty subject name", () => {
    expect(filterPathsForSubject(samplePaths, "")).toEqual([]);
    expect(filterPathsForSubject(samplePaths, "   ")).toEqual([]);
  });
});

describe("matchSubjectForPath", () => {
  const categories = [
    { name: "គណិតវិទ្យា", slug: "គណិតវិទ្យា" },
    { name: "ភាសា", slug: "ភាសា" },
    { name: "រូបវិទ្យា", slug: "រូបវិទ្យា" },
  ];

  it("matches subject category by path subject", () => {
    expect(matchSubjectForPath("គណិតវិទ្យា", categories)).toEqual({
      name: "គណិតវិទ្យា",
      slug: "គណិតវិទ្យា",
    });
    expect(matchSubjectForPath("ភាសាខ្មែរ", categories)).toEqual({
      name: "ភាសា",
      slug: "ភាសា",
    });
  });

  it("returns null when no category matches", () => {
    expect(matchSubjectForPath("ច្បាប់", categories)).toBeNull();
    expect(matchSubjectForPath(null, categories)).toBeNull();
    expect(matchSubjectForPath("", categories)).toBeNull();
  });
});
