import { describe, expect, it } from "vitest";

import {
  buildSubjectBreadcrumbs,
  buildSubjectHierarchySchema,
  buildSubjectHierarchyTree,
  type SubjectHierarchyRecord,
} from "./hierarchy";
import { subjectBreakdown, type SubjectCounts } from "./labels";

describe("Subject Hierarchy UI & Navigation", () => {
  const records: SubjectHierarchyRecord[] = [
    {
      id: "parent-edu",
      slug: "education",
      name_en: "Education",
      name_km: "អប់រំ",
      parent_id: null,
      legacy_category_id: "cat-edu",
    },
    {
      id: "child-reading",
      slug: "childhood-reading",
      name_en: "Childhood Reading",
      name_km: "អំណានកុមារ",
      parent_id: "parent-edu",
      legacy_category_id: "cat-read",
    },
  ];

  it("builds hierarchy tree correctly with parent-child relationships", () => {
    const treeEn = buildSubjectHierarchyTree(records, "en");
    const parent = treeEn.bySlug.get("education");
    const child = treeEn.bySlug.get("childhood-reading");

    expect(parent).toBeDefined();
    expect(child).toBeDefined();
    expect(parent?.children).toHaveLength(1);
    expect(parent?.children[0].slug).toBe("childhood-reading");
    expect(child?.parent?.slug).toBe("education");
  });

  it("builds 4-level breadcrumbs for child subjects and 3-level for parent subjects", () => {
    const t = (k: string) => (k === "breadcrumbHome" ? "Home" : "Subjects");

    const parentCrumbs = buildSubjectBreadcrumbs(
      { name: "Education", slug: "education" },
      null,
      t,
    );
    expect(parentCrumbs).toHaveLength(3);
    expect(parentCrumbs.map((c) => c.name)).toEqual(["Home", "Subjects", "Education"]);

    const childCrumbs = buildSubjectBreadcrumbs(
      { name: "Childhood Reading", slug: "childhood-reading" },
      { id: "parent-edu", name: "Education", slug: "education" },
      t,
    );
    expect(childCrumbs).toHaveLength(4);
    expect(childCrumbs.map((c) => c.name)).toEqual([
      "Home",
      "Subjects",
      "Education",
      "Childhood Reading",
    ]);
    expect(childCrumbs[2].path).toBe("/subjects/education");
  });

  it("emits correct Schema.org CollectionPage hierarchy relations", () => {
    const parentSchema = buildSubjectHierarchySchema({
      subjectSlug: "education",
      subjectName: "Education",
      locale: "en",
      parent: null,
      children: [{ id: "child-reading", name: "Childhood Reading", slug: "childhood-reading" }],
      hubSeoTitle: "Subjects — Browse by Topic",
    });

    expect(parentSchema.hasPart).toHaveLength(1);
    expect(parentSchema.hasPart?.[0].url).toContain("/subjects/childhood-reading");

    const childSchema = buildSubjectHierarchySchema({
      subjectSlug: "childhood-reading",
      subjectName: "Childhood Reading",
      locale: "en",
      parent: { id: "parent-edu", name: "Education", slug: "education" },
      children: [],
      hubSeoTitle: "Subjects — Browse by Topic",
    });

    expect(childSchema.isPartOf?.url).toContain("/subjects/education");
    expect(childSchema.about).toBeDefined();
    expect(childSchema.about?.broader).toContain("/subjects/education");
  });

  it("formats resource breakdown without empty types", () => {
    const counts: SubjectCounts = {
      book: 14,
      thesis: 0,
      publication: 2,
      catalog: 5,
      total: 21,
    };

    const mockTranslate = (key: string, values?: Record<string, any>) => {
      const count = values?.count ?? 0;
      switch (key) {
        case "countBook":
          return `${count} books`;
        case "countThesis":
          return `${count} theses`;
        case "countPublication":
          return `${count} articles`;
        case "countCatalog":
          return `${count} physical copies`;
        default:
          return "";
      }
    };

    const parts = subjectBreakdown(counts, mockTranslate);
    expect(parts).toEqual(["14 books", "2 articles", "5 physical copies"]);
    // Thesis has count 0 so it must not be in the breakdown
    expect(parts).not.toContain("0 theses");
  });
});
