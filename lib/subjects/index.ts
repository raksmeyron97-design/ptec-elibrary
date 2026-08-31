// lib/subjects/index.ts
//
// THE data source for the subject taxonomy: the /subjects hub, every
// /subjects/[slug] landing page, and the sitemap's subject entries all read
// from here.
//
// ── Why one module ───────────────────────────────────────────────────────────
//
// Before V2 the subject page ran its own four-query bundle twice per request
// (generateMetadata called it, then the body called it again — no dedup), and
// the sitemap emitted a URL for every row in `categories` without ever asking
// whether the page would have anything on it. The result was live: ten subject
// URLs returning 200 with "No public resources are attached to this subject
// yet", all ten submitted in sitemap.xml. See docs/SEO-V2-AUDIT.md F-1.
//
// So: counts and content come from the same place, `emptySubjects` are knowable
// before a URL is advertised, and generateMetadata + the page body share one
// React-cached call.
//
// ── Accuracy ─────────────────────────────────────────────────────────────────
//
// `public.categories` has four columns — id, name, slug, created_at. There is
// no description and no Khmer name. This module therefore returns FACTS
// (names, slugs, counts, matched resources) and never a generated blurb about
// what a subject "covers"; the landing page composes its localized sentence
// from the counts. Inventing subject descriptions would be fabricated metadata.

import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { sanitizeFilterTerm } from "@/lib/postgrest-filter";
import { TAGS } from "@/lib/cache/revalidate";
import {
  catalogMatchesSubject,
  publicationMatchesSubject,
  subjectKey,
  thesisMatchesSubject,
} from "@/lib/subjects/matching";

// The type vocabulary and the count→phrase mapping live in the pure sibling
// module so the hub and the detail page share one copy. Re-exported here so
// callers keep importing everything subject-related from "@/lib/subjects".
export {
  SUBJECT_RESOURCE_TYPES,
  subjectBreakdown,
  subjectTypeKey,
  type SubjectCounts,
  type SubjectResourceType,
} from "@/lib/subjects/labels";

import type { SubjectCounts, SubjectResourceType } from "@/lib/subjects/labels";

export type SubjectSummary = {
  id: string;
  name: string;
  slug: string;
  counts: SubjectCounts;
};

export type SubjectItem = {
  type: SubjectResourceType;
  title: string;
  href: string;
  author: string | null;
  excerpt: string | null;
};

export type SubjectDetail = {
  id: string;
  name: string;
  slug: string;
  counts: SubjectCounts;
  /** Matched resources, grouped by type and capped per type. */
  items: SubjectItem[];
  /** Subjects that genuinely co-occur with this one on a publication. May be
   *  empty — the landing page then offers a plain "more subjects" list under a
   *  different heading rather than dressing a fallback up as a relationship. */
  related: SubjectSummary[];
};

const EMPTY_COUNTS: SubjectCounts = { book: 0, thesis: 0, publication: 0, catalog: 0, total: 0 };

/** Per-type cap on a subject landing page. Deep collections continue in the
 *  type's own listing, which is linked beneath each group. */
const ITEMS_PER_TYPE = 12;

/** Cap on the "related subjects" rail — enough to build a topic cluster,
 *  few enough that the links stay meaningful (brief §18: avoid link spam). */
const RELATED_LIMIT = 8;

// ── Subject index (all subjects + their public resource counts) ──────────────

type CategoryRow = { id: string; name: string; slug: string; created_at: string | null };

/**
 * Every subject with an exact count of the public resources attached to it.
 *
 * ONE query per resource table, matched in memory — not one query per subject
 * per table, which for the hub page would be 4 × N round trips. The tables are
 * read with narrow projections (the association columns only), so this stays
 * proportional to the published collection rather than to the page.
 */
