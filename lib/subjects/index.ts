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
import { isBrowsableSubject, isIndexableSubject } from "@/lib/subjects/indexability";

// The type vocabulary and the count→phrase mapping live in the pure sibling
// module so the hub and the detail page share one copy. Re-exported here so
// callers keep importing everything subject-related from "@/lib/subjects".
export {
  SUBJECT_MIN_FULL_TEXT,
  SUBJECT_MIN_RESOURCES,
  subjectVisibility,
  type SubjectVisibility,
} from "@/lib/subjects/indexability";

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
  /** How many of this subject's resources have extracted full text — SEO 3.3
   *  §5.2. `null` means the index-state read FAILED, which is not the same
   *  answer as zero and must never demote a subject on its own; see
   *  {@link subjectVisibility}. */
  fullText: number | null;
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
  fullText: number | null;
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

/** The `resource_index_state.record_type` values whose rows correspond to a
 *  resource this taxonomy counts. `research` is the thesis table's name there
 *  (the DB still calls theses research_reports — see CLAUDE.md § Naming). */
const INDEXABLE_RECORD_TYPES = new Set(["book", "research", "publication"]);

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

  const [categories, books, theses, publications, catalog, indexState] = await Promise.all([
    supabase.from("categories").select("id, name, slug, created_at").order("name"),
    supabase.from("books").select("id, category_id").eq("is_published", true),
    supabase
      .from("research_reports")
      .select("id, subject, program, faculty")
      .eq("is_published", true),
    supabase.from("publications").select("id, subjects").eq("is_published", true),
    supabase.from("catalog_books").select("category").eq("is_active", true),
    // SEO 3.3 §5.2. `status = 'indexed'` is the only status that means text was
    // extracted and stored — `no_text_layer` is a scan, `unfetchable` and
    // `failed` produced nothing (lib/indexing/state.ts). The `pages` floor is
    // belt-and-braces: a row claiming `indexed` with zero pages is not evidence
    // a reader could search inside.
    supabase
      .from("resource_index_state")
      .select("record_id, record_type")
      .eq("status", "indexed")
      .gt("pages", 0),
  ]);

  const rows = (categories.data ?? []) as CategoryRow[];
  if (rows.length === 0) return [];

  // A FAILED index-state read is `null`, never an empty set. Counting it as
  // zero would push all 25 subjects below §5.2 at once and de-index the whole
  // taxonomy on one flaky query; `subjectVisibility` is built to refuse that.
  const fullTextIds: Set<string> | null = indexState.error
    ? null
    : new Set(
        ((indexState.data ?? []) as { record_id: string; record_type: string }[])
          .filter((r) => INDEXABLE_RECORD_TYPES.has(r.record_type))
          .map((r) => r.record_id),
      );

  const bookIdsByCategoryId = new Map<string, string[]>();
  for (const b of (books.data ?? []) as { id: string; category_id: string | null }[]) {
    if (!b.category_id) continue;
    const list = bookIdsByCategoryId.get(b.category_id);
    if (list) list.push(b.id);
    else bookIdsByCategoryId.set(b.category_id, [b.id]);
  }

  const thesisRows = (theses.data ?? []) as {
    id: string;
    subject: string | null;
    program: string | null;
    faculty: string | null;
  }[];
  const publicationRows = (publications.data ?? []) as { id: string; subjects: string[] | null }[];
  const catalogRows = (catalog.data ?? []) as { category: string | null }[];

  return rows
    .filter((c) => c.slug && c.name)
    .map((c) => {
      const bookIds = bookIdsByCategoryId.get(c.id) ?? [];
      const thesisIds = thesisRows
        .filter((t) => thesisMatchesSubject(t, c.name))
        .map((t) => t.id);
      const publicationIds = publicationRows
        .filter((p) => publicationMatchesSubject(p.subjects, c.name))
        .map((p) => p.id);

      const counts: SubjectCounts = {
        book: bookIds.length,
        thesis: thesisIds.length,
        publication: publicationIds.length,
        catalog: catalogRows.filter((r) => catalogMatchesSubject(r.category, c.name)).length,
        total: 0,
      };
      counts.total = counts.book + counts.thesis + counts.publication + counts.catalog;

      // Catalog records are physical copies and are deliberately absent here:
      // they count toward §5.1 (a reader can borrow one) and can never satisfy
      // §5.2, because there is no file to extract.
      const fullText =
        fullTextIds === null
          ? null
          : [...bookIds, ...thesisIds, ...publicationIds].filter((id) => fullTextIds.has(id))
              .length;

      return { id: c.id, name: c.name, slug: c.slug, counts, fullText };
    });
}

