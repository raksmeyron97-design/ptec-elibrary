import { describe, expect, it } from "vitest";
import {
  buildSubjectHierarchyTree,
  buildSubjectBreadcrumbs,
  buildSubjectHierarchySchema,
  type SubjectHierarchyRecord,
} from "./hierarchy";
import { SITE_URL } from "@/lib/seo/site";

describe("buildSubjectHierarchyTree", () => {
  const records: SubjectHierarchyRecord[] = [
    {
      id: "parent-1",
      slug: "science",
      name_en: "Science",
      name_km: "វិទ្យាសាស្ត្រ",
      parent_id: null,
      legacy_category_id: "cat-science",
    },
    {
      id: "child-1",
      slug: "chemistry",
      name_en: "Chemistry",
      name_km: "គីមីវិទ្យា",
      parent_id: "parent-1",
      legacy_category_id: "cat-chem",
    },
    {
      id: "child-2",
      slug: "biology",
      name_en: "Biology",
      name_km: "ជីវវិទ្យា",
      parent_id: "parent-1",
      legacy_category_id: "cat-bio",
    },
    {
      id: "flat-1",
      slug: "law",
      name_en: "Law",
      name_km: "ច្បាប់",
      parent_id: null,
      legacy_category_id: "cat-law",
    },
  ];

  it("links parent to children and child to parent correctly", () => {
    const tree = buildSubjectHierarchyTree(records, "en");

    const science = tree.bySlug.get("science");
    expect(science).toBeDefined();
    expect(science?.parent).toBeNull();
    expect(science?.children).toHaveLength(2);
    expect(science?.children.map((c) => c.slug)).toEqual(["chemistry", "biology"]);

    const chem = tree.bySlug.get("chemistry");
    expect(chem).toBeDefined();
    expect(chem?.parent).toEqual({
      id: "parent-1",
      slug: "science",
      name: "Science",
    });
    expect(chem?.children).toHaveLength(0);

    const law = tree.bySlug.get("law");
    expect(law).toBeDefined();
    expect(law?.parent).toBeNull();
    expect(law?.children).toHaveLength(0);
  });

  it("indexes by legacy category id", () => {
    const tree = buildSubjectHierarchyTree(records, "en");
    expect(tree.byCategoryId.get("cat-chem")?.slug).toBe("chemistry");
    expect(tree.byCategoryId.get("cat-science")?.slug).toBe("science");
  });

  it("uses Khmer names when locale is km", () => {
    const tree = buildSubjectHierarchyTree(records, "km");
    const science = tree.bySlug.get("science");
    expect(science?.name).toBe("វិទ្យាសាស្ត្រ");
    expect(science?.children[0].name).toBe("គីមីវិទ្យា");
  });
});

describe("buildSubjectBreadcrumbs", () => {
  const t = (k: string) => (k === "breadcrumbHome" ? "Home" : "Subjects");

  it("creates 3 crumbs for a standalone or parent subject", () => {
    const crumbs = buildSubjectBreadcrumbs({ name: "Science", slug: "science" }, null, t);
    expect(crumbs).toEqual([
      { name: "Home", path: "/" },
      { name: "Subjects", path: "/subjects" },
      { name: "Science" },
    ]);
  });

  it("creates 4 crumbs for a child subject, inserting the parent before current", () => {
    const crumbs = buildSubjectBreadcrumbs(
      { name: "Chemistry", slug: "chemistry" },
      { id: "p1", name: "Science", slug: "science" },
      t,
    );
    expect(crumbs).toEqual([
      { name: "Home", path: "/" },
      { name: "Subjects", path: "/subjects" },
      { name: "Science", path: "/subjects/science" },
      { name: "Chemistry" },
    ]);
  });
});

describe("buildSubjectHierarchySchema", () => {
  it("emits hasPart on parent hubs", () => {
    const schema = buildSubjectHierarchySchema({
      subjectSlug: "science",
      subjectName: "Science",
      locale: "en",
      parent: null,
      children: [
        { id: "c1", slug: "chemistry", name: "Chemistry" },
        { id: "c2", slug: "biology", name: "Biology" },
      ],
      hubSeoTitle: "All Subjects",
    });

    expect(schema.hasPart).toHaveLength(2);
    expect(schema.hasPart?.[0]).toEqual({
      "@type": "CollectionPage",
      "@id": `${SITE_URL}/subjects/chemistry#collection`,
      name: "Chemistry",
      url: `${SITE_URL}/subjects/chemistry`,
    });
    expect(schema.isPartOf).toEqual({
      "@type": "CollectionPage",
      name: "All Subjects",
      url: `${SITE_URL}/subjects`,
    });
    expect(schema.about).toEqual({
      "@type": "Thing",
      name: "Science",
    });
  });

  it("emits isPartOf pointing to parent collection on child hubs", () => {
    const schema = buildSubjectHierarchySchema({
      subjectSlug: "chemistry",
      subjectName: "Chemistry",
      locale: "en",
      parent: { id: "p1", slug: "science", name: "Science" },
      children: [],
      hubSeoTitle: "All Subjects",
    });

    expect(schema.hasPart).toBeUndefined();
    expect(schema.isPartOf).toEqual({
      "@type": "CollectionPage",
      "@id": `${SITE_URL}/subjects/science#collection`,
      name: "Science",
      url: `${SITE_URL}/subjects/science`,
    });
    expect(schema.about).toEqual({
      "@type": "DefinedTerm",
      name: "Chemistry",
      inDefinedTermSet: `${SITE_URL}/subjects`,
      broader: `${SITE_URL}/subjects/science`,
    });
  });

  it("emits /km prefixes on Khmer pages", () => {
    const schema = buildSubjectHierarchySchema({
      subjectSlug: "គីមីវិទ្យា",
      subjectName: "គីមីវិទ្យា",
      locale: "km",
      parent: { id: "p1", slug: "វិទ្យាសាស្ត្រ", name: "វិទ្យាសាស្ត្រ" },
      children: [],
      hubSeoTitle: "ប្រធានបទទាំងអស់",
    });

    expect(schema.isPartOf).toEqual({
      "@type": "CollectionPage",
      "@id": `${SITE_URL}/km/subjects/វិទ្យាសាស្ត្រ#collection`,
      name: "វិទ្យាសាស្ត្រ",
      url: `${SITE_URL}/km/subjects/វិទ្យាសាស្ត្រ`,
    });
    expect(schema.about).toEqual({
      "@type": "DefinedTerm",
      name: "គីមីវិទ្យា",
      inDefinedTermSet: `${SITE_URL}/km/subjects`,
      broader: `${SITE_URL}/km/subjects/វិទ្យាសាស្ត្រ`,
    });
  });
});