async function loadSubjectIndex(): Promise<SubjectSummary[]> {
  const supabase = createServiceClient();

  const [categories, books, theses, publications, catalog] = await Promise.all([
    supabase.from("categories").select("id, name, slug, created_at").order("name"),
    supabase.from("books").select("category_id").eq("is_published", true),
    supabase.from("research_reports").select("subject, program, faculty").eq("is_published", true),
    supabase.from("publications").select("subjects").eq("is_published", true),
    supabase.from("catalog_books").select("category").eq("is_active", true),
  ]);

  const rows = (categories.data ?? []) as CategoryRow[];
  if (rows.length === 0) return [];

  const bookCountByCategoryId = new Map<string, number>();
  for (const b of (books.data ?? []) as { category_id: string | null }[]) {
    if (!b.category_id) continue;
    bookCountByCategoryId.set(b.category_id, (bookCountByCategoryId.get(b.category_id) ?? 0) + 1);
  }

  const thesisRows = (theses.data ?? []) as {
    subject: string | null;
    program: string | null;
    faculty: string | null;
  }[];
  const publicationRows = (publications.data ?? []) as { subjects: string[] | null }[];
  const catalogRows = (catalog.data ?? []) as { category: string | null }[];

  return rows
    .filter((c) => c.slug && c.name)
    .map((c) => {
      const counts: SubjectCounts = {
        book: bookCountByCategoryId.get(c.id) ?? 0,
        thesis: thesisRows.filter((t) => thesisMatchesSubject(t, c.name)).length,
        publication: publicationRows.filter((p) =>
          publicationMatchesSubject(p.subjects, c.name),
        ).length,
        catalog: catalogRows.filter((r) => catalogMatchesSubject(r.category, c.name)).length,
        total: 0,
      };
      counts.total = counts.book + counts.thesis + counts.publication + counts.catalog;
      return { id: c.id, name: c.name, slug: c.slug, counts };
    });
}

/**
 * Cached subject index. Tagged with every table it reads, so publishing a book
 * or a thesis moves the hub's counts — and, through
 * {@link getIndexableSubjects}, the sitemap — without a redeploy.
 */
const cachedSubjectIndex = unstable_cache(loadSubjectIndex, ["subject-index-v1"], {
  revalidate: 3600,
  tags: [
    TAGS.categories,
    TAGS.books,
    TAGS.theses,
    TAGS.publications,
    TAGS.catalogBooks,
  ],
});

/** All subjects, including empty ones (the admin taxonomy view wants those). */
export const getSubjectIndex = cache(async (): Promise<SubjectSummary[]> => {
  try {
    return await cachedSubjectIndex();
  } catch {
    // A taxonomy read failure must degrade to "no subject hub", never to a
    // hub claiming the library has no resources.
    return [];
  }
});

/**
 * Subjects that have at least one public resource — the only ones that may be
 * advertised in the sitemap or linked as a destination.
 *
 * An empty subject page is a soft-404: HTTP 200 with nothing on it. Ten of
 * them were live and in sitemap.xml before V2 (audit F-1).
 */
export async function getIndexableSubjects(): Promise<SubjectSummary[]> {
  return (await getSubjectIndex()).filter((s) => s.counts.total > 0);
}

// ── Subject detail ───────────────────────────────────────────────────────────

function clean(value: string | null | undefined): string | null {
  const v = value?.replace(/\s+/g, " ").trim();
  return v ? v : null;
}

/**
 * One subject with the resources attached to it, its counts, and the subjects
 * it genuinely co-occurs with.
 *
 * React-cached: generateMetadata and the page body call this for the same slug
 * in one request and must not issue the queries twice.
 */
