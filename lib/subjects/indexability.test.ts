import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  SUBJECT_MIN_FULL_TEXT,
  SUBJECT_MIN_RESOURCES,
  isBrowsableSubject,
  isIndexableSubject,
  subjectVisibility,
} from "./indexability";
import type { SubjectCounts } from "./labels";

const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

function counts(total: number): SubjectCounts {
  return { book: total, thesis: 0, publication: 0, catalog: 0, total };
}

describe("the SEO 3.3 §5 depth gate", () => {
  it("indexes a subject that clears both thresholds", () => {
    expect(subjectVisibility(counts(SUBJECT_MIN_RESOURCES), SUBJECT_MIN_FULL_TEXT)).toBe("index");
    expect(subjectVisibility(counts(65), 59)).toBe("index");
  });

  it("does not index a subject with enough resources but too little full text", () => {
    // The §5.2 case: a hub whose items cannot be searched inside or cited is a
    // directory entry. 8 resources, 2 of them readable.
    expect(subjectVisibility(counts(8), SUBJECT_MIN_FULL_TEXT - 1)).toBe("noindex");
  });

  it("does not index a shallow subject however readable its few resources are", () => {
    expect(subjectVisibility(counts(SUBJECT_MIN_RESOURCES - 1), 4)).toBe("noindex");
  });

  it("suppresses a subject with nothing to stand on", () => {
    // 0 was already suppressed before 3.3 (docs/SEO-V2-AUDIT.md F-1). 1 is the
    // case this phase adds: វិធីសាស្ត្របង្រៀនរូបវិទ្យា held one 23-page book and
    // was `index, follow` AND in sitemap.xml.
    expect(subjectVisibility(counts(0), 0)).toBe("suppressed");
    expect(subjectVisibility(counts(1), 1)).toBe("suppressed");
    expect(subjectVisibility(counts(2), 2)).toBe("noindex");
  });

  it("keeps a thin subject linkable and a suppressed one not", () => {
    expect(isBrowsableSubject(counts(3), 3)).toBe(true);
    expect(isIndexableSubject(counts(3), 3)).toBe(false);
    expect(isBrowsableSubject(counts(1), 1)).toBe(false);
  });

  // The failure that this shape exists to prevent: one flaky read of
  // resource_index_state demoting the ENTIRE taxonomy in a single deploy.
  it("treats an unavailable full-text count as unknown, never as zero", () => {
    expect(subjectVisibility(counts(65), null)).toBe("index");
    expect(subjectVisibility(counts(65), 0)).toBe("noindex");
  });

  it("still suppresses on an unknown full-text count when the subject is empty", () => {
    // Criterion 1 is decided from counts alone, so it survives the outage.
    expect(subjectVisibility(counts(0), null)).toBe("suppressed");
    expect(subjectVisibility(counts(4), null)).toBe("noindex");
  });
});

// ── One gate, three surfaces ────────────────────────────────────────────────
//
// A source scan, not a behaviour test, because the defect is structural: the
// sitemap and the page each decided indexability for themselves, and a URL was
// submitted whose page could answer `noindex`. These assertions fail when a
// surface grows its own rule again.
describe("every subject surface reads the same gate", () => {
  it("the sitemap filters with getIndexableSubjects", () => {
    expect(read("app/sitemap.ts")).toContain("getIndexableSubjects()");
  });

  it("the page's robots meta is decided by subjectVisibility, not by a count", () => {
    const page = read("app/[locale]/(public)/subjects/[slug]/page.tsx");
    expect(page).toContain('subjectVisibility(subject.counts, subject.fullText) === "index"');
    expect(page).not.toContain("subject.counts.total === 0 ?");
  });

  it("the hub links browsable subjects, so a thin one stays reachable", () => {
    const hub = read("app/[locale]/(public)/subjects/page.tsx");
    expect(hub).toContain("getBrowsableSubjects()");
    expect(hub).not.toContain("getIndexableSubjects()");
  });

  it("the AI assistant is not narrowed by an indexing policy", () => {
    // A suppressed hub still holds a book, and a reader asking about it must
    // still be answered — retrieval reads "has resources", not "may be indexed".
    const retrieval = read("lib/ai/retrieval.ts");
    expect(retrieval).toContain("getSubjectsWithResources()");
    expect(retrieval).not.toContain("getIndexableSubjects()");
  });
});
