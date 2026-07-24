"use server";

// Data-quality dashboard (Area 1 of the roadmap, part 2 — license/verified
// badges were part 1, see migration 0062). Surfaces two signals to
// librarians: incomplete metadata, and files that no longer resolve.

import { requireLibrarian } from "@/lib/auth/requireAdmin";
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

export type ContentType = "book" | "research";

export interface MetadataGap {
  id: string;
  type: ContentType;
  title: string;
  completeness: number;
  missingFields: string[];
  editUrl: string;
}

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
  return { completeness: result.score, missingFields: result.missing.map((field) => field.label) };
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
  return { completeness: result.score, missingFields: result.missing.map((field) => field.label) };
}

/** Worst-first metadata completeness across books + theses. */
export async function getMetadataGaps(limit = 30): Promise<MetadataGap[]> {
  const { supabase } = await requireLibrarian();

  const [{ data: books }, { data: theses }] = await Promise.all([
    supabase
      .from("books")
      .select(BOOK_QUALITY_COLUMNS)
      .eq("is_published", true)
      .limit(10_000),
    supabase
      .from("research_reports")
      .select(THESIS_QUALITY_COLUMNS)
      .eq("is_published", true)
      .limit(10_000),
  ]);

  const gaps: MetadataGap[] = [];

  for (const b of books ?? []) {
    const { completeness, missingFields } = scoreBook(b);
    if (missingFields.length > 0) {
      gaps.push({ id: b.id, type: "book", title: b.title, completeness, missingFields, editUrl: `/admin/edit/${b.id}` });
    }
  }
  for (const r of theses ?? []) {
    const { completeness, missingFields } = scoreThesis(r);
    if (missingFields.length > 0) {
      gaps.push({ id: r.id, type: "research", title: r.title, completeness, missingFields, editUrl: `/admin/theses/edit/${r.id}` });
    }
  }

  return gaps.sort((a, b) => a.completeness - b.completeness).slice(0, limit);
}

export interface DataQualitySummary {
  totalBooks: number;
  totalTheses: number;
  avgBookCompleteness: number;
  avgThesisCompleteness: number;
  brokenFileCount: number;
  unknownFileCount: number;
  checkedFileCount: number;
  metadataIssueCount: number;
  fileHealthCheckedAt: string | null;
  fileHealthAvailable: boolean;
  metadataAvailable: boolean;
}

export async function getDataQualitySummary(): Promise<DataQualitySummary> {
  const { supabase } = await requireLibrarian();

  const [booksResult, thesesResult, brokenResult, unknownResult, checkedResult, latestCheckResult] = await Promise.all([
    supabase.from("books").select(BOOK_QUALITY_COLUMNS).eq("is_published", true).limit(10_000),
    supabase.from("research_reports").select(THESIS_QUALITY_COLUMNS).eq("is_published", true).limit(10_000),
    supabase.from("file_health").select("id", { count: "exact", head: true }).eq("status", "broken"),
    supabase.from("file_health").select("id", { count: "exact", head: true }).eq("status", "unknown"),
    supabase.from("file_health").select("id", { count: "exact", head: true }),
    supabase.from("file_health").select("checked_at").order("checked_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const books = booksResult.data;
  const theses = thesesResult.data;

  const bookScores = (books ?? []).map((book) => scoreBook(book).completeness);
  const thesisScores = (theses ?? []).map((thesis) => scoreThesis(thesis).completeness);
  const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((s, n) => s + n, 0) / arr.length) : 100);

  // A clean sweep has no broken rows, so recency must come from the latest
  // check across every status rather than from the broken subset.
  const fileHealthAvailable = !checkedResult.error && !latestCheckResult.error;
  const metadataIssueCount = bookScores.filter((score) => score < 100).length
    + thesisScores.filter((score) => score < 100).length;

  return {
    totalBooks: books?.length ?? 0,
    totalTheses: theses?.length ?? 0,
    avgBookCompleteness: avg(bookScores),
    avgThesisCompleteness: avg(thesisScores),
    brokenFileCount: brokenResult.error ? 0 : (brokenResult.count ?? 0),
    unknownFileCount: unknownResult.error ? 0 : (unknownResult.count ?? 0),
    checkedFileCount: checkedResult.error ? 0 : (checkedResult.count ?? 0),
    metadataIssueCount,
    fileHealthCheckedAt: fileHealthAvailable ? (latestCheckResult.data?.checked_at ?? null) : null,
    fileHealthAvailable,
    metadataAvailable: !booksResult.error && !thesesResult.error,
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
  const { supabase } = await requireLibrarian();

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
// Gated by requireLibrarian(), the same gate as the rest of this file: the
// output is counts and status breakdowns, which is librarian-level
// information, and it is never exposed on a public route.

export async function getResourceStatsReconciliation(): Promise<{
  reconciliation: ResourceStatsReconciliation;
  byType: AdminTypeStats[];
}> {
  await requireLibrarian();
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
  await requireLibrarian();
  revalidateCollectionStats();
  return getResourceStatsReconciliation();
}

// Canonical-model backfill reconciliation (migrations 0104–0109). Reports, per
// domain, the legacy source count vs the canonical count the backfill produced
// (see lib/admin/canonical-backfill.ts and docs/CANONICAL-RESOURCES.md). Same
// librarian gate as the rest of this file. Degrades gracefully to an empty
// result before the migrations are applied (the view does not exist yet), which
// the panel renders as an "apply migration" hint rather than an error.
export async function getCanonicalBackfillReconciliation(): Promise<CanonicalBackfillReconciliation> {
  await requireLibrarian();
  return reconcileCanonicalBackfill();
}
