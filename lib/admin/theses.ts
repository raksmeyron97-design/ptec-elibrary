import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { scoreMetadataQuality } from "@/lib/admin/thesis-metadata-quality";
import {
  normalizeStatus,
  type ThesisListRow,
  type ThesesQueryParams,
  type ThesesSummary,
  type ThesisProgramOption,
  type ThesisTextOption,
} from "@/lib/admin/theses-shared";

/**
 * Server-only data-access helpers for the admin Theses CMS. Constants,
 * types, and pure helpers live in lib/admin/theses-shared.ts, which client
 * components import directly — this module re-exports all of it.
 */
export * from "@/lib/admin/theses-shared";

type ServiceClient = ReturnType<typeof createServiceClient>;

const LIST_COLUMNS = `
  id, title, slug, author_names, advisor_name, program, cohort, academic_year,
  status, cover_url, file_url, doi, view_count, download_count,
  created_at, updated_at, published_at, scheduled_at,
  abstract, keywords, references, license
`;

// Strip PostgREST .or()/.ilike() metacharacters before building filter
// strings from user input (same rule as sanitizeSearchTerm in app/api/chat).
function sanitizeSearchTerm(input: string): string {
  return input.replace(/[%,()\\*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

function toRow(r: Record<string, unknown>): ThesisListRow {
  return {
    id: r.id as string,
    title: r.title as string,
    slug: (r.slug as string) ?? null,
    authorNames: (r.author_names as string) ?? null,
    advisorName: (r.advisor_name as string) ?? null,
    program: (r.program as string) ?? null,
    cohort: r.cohort != null ? String(r.cohort) : null,
    academicYear: (r.academic_year as string) ?? null,
    status: normalizeStatus(r.status as string),
    coverUrl: (r.cover_url as string) ?? null,
    fileUrl: (r.file_url as string) ?? null,
    doi: (r.doi as string) ?? null,
    viewCount: (r.view_count as number) ?? 0,
    downloadCount: (r.download_count as number) ?? 0,
    createdAt: r.created_at as string,
    updatedAt: (r.updated_at as string) ?? null,
    publishedAt: (r.published_at as string) ?? null,
    scheduledAt: (r.scheduled_at as string) ?? null,
    abstract: (r.abstract as string) ?? null,
    keywords: Array.isArray(r.keywords) ? (r.keywords as string[]) : [],
    references: (r.references as string) ?? null,
    license: (r.license as string) ?? null,
  };
}

/**
 * Applies every filter except metadataQuality (which needs a JS pass — see
 * getTheses). Returns `{ query }` rather than the bare builder: Supabase
 * query builders are themselves "thenable" (they implement `.then()`), so
 * `return query` from an async function gets flattened by the await/Promise
 * machinery — it actually executes the request and resolves to the result
 * object instead of the builder. Wrapping in a plain object prevents that.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function applyFilters(supabase: ServiceClient, base: any, params: ThesesQueryParams): Promise<{ query: any }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = base;

  if (params.status && params.status !== "all") {
    query = query.eq("status", normalizeStatus(params.status));
  }
  if (params.program && params.program !== "all") {
    query = query.eq("program", params.program);
  }
  if (params.cohort && params.cohort !== "all") {
    query = query.eq("cohort", params.cohort);
  }
  if (params.academicYear && params.academicYear !== "all") {
    query = query.eq("academic_year", params.academicYear);
  }
  if (params.fileStatus === "has_pdf") query = query.not("file_url", "is", null);
  if (params.fileStatus === "missing_pdf") query = query.is("file_url", null);
  if (params.fileStatus === "has_cover") query = query.not("cover_url", "is", null);
  if (params.fileStatus === "missing_cover") query = query.is("cover_url", null);

  const term = sanitizeSearchTerm(params.q ?? "");
  if (term) {
    const [{ data: kwMatches }, { data: progMatches }] = await Promise.all([
      supabase.from("research_reports").select("id").filter("keywords::text", "ilike", `%${term}%`),
      supabase.from("research_programs").select("code").or(`name_en.ilike.%${term}%,name_km.ilike.%${term}%`),
    ]);

    const orParts = [
      `title.ilike.%${term}%`,
      `author_names.ilike.%${term}%`,
      `advisor_name.ilike.%${term}%`,
      `doi.ilike.%${term}%`,
    ];
    const kwIds = (kwMatches ?? []).map((r: { id: string }) => r.id);
    if (kwIds.length) orParts.push(`id.in.(${kwIds.join(",")})`);
    const progCodes = (progMatches ?? []).map((p: { code: string }) => p.code);
    if (progCodes.length) orParts.push(`program.in.(${progCodes.join(",")})`);

    query = query.or(orParts.join(","));
  }

  return { query };
}

function applySqlSort(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  sort: string | undefined,
) {
  switch (sort) {
    case "oldest":
      return query.order("created_at", { ascending: true });
    case "most-viewed":
      return query.order("view_count", { ascending: false });
    case "most-downloaded":
      return query.order("download_count", { ascending: false });
    case "title-asc":
      return query.order("title", { ascending: true });
    case "title-desc":
      return query.order("title", { ascending: false });
    case "updated":
      return query.order("updated_at", { ascending: false });
    default:
      return query.order("created_at", { ascending: false });
  }
}

function sortRowsInPlace(rows: ThesisListRow[], sort: string | undefined) {
  switch (sort) {
    case "oldest":
      rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      break;
    case "most-viewed":
      rows.sort((a, b) => b.viewCount - a.viewCount);
      break;
    case "most-downloaded":
      rows.sort((a, b) => b.downloadCount - a.downloadCount);
      break;
    case "title-asc":
      rows.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "title-desc":
      rows.sort((a, b) => b.title.localeCompare(a.title));
      break;
    case "updated":
      rows.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
      break;
    case "metadata-quality":
      rows.sort((a, b) => qualityOf(b).score - qualityOf(a).score);
      break;
    default:
      rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

function qualityOf(row: ThesisListRow) {
  return scoreMetadataQuality({
    title: row.title,
    slug: row.slug,
    authorNames: row.authorNames,
    advisorName: row.advisorName,
    program: row.program,
    cohort: row.cohort,
    academicYear: row.academicYear,
    publishedAt: row.publishedAt,
    abstract: row.abstract,
    keywords: row.keywords,
    references: row.references,
    coverUrl: row.coverUrl,
    fileUrl: row.fileUrl,
    license: row.license,
  });
}

// Caps the "fetch everything, score in JS" path used for metadata-quality
// filtering/sorting. The PTEC repository is small (tens to low hundreds of
// theses) — this is far cheaper than maintaining a stored, driftable score.
const QUALITY_SCAN_CAP = 2000;

export async function getTheses(
  params: ThesesQueryParams,
): Promise<{ rows: ThesisListRow[]; total: number; error: boolean }> {
  const supabase = createServiceClient();
  const needsJsPass = Boolean(params.metadataQuality && params.metadataQuality !== "all") || params.sort === "metadata-quality";

  if (!needsJsPass) {
    const from = (params.page - 1) * params.pageSize;
    const to = from + params.pageSize - 1;
    let query = supabase.from("research_reports").select(LIST_COLUMNS, { count: "exact" });
    ({ query } = await applyFilters(supabase, query, params));
    query = applySqlSort(query, params.sort);
    query = query.range(from, to);

    const { data, count, error } = await query;
    if (error) {
      console.error("[getTheses] query failed:", error.message);
      return { rows: [], total: 0, error: true };
    }
    return { rows: (data ?? []).map(toRow), total: count ?? 0, error: false };
  }

  // Metadata-quality path: filter/sort in JS, then paginate.
  let scanQuery = supabase.from("research_reports").select(LIST_COLUMNS).limit(QUALITY_SCAN_CAP);
  ({ query: scanQuery } = await applyFilters(supabase, scanQuery, params));
  const { data, error } = await scanQuery;
  if (error) {
    console.error("[getTheses] quality-scan query failed:", error.message);
    return { rows: [], total: 0, error: true };
  }

  let rows = (data ?? []).map(toRow);
  if (params.metadataQuality && params.metadataQuality !== "all") {
    rows = rows.filter((r) => qualityOf(r).tier === params.metadataQuality);
  }
  sortRowsInPlace(rows, params.sort);

  const total = rows.length;
  const from = (params.page - 1) * params.pageSize;
  return { rows: rows.slice(from, from + params.pageSize), total, error: false };
}

export async function getThesesSummary(): Promise<ThesesSummary> {
  const supabase = createServiceClient();

  const [total, published, drafts, pendingReview, scheduled, archived, missingFiles, scoringRows] = await Promise.all([
    supabase.from("research_reports").select("id", { count: "exact", head: true }),
    supabase.from("research_reports").select("id", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("research_reports").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase.from("research_reports").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
    supabase.from("research_reports").select("id", { count: "exact", head: true }).eq("status", "scheduled"),
    supabase.from("research_reports").select("id", { count: "exact", head: true }).eq("status", "archived"),
    supabase.from("research_reports").select("id", { count: "exact", head: true }).is("file_url", null),
    supabase.from("research_reports").select(LIST_COLUMNS).limit(QUALITY_SCAN_CAP),
  ]);

  let totalViews = 0;
  let totalDownloads = 0;
  const viewsAgg = await supabase.from("research_reports").select("total:view_count.sum()").single();
  if (!viewsAgg.error && viewsAgg.data && typeof (viewsAgg.data as { total: number | null }).total === "number") {
    totalViews = (viewsAgg.data as { total: number }).total;
  } else {
    const { data: allViews } = await supabase.from("research_reports").select("view_count");
    totalViews = (allViews ?? []).reduce((sum: number, r: { view_count: number | null }) => sum + (r.view_count ?? 0), 0);
  }
  const downloadsAgg = await supabase.from("research_reports").select("total:download_count.sum()").single();
  if (!downloadsAgg.error && downloadsAgg.data && typeof (downloadsAgg.data as { total: number | null }).total === "number") {
    totalDownloads = (downloadsAgg.data as { total: number }).total;
  } else {
    const { data: allDownloads } = await supabase.from("research_reports").select("download_count");
    totalDownloads = (allDownloads ?? []).reduce((sum: number, r: { download_count: number | null }) => sum + (r.download_count ?? 0), 0);
  }

  const missingMetadata = (scoringRows.data ?? []).map(toRow).filter((r) => {
    const { tier } = qualityOf(r);
    return tier === "needs_review" || tier === "incomplete";
  }).length;

  return {
    total: total.count ?? 0,
    published: published.count ?? 0,
    drafts: drafts.count ?? 0,
    pendingReview: pendingReview.count ?? 0,
    scheduled: scheduled.count ?? 0,
    archived: archived.count ?? 0,
    totalViews,
    totalDownloads,
    missingMetadata,
    missingFiles: missingFiles.count ?? 0,
  };
}

export async function getThesisFilterOptions(): Promise<{
  programs: ThesisProgramOption[];
  cohorts: ThesisTextOption[];
  academicYears: ThesisTextOption[];
}> {
  const supabase = createServiceClient();

  const [{ data: programs }, { data: reports }] = await Promise.all([
    supabase.from("research_programs").select("code, name_en").order("sort_order", { ascending: true }),
    supabase.from("research_reports").select("cohort, academic_year"),
  ]);

  const cohortSet = new Set<string>();
  const yearSet = new Set<string>();
  for (const r of reports ?? []) {
    if (r.cohort) cohortSet.add(String(r.cohort));
    if (r.academic_year) yearSet.add(String(r.academic_year));
  }

  const cohorts: ThesisTextOption[] = Array.from(cohortSet)
    .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
    .map((c) => ({ value: c, label: /^\d+$/.test(c) ? `Cohort ${c}` : c }));

  const academicYears: ThesisTextOption[] = Array.from(yearSet)
    .sort((a, b) => b.localeCompare(a))
    .map((y) => ({ value: y, label: y }));

  return {
    programs: (programs ?? []).map((p: { code: string; name_en: string }) => ({ code: p.code, label: p.name_en })),
    cohorts,
    academicYears,
  };
}