export const getSubjectDetail = cache(async (slug: string): Promise<SubjectDetail | null> => {
  const supabase = createServiceClient();

  const { data: category } = await supabase
    .from("categories")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (!category) return null;

  const name = category.name as string;
  // PostgREST parses `.or()` as a comma-separated mini-language: a subject
  // named "Maths, Science" would silently re-partition the filter rather than
  // error. Names are admin-entered, so this is a correctness guard, not a
  // user-input one — but the failure mode is identical.
  const filterName = sanitizeFilterTerm(name);

  const [{ data: books }, { data: theses }, { data: publications }, { data: catalog }] =
    await Promise.all([
      supabase
        .from("books")
        .select("id, slug, title, description, authors(name)")
        .eq("is_published", true)
        .eq("category_id", category.id)
        .order("download_count", { ascending: false })
        .limit(ITEMS_PER_TYPE),
      supabase
        .from("research_reports")
        .select("id, slug, title, abstract, author_names")
        .eq("is_published", true)
        .or(
          `subject.ilike.%${filterName}%,program.ilike.%${filterName}%,faculty.ilike.%${filterName}%`,
        )
        .order("view_count", { ascending: false })
        .limit(ITEMS_PER_TYPE),
      supabase
        .from("publications_with_stats")
        .select("id, slug, title, abstract, author_names")
        .eq("is_published", true)
        .contains("subjects", [name])
        .order("view_count", { ascending: false })
        .limit(ITEMS_PER_TYPE),
      supabase
        .from("catalog_books")
        .select("id, slug, title, description, author")
        .eq("is_active", true)
        .ilike("category", `%${filterName}%`)
        .order("title", { ascending: true })
        .limit(ITEMS_PER_TYPE),
    ]);

  type Row = Record<string, any>;
  const items: SubjectItem[] = [
    ...((books ?? []) as Row[]).map((r) => ({
      type: "book" as const,
      title: r.title,
      href: `/books/${r.slug}`,
      author: clean(r.authors?.name),
      excerpt: clean(r.description),
    })),
    ...((theses ?? []) as Row[]).map((r) => ({
      type: "thesis" as const,
      title: r.title,
      href: `/theses/${r.slug ?? r.id}`,
      author: clean(r.author_names),
      excerpt: clean(r.abstract),
    })),
    ...((publications ?? []) as Row[]).map((r) => ({
      type: "publication" as const,
      title: r.title,
      href: `/publications/${r.slug}`,
      author: clean(r.author_names),
      excerpt: clean(r.abstract),
    })),
    ...((catalog ?? []) as Row[]).map((r) => ({
      type: "catalog" as const,
      title: r.title,
      href: `/catalogs/${r.slug ?? r.id}`,
      author: clean(r.author),
      excerpt: clean(r.description),
    })),
  ].filter((i) => Boolean(i.title));

  const index = await getSubjectIndex();
  const self = index.find((s) => s.slug === category.slug);
  const counts = self?.counts ?? EMPTY_COUNTS;

  return {
    id: category.id,
    name,
    slug: category.slug,
    counts,
    items,
    related: await relatedSubjects(name, index),
  };
});

/**
 * Subjects that appear alongside `name` on the same publication.
 *
 * `publications.subjects` is the only real co-occurrence signal the schema
 * carries: a librarian tagged one work with several subjects, which is an
 * assertion that those topics belong together. Everything else available here
 * (shared department, similar title) would be an inference, and an inferred
 * "related subject" rendered as a link is a claim the data does not support.
 *
 * Returns [] when there is no such evidence — deliberately. The caller shows a
 * differently-headed "browse other subjects" list in that case.
 */
async function relatedSubjects(
  name: string,
  index: SubjectSummary[],
): Promise<SubjectSummary[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("publications")
    .select("subjects")
    .eq("is_published", true)
    .contains("subjects", [name]);

  const key = subjectKey(name);
  const cooccurrence = new Map<string, number>();
  for (const row of (data ?? []) as { subjects: string[] | null }[]) {
    for (const s of row.subjects ?? []) {
      const k = subjectKey(s);
      if (!k || k === key) continue;
      cooccurrence.set(k, (cooccurrence.get(k) ?? 0) + 1);
    }
  }
  if (cooccurrence.size === 0) return [];

  return index
    .filter((s) => s.counts.total > 0 && cooccurrence.has(subjectKey(s.name)))
    .sort(
      (a, b) =>
        (cooccurrence.get(subjectKey(b.name)) ?? 0) -
          (cooccurrence.get(subjectKey(a.name)) ?? 0) || b.counts.total - a.counts.total,
    )
    .slice(0, RELATED_LIMIT);
}

/** Non-empty subjects other than `slug`, largest first — the honest fallback
 *  when {@link relatedSubjects} has no evidence to offer. */
export async function otherSubjects(slug: string, limit = RELATED_LIMIT): Promise<SubjectSummary[]> {
  return (await getIndexableSubjects())
    .filter((s) => s.slug !== slug)
    .sort((a, b) => b.counts.total - a.counts.total)
    .slice(0, limit);
}
