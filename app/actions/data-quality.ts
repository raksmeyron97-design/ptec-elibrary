"use server";

// Data-quality dashboard (Area 1 of the roadmap, part 2 — license/verified
// badges were part 1, see migration 0062). Surfaces two signals to
// librarians: incomplete metadata, and files that no longer resolve.

import { requirePermission } from "@/lib/auth/requireAdmin";
import { requireAction } from "@/lib/admin/route-guard";
import { scoreEbookQuality } from "@/lib/admin/ebook-quality";
import { scoreMetadataQuality } from "@/lib/admin/thesis-metadata-quality";
import {
  getAdminResourceStats,
  reconcilePublicResourceStats,
  type AdminTypeStats,
  type ResourceStatsReconciliation,
} from "@/lib/admin/resource-stats";
import {
  reconcileCanonicalBackfill,
  type CanonicalBackfillReconciliation,
} from "@/lib/admin/canonical-backfill";
import { revalidateCollectionStats } from "@/lib/cache/revalidate";
import {
  buildSeoHealth,
  type SeoHealthResult,
  type SeoResourceInput,
} from "@/lib/seo/health";
import {
  buildQualityReport,
  tierOf,
  type QualityReport,
  type ScoredRecord,
} from "@/lib/admin/metadata-quality-report";

export type ContentType = "book" | "research";

const BOOK_QUALITY_COLUMNS = `
  id, title, slug, department, published_at, language, description, tags,
  cover_url, license, publisher, authors(name), categories(name),
  departments(name), book_files(file_url)
`;

const THESIS_QUALITY_COLUMNS = `
  id, title, slug, author_names, advisor_name, program, cohort, academic_year,
  published_at, abstract, keywords, references, cover_url, file_url, license
`;

function relatedName(value: unknown): string | null {
  if (Array.isArray(value)) return (value[0] as { name?: string } | undefined)?.name ?? null;
  return (value as { name?: string } | null)?.name ?? null;
}

function scoreBook(row: Record<string, unknown>) {
  const files = (row.book_files as { file_url?: string | null }[] | null) ?? [];
  const result = scoreEbookQuality({
    title: (row.title as string) ?? null,
    author: relatedName(row.authors),
    department: relatedName(row.departments) ?? ((row.department as string) || null),
    category: relatedName(row.categories),
    year: row.published_at ? new Date(row.published_at as string).getFullYear() : null,
    language: (row.language as string) ?? null,
    description: (row.description as string) ?? null,
    tags: Array.isArray(row.tags) ? row.tags as string[] : [],
    coverUrl: (row.cover_url as string) ?? null,
    fileUrl: files.find((file) => file.file_url)?.file_url ?? null,
    license: (row.license as string) ?? null,
    publisher: (row.publisher as string) ?? null,
  });
  return { completeness: result.score, missing: result.missing };
}

function scoreThesis(row: Record<string, unknown>) {
  const result = scoreMetadataQuality({
    title: (row.title as string) ?? null,
    slug: (row.slug as string) ?? null,
    authorNames: (row.author_names as string) ?? null,
    advisorName: (row.advisor_name as string) ?? null,
    program: (row.program as string) ?? null,
    cohort: row.cohort == null ? null : String(row.cohort),
    academicYear: (row.academic_year as string) ?? null,
    publishedAt: (row.published_at as string) ?? null,
    abstract: (row.abstract as string) ?? null,
    keywords: Array.isArray(row.keywords) ? row.keywords as string[] : [],
    references: (row.references as string) ?? null,
    coverUrl: (row.cover_url as string) ?? null,
    fileUrl: (row.file_url as string) ?? null,
    license: (row.license as string) ?? null,
  });
  return { completeness: result.score, missing: result.missing };
}

/**
 * ONE scoring pass over every published book and thesis, feeding all three
 * metadata views: the repair queue, the tier distribution, and the per-field
 * impact ranking.
 *
 * This used to be two independent actions — `getMetadataGaps()` and the
 * metadata half of `getDataQualitySummary()` — which each fetched the full
 * `books` and `research_reports` tables and scored every row, so a page load
 * ran the whole thing twice and then threw one copy away. It also capped the
 * queue at 30 rows with no way to reach the rest; the report returns every
 * gap and the page paginates it.
 */
export async function getMetadataQualityReport(): Promise<{
  report: QualityReport;
  available: boolean;
}> {
  const { supabase } = await requirePermission("books", "read");

  const [booksResult, thesesResult] = await Promise.all([
    supabase.from("books").select(BOOK_QUALITY_COLUMNS).eq("is_published", true).limit(10_000),
    supabase.from("research_reports").select(THESIS_QUALITY_COLUMNS).eq("is_published", true).limit(10_000),
  ]);

  const records: ScoredRecord[] = [];
  for (const book of booksResult.data ?? []) {
    const { completeness, missing } = scoreBook(book);
    records.push({
      id: book.id,
      type: "book",
      title: book.title,
      completeness,
      tier: tierOf(completeness),
      missing,
      editUrl: `/admin/edit/${book.id}`,
    });
  }
  for (const thesis of thesesResult.data ?? []) {
    const { completeness, missing } = scoreThesis(thesis);
    records.push({
      id: thesis.id,
      type: "research",
      title: thesis.title,
      completeness,
      tier: tierOf(completeness),
      missing,
      editUrl: `/admin/theses/edit/${thesis.id}`,
    });
  }

  return {
    report: buildQualityReport(records),
    available: !booksResult.error && !thesesResult.error,
  };
}

