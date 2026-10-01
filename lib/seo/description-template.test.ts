import { describe, expect, it } from "vitest";
import { clusterSizes, descriptionResidue, isPlaceholderDate, templateKey } from "./description-template";

describe("templateKey", () => {
  it("puts two fill-in copies of one template in the same cluster", () => {
    const a = templateKey("This Grade 4 Mathematics textbook from MoEYS covers the national curriculum for primary schools.", {
      title: "Mathematics Grade 4",
      subject: "Mathematics",
    });
    const b = templateKey("This Grade 5 Science textbook from MoEYS covers the national curriculum for primary schools.", {
      title: "Science Grade 5",
      subject: "Science",
    });
    expect(a).toBe(b);
  });
  it("keeps genuinely different descriptions apart", () => {
    const a = templateKey("A practical guide to action research for classroom teachers, with worked examples.");
    const b = templateKey("An introduction to statistics for education researchers using Cambodian school data.");
    expect(a).not.toBe(b);
  });
  it("calls a missing or fill-in-only description empty", () => {
    expect(templateKey(null)).toBe("empty");
    expect(templateKey("  ")).toBe("empty");
    expect(templateKey("Mathematics Grade 4", { title: "Mathematics Grade 4" })).toBe("empty");
  });
  it("treats Khmer and Latin digits alike", () => {
    expect(descriptionResidue("ថ្នាក់ទី៤ និង 2024", {})).toBe("ថ្នាក់ទី# និង #");
  });
});

describe("clusterSizes / isPlaceholderDate", () => {
  it("counts each fingerprint", () => {
    expect(clusterSizes(["a", "b", "a"]).get("a")).toBe(2);
  });
  it("flags 1 January of the creation year only", () => {
    expect(isPlaceholderDate("2026-01-01T00:00:00Z", "2026-09-12T10:00:00Z")).toBe(true);
    expect(isPlaceholderDate("2019-01-01", "2026-09-12T10:00:00Z")).toBe(false);
    expect(isPlaceholderDate("2026-05-03", "2026-09-12T10:00:00Z")).toBe(false);
  });
});
