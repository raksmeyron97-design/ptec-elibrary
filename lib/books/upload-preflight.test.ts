// The quality gate's rules, away from the panel that renders them.
//
// The distinction these tests protect is the one the whole feature turns on:
// what BLOCKS a save (a missing requirement, a confirmed duplicate) versus
// what merely warrants a warning (a large file, an unverifiable ISBN, a new
// author). Getting that wrong in either direction is a defect — a blocked
// librarian who should have been warned, or a duplicate that walked through.

import { describe, expect, it } from "vitest";
import { buildPreflight, type PreflightInput } from "./upload-preflight";

const READY: PreflightInput = {
  pdf: { chosen: true, sizeBytes: 5_000_000, overSize: false, overRecommended: false },
  pages: { detecting: false, detected: 126 },
  title: "Classroom Management Basics",
  author: { name: "Chan Sophea", canonicalId: "22222222-2222-4222-8222-222222222202" },
  category: "Pedagogy",
  department: "Pedagogy",
  isbn: { raw: "978-0-306-40615-7", status: "valid" },
  duplicates: { state: "ready", blocked: false, count: 0, confidence: null },
};

const toneOf = (report: ReturnType<typeof buildPreflight>, id: string) =>
  report.checks.find((check) => check.id === id)?.tone;

describe("buildPreflight", () => {
  it("passes a complete record with no duplicates", () => {
    const report = buildPreflight(READY);
    expect(report.blocked).toBe(false);
    expect(report.ready).toBe(true);
    expect(report.warnings).toBe(0);
    expect(report.checks.every((check) => check.tone === "pass")).toBe(true);
  });

  it("blocks on each missing requirement, and names which one", () => {
    expect(toneOf(buildPreflight({ ...READY, title: "  " }), "title")).toBe("fail");
    expect(
      toneOf(buildPreflight({ ...READY, author: { name: "", canonicalId: null } }), "author"),
    ).toBe("fail");
    expect(toneOf(buildPreflight({ ...READY, category: "" }), "taxonomy")).toBe("fail");
    expect(
      toneOf(
        buildPreflight({ ...READY, pdf: { ...READY.pdf, chosen: false } }),
        "pdf",
      ),
    ).toBe("fail");
    for (const broken of [
      { ...READY, title: "" },
      { ...READY, category: "" },
      { ...READY, pdf: { ...READY.pdf, chosen: false } },
    ]) {
      expect(buildPreflight(broken).blocked).toBe(true);
    }
  });

  it("blocks on a confirmed duplicate", () => {
    const report = buildPreflight({
      ...READY,
      duplicates: { state: "ready", blocked: true, count: 1, confidence: "exact" },
    });
    expect(toneOf(report, "duplicates")).toBe("fail");
    expect(report.blocked).toBe(true);
  });

  it("WARNS, never blocks, on an ISBN whose check digit fails", () => {
    // A real printed ISBN can be wrong. Refusing the record would lose the
    // book in order to save the number.
    const report = buildPreflight({ ...READY, isbn: { raw: "9780306406150", status: "invalid" } });
    expect(toneOf(report, "isbn")).toBe("warn");
    expect(report.blocked).toBe(false);
  });

  it("WARNS, never blocks, on a large PDF and a missing page count", () => {
    const large = buildPreflight({
      ...READY,
      pdf: { ...READY.pdf, overRecommended: true },
      pages: { detecting: false, detected: null },
    });
    expect(toneOf(large, "pdf")).toBe("warn");
    expect(toneOf(large, "pages")).toBe("warn");
    expect(large.blocked).toBe(false);
  });

  it("WARNS that a new author will be created — normal, but worth saying", () => {
    const report = buildPreflight({
      ...READY,
      author: { name: "Someone New", canonicalId: null },
    });
    expect(toneOf(report, "author")).toBe("warn");
    expect(report.blocked).toBe(false);
  });

  it("never reports a failed duplicate check as a clean one", () => {
    const failed = buildPreflight({ ...READY, duplicates: { state: "error" } });
    expect(toneOf(failed, "duplicates")).toBe("warn");
    expect(failed.checks.find((c) => c.id === "duplicates")?.messageKey).toBe(
      "duplicates.unavailable",
    );
  });

  it("is not READY while a check is still running", () => {
    const checking = buildPreflight({ ...READY, duplicates: { state: "checking" } });
    expect(checking.ready).toBe(false);
    expect(checking.blocked).toBe(false);
    expect(toneOf(checking, "duplicates")).toBe("pending");
  });

  it("distinguishes 'we did not look' from 'we looked and found nothing'", () => {
    const idle = buildPreflight({ ...READY, duplicates: { state: "idle" } });
    expect(idle.checks.find((c) => c.id === "duplicates")?.messageKey).toBe("duplicates.idle");
    expect(buildPreflight(READY).checks.find((c) => c.id === "duplicates")?.messageKey).toBe(
      "duplicates.clean",
    );
  });

  it("names a strong match differently from a possible one", () => {
    const strong = buildPreflight({
      ...READY,
      duplicates: { state: "ready", blocked: false, count: 2, confidence: "high" },
    });
    const possible = buildPreflight({
      ...READY,
      duplicates: { state: "ready", blocked: false, count: 2, confidence: "medium" },
    });
    expect(strong.checks.find((c) => c.id === "duplicates")?.messageKey).toBe("duplicates.strong");
    expect(possible.checks.find((c) => c.id === "duplicates")?.messageKey).toBe(
      "duplicates.possible",
    );
  });
});