/**
 * Cached subject index. Tagged with every table it reads, so publishing a book
 * or a thesis moves the hub's counts — and, through
 * {@link getIndexableSubjects}, the sitemap — without a redeploy.
 *
 * `resource_index_state` has no tag: nothing publishes to it, a background job
 * fills it, and the hourly revalidate is the right granularity for "this book
 * became searchable". The key is v2 because the cached SHAPE gained `fullText`
 * — a v1 entry would carry `undefined` there and read as "criterion 2 not
 * evaluated" for as long as it lived.
 */
const cachedSubjectIndex = unstable_cache(loadSubjectIndex, ["subject-index-v2"], {
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
 * Subjects deep enough to be INDEXED and submitted in the sitemap — the SEO
 * 3.3 §5 gate (≥ 5 resources and ≥ 3 of them with extracted full text).
 *
 * This is the sitemap's list and nothing else's. The page's own `robots` meta
 * must be decided by the same {@link subjectVisibility} call, or the sitemap
 * advertises a URL that answers `noindex` — the contradiction V2 fixed for
 * EMPTY subjects (docs/SEO-V2-AUDIT.md F-1) and 3.3 fixes for THIN ones: a
 * one-book hub was `index, follow` and in sitemap.xml on the day this shipped.
 */
export async function getIndexableSubjects(): Promise<SubjectSummary[]> {
  return (await getSubjectIndex()).filter((s) => isIndexableSubject(s.counts, s.fullText));
}

/**
 * Subjects that may be LINKED as a destination — the hub's list, the related
 * rail, the ItemList describing either.
 *
 * Wider than {@link getIndexableSubjects} on purpose. A thin subject is a real
 * place with real resources: withdrawing it from the index says "this page is
 * not a search result", not "this page should be unreachable". Only a subject
 * with nothing to stand on (0 or 1 resource) drops out.
 */
export async function getBrowsableSubjects(): Promise<SubjectSummary[]> {
  return (await getSubjectIndex()).filter((s) => isBrowsableSubject(s.counts, s.fullText));
}

/**
 * Subjects holding at least one public resource — what a reader can be TOLD
 * about, which is a different question from what a crawler may index.
 *
 * The AI assistant answers from this one: a suppressed hub still holds a book,
 * and refusing to name its subject because the page is not worth ranking would
 * let an SEO policy decide a retrieval answer.
 */
export async function getSubjectsWithResources(): Promise<SubjectSummary[]> {
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
    // undefined only when the index read failed entirely; `null` then keeps
    // §5.2 unevaluated rather than asserting this subject has no full text.
    fullText: self ? self.fullText : null,
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
    .filter(
      (s) => isBrowsableSubject(s.counts, s.fullText) && cooccurrence.has(subjectKey(s.name)),
    )
    .sort(
      (a, b) =>
        (cooccurrence.get(subjectKey(b.name)) ?? 0) -
          (cooccurrence.get(subjectKey(a.name)) ?? 0) || b.counts.total - a.counts.total,
    )
    .slice(0, RELATED_LIMIT);
}

/** Linkable subjects other than `slug`, largest first — the honest fallback
 *  when {@link relatedSubjects} has no evidence to offer. Browsable rather than
 *  indexable: this rail is navigation for a reader, not an index nomination. */
export async function otherSubjects(slug: string, limit = RELATED_LIMIT): Promise<SubjectSummary[]> {
  return (await getBrowsableSubjects())
    .filter((s) => s.slug !== slug)
    .sort((a, b) => b.counts.total - a.counts.total)
    .slice(0, limit);
}
