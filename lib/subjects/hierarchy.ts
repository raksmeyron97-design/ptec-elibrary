// lib/subjects/hierarchy.ts
//
// Pure subject hierarchy helpers for SEO 3.3 Phase B Item 6.
//
// ── Why this module exists ──────────────────────────────────────────────────
//
// Migration 0146 backfilled the canonical 3-parent / 7-child topic hierarchy
// into `public.subjects` (`parent_id`) based on tag co-occurrence evidence
// (docs/SEO-3.3-TOPIC-AUTHORITY-AUDIT.md §10.1).
//
// This module provides the pure data structures and builders to:
//   1. Resolve parent and child relations for any subject.
//   2. Build 4-level breadcrumbs for child subjects:
//      Home → Subjects → [Parent Subject] → [Child Subject]
//   3. Build Schema.org `CollectionPage` enhancements:
//      - `hasPart`: lists child collection pages for parent hubs.
//      - `isPartOf`: points to parent collection page for child hubs.
//      - `about.broader`: formal taxonomy broader-term link.
//
// Pure and browser-safe so rules are unit-tested without a database
// (lib/subjects/hierarchy-schema.test.ts).

import { SITE_URL } from "@/lib/seo/site";

export type SubjectHierarchyRecord = {
  id: string;
  slug: string;
  name_en: string;
  name_km: string | null;
  parent_id: string | null;
  legacy_category_id: string | null;
};

export type SubjectHierarchyRef = {
  id: string;
  slug: string;
  name: string;
};

export type SubjectHierarchyNode = {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  legacyCategoryId: string | null;
  parent: SubjectHierarchyRef | null;
  children: SubjectHierarchyRef[];
};

export type SubjectHierarchyTree = {
  bySlug: Map<string, SubjectHierarchyNode>;
  byCategoryId: Map<string, SubjectHierarchyNode>;
  byId: Map<string, SubjectHierarchyNode>;
};

/**
 * Resolves the display name of a subject for a given locale.
 *
 * In production, `name_km` holds the Khmer title and `name_en` holds the
 * canonical fallback (often Khmer text too).
 */
export function resolveSubjectName(
  record: { name_en: string; name_km: string | null },
  locale?: string,
): string {
  if (locale === "km") {
    return record.name_km || record.name_en;
  }
  return record.name_en || record.name_km || "";
}

/**
 * Builds an in-memory hierarchy tree from canonical `public.subjects` records.
 *
 * Guaranteed safe:
 *  - Resolves parent pointers via `parent_id`.
 *  - Aggregates children into `children` arrays.
 *  - Indexed by `slug`, `legacyCategoryId`, and `id`.
 */
export function buildSubjectHierarchyTree(
  records: SubjectHierarchyRecord[],
  locale?: string,
): SubjectHierarchyTree {
  const byId = new Map<string, SubjectHierarchyNode>();
  const bySlug = new Map<string, SubjectHierarchyNode>();
  const byCategoryId = new Map<string, SubjectHierarchyNode>();

  // 1. Initialize nodes
  for (const r of records) {
    const name = resolveSubjectName(r, locale);
    const node: SubjectHierarchyNode = {
      id: r.id,
      slug: r.slug,
      name,
      parentId: r.parent_id,
      legacyCategoryId: r.legacy_category_id,
      parent: null,
      children: [],
    };
    byId.set(r.id, node);
    bySlug.set(r.slug, node);
    if (r.legacy_category_id) {
      byCategoryId.set(r.legacy_category_id, node);
    }
  }

  // 2. Link parent and children
  for (const node of byId.values()) {
    if (node.parentId) {
      const parentNode = byId.get(node.parentId);
      if (parentNode && parentNode.id !== node.id) {
        node.parent = {
          id: parentNode.id,
          slug: parentNode.slug,
          name: parentNode.name,
        };
        parentNode.children.push({
          id: node.id,
          slug: node.slug,
          name: node.name,
        });
      }
    }
  }

  return { bySlug, byCategoryId, byId };
}

export type SubjectCrumb = {
  name: string;
  path?: string;
};

/**
 * Constructs breadcrumb segments for a subject hub page.
 *
 * Standalone or parent hubs:
 *   Home (/) → Subjects (/subjects) → [Subject Name]
 *
 * Child hubs (with a parent):
 *   Home (/) → Subjects (/subjects) → [Parent Name] (/subjects/[parent-slug]) → [Child Name]
 */
export function buildSubjectBreadcrumbs(
  subject: { name: string; slug: string },
  parent: SubjectHierarchyRef | null | undefined,
  t: (key: string) => string,
): SubjectCrumb[] {
  const crumbs: SubjectCrumb[] = [
    { name: t("breadcrumbHome"), path: "/" },
    { name: t("breadcrumbSubjects"), path: "/subjects" },
  ];

  if (parent) {
    crumbs.push({
      name: parent.name,
      path: `/subjects/${parent.slug}`,
    });
  }

  crumbs.push({ name: subject.name });
  return crumbs;
}

export type SubjectHierarchySchemaOptions = {
  subjectSlug: string;
  subjectName: string;
  locale: string;
  parent?: SubjectHierarchyRef | null;
  children?: SubjectHierarchyRef[];
  hubSeoTitle: string;
};

/**
 * Constructs Schema.org `CollectionPage` hierarchy markup:
 *
 * - Parents emit `hasPart: CollectionPage[]` linking each child collection.
 * - Children emit `isPartOf: CollectionPage` pointing to their parent collection,
 *   and `about` with `broader` relationship.
 * - Flat subjects emit standard `isPartOf: /subjects` without `hasPart`.
 */
export function buildSubjectHierarchySchema({
  subjectSlug,
  subjectName,
  locale,
  parent,
  children = [],
  hubSeoTitle,
}: SubjectHierarchySchemaOptions) {
  const prefix = locale === "km" ? `${SITE_URL}/km` : SITE_URL;

  // Default isPartOf points to the root subjects directory
  const rootPartOf = {
    "@type": "CollectionPage",
    name: hubSeoTitle,
    url: `${prefix}/subjects`,
  };

  if (parent) {
    const parentUrl = `${prefix}/subjects/${parent.slug}`;
    return {
      isPartOf: {
        "@type": "CollectionPage",
        "@id": `${parentUrl}#collection`,
        name: parent.name,
        url: parentUrl,
      },
      about: {
        "@type": "DefinedTerm",
        name: subjectName,
        inDefinedTermSet: `${prefix}/subjects`,
        broader: parentUrl,
      },
      hasPart: undefined,
    };
  }

  if (children.length > 0) {
    return {
      isPartOf: rootPartOf,
      about: {
        "@type": "Thing",
        name: subjectName,
      },
      hasPart: children.map((c) => ({
        "@type": "CollectionPage",
        "@id": `${prefix}/subjects/${c.slug}#collection`,
        name: c.name,
        url: `${prefix}/subjects/${c.slug}`,
      })),
    };
  }

  return {
    isPartOf: rootPartOf,
    about: {
      "@type": "Thing",
      name: subjectName,
    },
    hasPart: undefined,
  };
}