export interface FileHealthSummary {
  brokenFileCount: number;
  unknownFileCount: number;
  checkedFileCount: number;
  healthyFileCount: number;
  checkedAt: string | null;
  available: boolean;
}

/**
 * The link-sweep totals. Deliberately no metadata scoring here any more —
 * that lives in `getMetadataQualityReport()`, and having both meant scoring
 * the whole library twice per page load.
 */
export async function getFileHealthSummary(): Promise<FileHealthSummary> {
  const { supabase } = await requirePermission("books", "read");

  const [brokenResult, unknownResult, checkedResult, latestCheckResult] = await Promise.all([
    supabase.from("file_health").select("id", { count: "exact", head: true }).eq("status", "broken"),
    supabase.from("file_health").select("id", { count: "exact", head: true }).eq("status", "unknown"),
    supabase.from("file_health").select("id", { count: "exact", head: true }),
    supabase.from("file_health").select("checked_at").order("checked_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  // A clean sweep has no broken rows, so recency must come from the latest
  // check across every status rather than from the broken subset.
  const available = !checkedResult.error && !latestCheckResult.error;
  const checked = checkedResult.error ? 0 : (checkedResult.count ?? 0);
  const broken = brokenResult.error ? 0 : (brokenResult.count ?? 0);
  const unknown = unknownResult.error ? 0 : (unknownResult.count ?? 0);

  return {
    brokenFileCount: broken,
    unknownFileCount: unknown,
    checkedFileCount: checked,
    healthyFileCount: Math.max(0, checked - broken - unknown),
    checkedAt: available ? (latestCheckResult.data?.checked_at ?? null) : null,
    available,
  };
}

export interface BrokenFile {
  recordType: ContentType;
  recordId: string;
  field: string;
  url: string;
  httpStatus: number | null;
  title: string | null;
  editUrl: string;
  checkedAt: string;
}

/** Broken files from the last check run, joined back to their record's title. */
export async function getBrokenFiles(): Promise<BrokenFile[]> {
  const { supabase } = await requirePermission("books", "read");

  const { data, error } = await supabase
    .from("file_health")
    .select("record_type, record_id, field, url, http_status, checked_at")
    .eq("status", "broken")
    .order("checked_at", { ascending: false });

  if (error) return []; // table not migrated yet, or genuinely empty

  const bookIds: string[] = [];
  const researchIds: string[] = [];
  for (const row of data) {
    if (row.record_type === "book") bookIds.push(row.record_id);
    if (row.record_type === "research") researchIds.push(row.record_id);
  }

  const [{ data: books }, { data: theses }] = await Promise.all([
    bookIds.length ? supabase.from("books").select("id, title").in("id", bookIds) : Promise.resolve({ data: [] }),
    researchIds.length ? supabase.from("research_reports").select("id, title").in("id", researchIds) : Promise.resolve({ data: [] }),
  ]);
  const titleMap = new Map([...(books ?? []), ...(theses ?? [])].map((r) => [r.id, r.title]));

  return data.map((r) => ({
    recordType: r.record_type as ContentType,
    recordId: r.record_id,
    field: r.field,
    url: r.url,
    httpStatus: r.http_status,
    title: titleMap.get(r.record_id) ?? null,
    editUrl: r.record_type === "book" ? `/admin/edit/${r.record_id}` : `/admin/theses/edit/${r.record_id}`,
    checkedAt: r.checked_at,
  }));
}

// ── Resource-count reconciliation ────────────────────────────────────────────
//
// Answers "are the numbers on the public site actually true?" by recomputing
// the canonical figures and diffing them against what the cache is serving
// and against the search index. It recalculates from canonical rows — there
// is no stored counter, and this action can never set one to an arbitrary
// value.
//
// Gated on `books: read`, the same gate as the rest of this file and as
// /admin/data-quality itself: the output is counts and status breakdowns over
// the collection, which is exactly what read means here, and it is never
// exposed on a public route. It used to be `requireLibrarian()` while the
// sidebar offered the page on `books: read` — so a staff account was shown a
// link that answered with a 403 dressed as a crash.

export async function getResourceStatsReconciliation(): Promise<{
  reconciliation: ResourceStatsReconciliation;
  byType: AdminTypeStats[];
}> {
  await requirePermission("books", "read");
  const [reconciliation, byType] = await Promise.all([
    reconcilePublicResourceStats(),
    getAdminResourceStats(),
  ]);
  return { reconciliation, byType };
}

/**
 * "Recalculate and verify". Drops the public stats cache so the next render
 * recounts from the database, then re-runs the comparison and reports what
 * changed. It writes no counts.
 */
export async function recalculateResourceStats(): Promise<{
  reconciliation: ResourceStatsReconciliation;
  byType: AdminTypeStats[];
}> {
  /* The one mutation in this file — it drops a shared cache, which every
     visitor to the public site then pays to refill. Read is not enough. */
  await requireAction("insights.recalculate");
  revalidateCollectionStats();
  return getResourceStatsReconciliation();
}

// Canonical-model backfill reconciliation (migrations 0104–0109). Reports, per
// domain, the legacy source count vs the canonical count the backfill produced
// (see lib/admin/canonical-backfill.ts and docs/CANONICAL-RESOURCES.md). Same
// read gate as the rest of this file. Degrades gracefully to an empty
// result before the migrations are applied (the view does not exist yet), which
// the panel renders as an "apply migration" hint rather than an error.
export async function getCanonicalBackfillReconciliation(): Promise<CanonicalBackfillReconciliation> {
  await requirePermission("books", "read");
  return reconcileCanonicalBackfill();
}

// ── SEO health (§25) ─────────────────────────────────────────────────────────
// SEO-specific checks over PUBLISHED, publicly-indexable resources: non-unique
// titles, missing social image (OG falls back to the site logo), and — for
// theses & publications — the metadata that Google Scholar's citation_* tags
// require (author, publication date, visible abstract). Complements the
// metadata-gaps section above, which scores general bibliographic completeness.

/** Cap the returned list; counts stay exact so the header is honest. */
const SEO_HEALTH_DISPLAY_CAP = 60;

function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** A four-digit year hides inside academic_year strings like "2023–2024". */
function hasYear(value: unknown): boolean {
  return typeof value === "string" && /\b(19|20)\d{2}\b/.test(value);
}

export async function getSeoHealth(): Promise<SeoHealthResult> {
  const { supabase } = await requirePermission("books", "read");

  const [
    { data: books },
    { data: theses },
    { data: publications },
    { data: paths },
    { data: catalog },
    { data: posts },
  ] = await Promise.all([
    supabase.from("books").select("id, title, cover_url, og_image").eq("is_published", true).limit(10_000),
    supabase
      .from("research_reports")
      .select("id, title, cover_url, og_image, abstract, author_names, published_at, academic_year")
      .eq("is_published", true)
      .limit(10_000),
    supabase
      .from("publications_with_stats")
      .select("id, title, cover_url, og_image, abstract, author_names, publication_date, published_at")
      .eq("is_published", true)
      .limit(10_000),
    supabase.from("learning_paths").select("id, title, cover_url, og_image_url").eq("is_published", true).limit(10_000),
    supabase.from("catalog_books").select("id, title, cover_url, og_image").eq("is_active", true).limit(10_000),
    supabase
      .from("posts")
      .select("id, title, cover_url, og_image")
      .eq("is_published", true)
      .eq("visibility", "public")
      .limit(10_000),
  ]);

  const resources: SeoResourceInput[] = [];

  for (const b of books ?? [])
    resources.push({
      type: "book",
      id: b.id,
      title: b.title,
      editUrl: `/admin/edit/${b.id}`,
      hasSocialImage: nonEmpty(b.og_image) || nonEmpty(b.cover_url),
    });

  for (const r of theses ?? [])
    resources.push({
      type: "research",
      id: r.id,
      title: r.title,
      editUrl: `/admin/theses/edit/${r.id}`,
      hasSocialImage: nonEmpty(r.og_image) || nonEmpty(r.cover_url),
      scholarly: true,
      hasAuthor: nonEmpty(r.author_names),
      hasDate: nonEmpty(r.published_at) || hasYear(r.academic_year),
      hasAbstract: nonEmpty(r.abstract),
    });

  for (const p of publications ?? [])
    resources.push({
      type: "publication",
      id: p.id,
      title: p.title,
      editUrl: `/admin/publications/edit/${p.id}`,
      hasSocialImage: nonEmpty(p.og_image) || nonEmpty(p.cover_url),
      scholarly: true,
      hasAuthor: nonEmpty(p.author_names),
      hasDate: nonEmpty(p.publication_date) || nonEmpty(p.published_at),
      hasAbstract: nonEmpty(p.abstract),
    });

  for (const p of paths ?? [])
    resources.push({
      type: "learning_path",
      id: p.id,
      title: p.title,
      editUrl: `/admin/paths/edit/${p.id}`,
      // Learning paths carry og_image_url (migration 0111), not og_image.
      hasSocialImage: nonEmpty(p.og_image_url) || nonEmpty(p.cover_url),
    });

  for (const c of catalog ?? [])
    resources.push({
      type: "catalog",
      id: c.id,
      title: c.title,
      editUrl: `/admin/catalogs/edit/${c.id}`,
      hasSocialImage: nonEmpty(c.og_image) || nonEmpty(c.cover_url),
    });

  for (const p of posts ?? [])
    resources.push({
      type: "post",
      id: p.id,
      title: p.title,
      editUrl: `/admin/posts/edit/${p.id}`,
      hasSocialImage: nonEmpty(p.og_image) || nonEmpty(p.cover_url),
    });

  const result = buildSeoHealth(resources);
  return { ...result, findings: result.findings.slice(0, SEO_HEALTH_DISPLAY_CAP) };
}
