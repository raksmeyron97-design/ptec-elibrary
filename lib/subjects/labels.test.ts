import { describe, it, expect } from "vitest";
import {
  SUBJECT_RESOURCE_TYPES,
  subjectBreakdown,
  subjectTypeKey,
  type SubjectCounts,
} from "@/lib/subjects/labels";

// A fake translator that echoes the key and count, so these assert the MAPPING
// (which key, for which type, with which number) rather than the wording.
const t = (key: string, values?: Record<string, unknown>) => `${key}=${values?.count}`;

const counts = (partial: Partial<SubjectCounts>): SubjectCounts => {
  const base = { book: 0, thesis: 0, publication: 0, catalog: 0, ...partial };
  return { ...base, total: base.book + base.thesis + base.publication + base.catalog };
};

describe("subjectTypeKey", () => {
  it("derives the message-key suffix for every resource type", () => {
    expect(SUBJECT_RESOURCE_TYPES.map(subjectTypeKey)).toEqual([
      "Book",
      "Thesis",
      "Publication",
      "Catalog",
    ]);
  });
});

describe("subjectBreakdown", () => {
  it("names only the types that are actually present", () => {
    expect(subjectBreakdown(counts({ book: 8, thesis: 2 }), t)).toEqual([
      "countBook=8",
      "countThesis=2",
    ]);
  });

  it("never renders a zero — the breakdown states what is there, not a form", () => {
    expect(subjectBreakdown(counts({ book: 3 }), t)).toEqual(["countBook=3"]);
  });

  it("returns nothing for an empty subject", () => {
    expect(subjectBreakdown(counts({}), t)).toEqual([]);
  });

  it("keeps a stable type order regardless of which counts are set", () => {
    expect(subjectBreakdown(counts({ catalog: 1, book: 1, publication: 1, thesis: 1 }), t)).toEqual([
      "countBook=1",
      "countThesis=1",
      "countPublication=1",
      "countCatalog=1",
    ]);
  });

  it("uses a key that exists in both message catalogues", async () => {
    // The mapping is only useful if the derived keys are real. This is what
    // would have caught a rename of `countBook` in messages/*.json.
    // No cast: the catalogues are nested objects, and `toHaveProperty` needs
    // no help. Casting them to Record<string, Record<string, string>> is what
    // TS rejects, since namespaces like `footer` hold nested groups.
    const en = (await import("@/messages/en.json")).default;
    const km = (await import("@/messages/km.json")).default;
    for (const type of SUBJECT_RESOURCE_TYPES) {
      const key = `count${subjectTypeKey(type)}`;
      expect(en.subjects, `en.subjects.${key}`).toHaveProperty(key);
      expect(km.subjects, `km.subjects.${key}`).toHaveProperty(key);
      // The group / type / browseAll families are derived the same way.
      for (const family of ["group", "type", "browseAll"]) {
        const k = `${family}${subjectTypeKey(type)}`;
        expect(en.subjects, `en.subjects.${k}`).toHaveProperty(k);
        expect(km.subjects, `km.subjects.${k}`).toHaveProperty(k);
      }
    }
  });
});
