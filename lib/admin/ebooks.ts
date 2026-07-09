import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { scoreEbookQuality } from "@/lib/admin/ebook-quality";
import {
  LARGE_FILE_KB,
  normalizeEbookStatus,
  type EbookListRow,
  type EbookOption,
  type EbooksQueryParams,
  type EbooksSummary,
} from "@/lib/admin/ebooks-shared";

/**
 * Server-only data-access helpers for the admin Manage E-books page.
 * Constants, types, and pure helpers live in lib/admin/ebooks-shared.ts,
 * which client components import directly — this module re-exports it.
 */
export * from "@/lib/admin/ebooks-shared";

type ServiceClient = ReturnType<typeof createServiceClient>;

// updated_at arrives with migration 0077. Until it's applied, the first
// list query 42703s; we retry without the column and remember (per lambda
// instance) so subsequent requests skip the failing attempt.
let updatedAtMissing = false;

function listColumns(withUpdatedAt: boolean): string {
  return `
    id, title, slug, description, language, isbn, publisher, license, status,
    cover_url, published_at, created_at${withUpdatedAt ? ", updated_at" : ""},
    download_count, view_count, tags, department, department_id,
    authors ( name ),
    categories ( name ),
    departments ( name ),
    book_files ( file_url, file_size_kb, format )
  `;
}

function isMissingUpdatedAt(error: { code?: string; message?: string }): boolean {
  return error.code === "42703" && (error.message ?? "").includes("updated_at");
}

// Strip PostgREST .or()/.ilike() metacharacters before building filter
// strings from user input (same rule as sanitizeSearchTerm in app/api/chat).
function sanitizeSearchTerm(input: string): string {
  return input.replace(/[%,()\\*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

// Embedded to-one relations come back as an object, but PostgREST returns an
// array when it can't prove the FK is to-one — handle both shapes.
function relName(rel: unknown): string | null {
  if (Array.isArray(rel)) return (rel[0] as { name?: string })?.name ?? null;
  return (rel as { name?: string } | null)?.name ?? null;
}

type FileRel = { file_url: string | null; file_size_kb: number | null; format: string | null };

function toRow(r: Record<string, unknown>, broken: BrokenMap): EbookListRow {
  const files = (r.book_files as FileRel[] | null) ?? [];
  const file = files.find((f) => f.file_url) ?? files[0] ?? null;
  const brokenEntry = broken.get(r.id as string);
  return {
    id: r.id as string,
    title: r.title as string,
    slug: r.slug as string,
    author: relName(r.authors),
    department: relName(r.departments) ?? ((r.department as string) || null),
    departmentId: (r.department_id as string) ?? null,
    category: relName(r.categories),
    language: (r.language as string) || null,
    year: r.published_at ? new Date(r.published_at as string).getFullYear() : null,
    status: normalizeEbookStatus(r.status as string),
    coverUrl: (r.cover_url as string) || null,
    fileUrl: file?.file_url ?? null,
    fileFormat: file?.format ?? null,
    fileSizeKb: file?.file_size_kb ?? null,
    viewCount: (r.view_count as number) ?? 0,
    downloadCount: (r.download_count as number) ?? 0,
    createdAt: r.created_at as string,
    updatedAt: (r.updated_at as string) ?? null,
    fileBroken: brokenEntry?.file ?? false,
    coverBroken: brokenEntry?.cover ?? false,
    description: (r.description as string) || null,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    license: (r.license as string) || null,
    isbn: (r.isbn as string) || null,
    publisher: (r.publisher as string) || null,
  };
}

// PostgREST caps un-limited selects at 1000 rows (see the fulltext-search
// dedupe bug) — every "collect ids" helper sets an explicit generous limit.
const ID_SCAN_LIMIT = 10_000;

/** Distinct book ids that have at least one book_files row with a real file URL. */
async function getPdfBookIds(supabase: ServiceClient): Promise<Set<string>> {
  const { data } = await supabase
    .from("book_files")
    .select("book_id")
    .not("file_url", "is", null)
    .limit(ID_SCAN_LIMIT);
  return new Set((data ?? []).map((r: { book_id: string }) => r.book_id));
}

type BrokenMap = Map<string, { file: boolean; cover: boolean }>;

/** Broken-URL results from the out-of-band checker (file_health, 0065). */
async function getBrokenMap(supabase: ServiceClient): Promise<BrokenMap> {
  const map: BrokenMap = new Map();
  const { data } = await supabase
    .from("file_health")
    .select("record_id, field")
    .eq("record_type", "book")
    .eq("status", "broken")
    .limit(ID_SCAN_LIMIT);
  for (const r of (data ?? []) as { record_id: string; field: string }[]) {
    const entry = map.get(r.record_id) ?? { file: false, cover: false };
    if (r.field === "file_url") entry.file = true;
    if (r.field === "cover_url") entry.cover = true;
    map.set(r.record_id, entry);
  }
  return map;
}

/**
 * PostgREST has no substring operator for text[] columns (`tags::text=ilike.…`
 * 42883s — "operator does not exist: text[] ~~* unknown", the cast isn't
 * applied before the operator is chosen) — so tag search is done client-side
 * against a bounded scan instead, same cost tradeoff as the quality-scan
 * path below.
 */
async function getTagMatchIds(supabase: ServiceClient, term: string): Promise<string[]> {
  const { data } = await supabase.from("books").select("id, tags").limit(ID_SCAN_LIMIT);
  const lower = term.toLowerCase();
  return ((data ?? []) as { id: string; tags: string[] | null }[])
    .filter((r) => Array.isArray(r.tags) && r.tags.some((t) => t.toLowerCase().includes(lower)))
    .map((r) => r.id);
}

// A uuid that can never exist — used to force an empty result when an
// id-list filter matches nothing (PostgREST rejects `in.()`).
const NO_MATCH_ID = "00000000-0000-0000-0000-000000000000";

// Query params arrive straight from the URL — an eq() against a uuid column
// with a malformed value is a Postgres error, so validate before filtering.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(v: string | undefined): v is string {
  return Boolean(v && UUID_RE.test(v));
}

function applyIdList(query: any, ids: string[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return query.in("id", ids.length ? ids : [NO_MATCH_ID]);
}

/**
 * Applies every filter except `quality` (which needs a JS scoring pass — see
 * getEbooks). Returns `{ query }` rather than the bare builder: Supabase
 * query builders are thenable, so `return query` from an async function gets
 * flattened into an executed result by the await machinery.
 */
async function applyFilters(
  supabase: ServiceClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  base: any,
  params: EbooksQueryParams,
  broken: BrokenMap,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ query: any }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = base;

  if (params.status && params.status !== "all") {
    query = query.eq("status", normalizeEbookStatus(params.status));
  }
  if (params.dept && params.dept !== "all" && isUuid(params.dept)) {
    query = query.eq("department_id", params.dept);
  }
  if (params.category && params.category !== "all" && isUuid(params.category)) {
    query = query.eq("category_id", params.category);
  }
  if (params.language && params.language !== "all") {
    query = query.eq("language", params.language);
  }
  const year = Number(params.year);
  if (params.year && Number.isInteger(year) && year > 0) {
    query = query.gte("published_at", `${year}-01-01`).lte("published_at", `${year}-12-31`);
  }

  if (params.fileStatus && params.fileStatus !== "all") {
    if (params.fileStatus === "has_pdf" || params.fileStatus === "missing_pdf") {
      const pdfIds = Array.from(await getPdfBookIds(supabase));
      if (params.fileStatus === "has_pdf") {
        query = applyIdList(query, pdfIds);
      } else if (pdfIds.length) {
        query = query.not("id", "in", `(${pdfIds.join(",")})`);
      }
    } else if (params.fileStatus === "large_file") {
      const { data } = await supabase
        .from("book_files")
        .select("book_id")
        .gte("file_size_kb", LARGE_FILE_KB)
        .limit(ID_SCAN_LIMIT);
      query = applyIdList(query, (data ?? []).map((r: { book_id: string }) => r.book_id));
    } else if (params.fileStatus === "broken_file") {
      const ids = Array.from(broken.entries()).filter(([, v]) => v.file).map(([id]) => id);
      query = applyIdList(query, ids);
    }
  }

  if (params.coverStatus && params.coverStatus !== "all") {
    if (params.coverStatus === "has_cover") query = query.not("cover_url", "is", null);
    if (params.coverStatus === "missing_cover") query = query.is("cover_url", null);
    if (params.coverStatus === "broken_cover") {
      const ids = Array.from(broken.entries()).filter(([, v]) => v.cover).map(([id]) => id);
      query = applyIdList(query, ids);
    }
  }

  const term = sanitizeSearchTerm(params.q ?? "");
  if (term) {
    const like = `%${term}%`;
    const [{ data: authorMatches }, { data: deptMatches }, { data: catMatches }, tagIds, { data: fileMatches }] =
      await Promise.all([
        supabase.from("authors").select("id").ilike("name", like).limit(200),
        supabase.from("departments").select("id").ilike("name", like).limit(200),
        supabase.from("categories").select("id").ilike("name", like).limit(200),
        getTagMatchIds(supabase, term),
        supabase.from("book_files").select("book_id").ilike("file_url", like).limit(ID_SCAN_LIMIT),
      ]);

    const orParts = [
      `title.ilike.${like}`,
      `isbn.ilike.${like}`,
      `publisher.ilike.${like}`,
      `department.ilike.${like}`,
      `language.ilike.${like}`,
    ];
    const authorIds = (authorMatches ?? []).map((r: { id: string }) => r.id);
    if (authorIds.length) orParts.push(`author_id.in.(${authorIds.join(",")})`);
    const deptIds = (deptMatches ?? []).map((r: { id: string }) => r.id);
    if (deptIds.length) orParts.push(`department_id.in.(${deptIds.join(",")})`);
    const catIds = (catMatches ?? []).map((r: { id: string }) => r.id);
    if (catIds.length) orParts.push(`category_id.in.(${catIds.join(",")})`);
    const directIds = new Set<string>([
      ...tagIds,
      ...(fileMatches ?? []).map((r: { book_id: string }) => r.book_id),
    ]);
    if (directIds.size) orParts.push(`id.in.(${Array.from(directIds).join(",")})`);

    query = query.or(orParts.join(","));
  }

  return { query };
}

function applySqlSort(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  sort: string | undefined,
  hasUpdatedAt: boolean,
) {
  switch (sort) {
    case "oldest":
      return query.order("created_at", { ascending: true });
    case "updated":
      return query.order(hasUpdatedAt ? "updated_at" : "created_at", { ascending: false });
    case "most-downloaded":
      return query.order("download_count", { ascending: false });
    case "most-viewed":
      return query.order("view_count", { ascending: false });
    case "title-asc":
      return query.order("title", { ascending: true });
    case "title-desc":
      return query.order("title", { ascending: false });
    case "year-desc":
      return query.order("published_at", { ascending: false, nullsFirst: false });
    case "year-asc":
      return query.order("published_at", { ascending: true, nullsFirst: false });
    default:
      return query.order("created_at", { ascending: false });
  }
}

function sortRowsInPlace(rows: EbookListRow[], sort: string | undefined) {
  switch (sort) {
    case "size-desc":
      rows.sort((a, b) => (b.fileSizeKb ?? -1) - (a.fileSizeKb ?? -1));
      break;
    case "size-asc":
      rows.sort((a, b) => (a.fileSizeKb ?? Number.MAX_SAFE_INTEGER) - (b.fileSizeKb ?? Number.MAX_SAFE_INTEGER));
      break;
    case "metadata-quality":
      rows.sort((a, b) => qualityOf(b).score - qualityOf(a).score);
      break;
    case "oldest":
      rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      break;
    case "updated":
      rows.sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
      break;
    case "most-downloaded":
      rows.sort((a, b) => b.downloadCount - a.downloadCount);
      break;
    case "most-viewed":
      rows.sort((a, b) => b.viewCount - a.viewCount);
      break;
    case "title-asc":
      rows.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "title-desc":
      rows.sort((a, b) => b.title.localeCompare(a.title));
      break;
    case "year-desc":
      rows.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
      break;
    case "year-asc":
      rows.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
      break;
    default:
      rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

function qualityOf(row: EbookListRow) {
  return scoreEbookQuality({
    title: row.title,
    author: row.author,
    department: row.department,
    category: row.category,
    year: row.year,
    language: row.language,
    description: row.description,
    tags: row.tags,
    coverUrl: row.coverUrl,
    fileUrl: row.fileUrl,
    license: row.license,
    publisher: row.publisher,
  });
}

// Caps the "fetch everything, score/sort in JS" path used for quality
// filtering and file-size sorting (file size lives on the book_files
// relation, so SQL can't order by it). The PTEC library is low hundreds of
// e-books — far cheaper than maintaining stored, driftable scores.
const QUALITY_SCAN_CAP = 2000;

export async function getEbooks(
  params: EbooksQueryParams,
): Promise<{ rows: EbookListRow[]; total: number; error: boolean }> {
  const supabase = createServiceClient();
  const broken = await getBrokenMap(supabase);
  const needsJsPass =
    Boolean(params.quality && params.quality !== "all") ||
    params.sort === "metadata-quality" ||
    params.sort === "size-desc" ||
    params.sort === "size-asc";

  if (!needsJsPass) {
    const from = (params.page - 1) * params.pageSize;
    const to = from + params.pageSize - 1;

    const run = async (withUpdatedAt: boolean) => {
      let query = supabase.from("books").select(listColumns(withUpdatedAt), { count: "exact" });
      ({ query } = await applyFilters(supabase, query, params, broken));
      query = applySqlSort(query, params.sort, withUpdatedAt);
      // Stable tie-breaker so rows don't shuffle/duplicate across pages.
      query = query.order("id", { ascending: true });
      return query.range(from, to);
    };

    let result = await run(!updatedAtMissing);
    if (result.error && isMissingUpdatedAt(result.error)) {
      updatedAtMissing = true;
      result = await run(false);
    }
    if (result.error) {
      console.error("[getEbooks] query failed:", result.error.message);
      return { rows: [], total: 0, error: true };
    }
    return {
      rows: ((result.data ?? []) as unknown as Record<string, unknown>[]).map((r) => toRow(r, broken)),
      total: result.count ?? 0,
      error: false,
    };
  }

  // Quality/size path: filter/sort in JS, then paginate.
  const runScan = async (withUpdatedAt: boolean) => {
    let query = supabase.from("books").select(listColumns(withUpdatedAt)).limit(QUALITY_SCAN_CAP);
    ({ query } = await applyFilters(supabase, query, params, broken));
    return query;
  };
  let scan = await runScan(!updatedAtMissing);
  if (scan.error && isMissingUpdatedAt(scan.error)) {
    updatedAtMissing = true;
    scan = await runScan(false);
  }
  if (scan.error) {
    console.error("[getEbooks] scan query failed:", scan.error.message);
    return { rows: [], total: 0, error: true };
  }

  let rows = ((scan.data ?? []) as unknown as Record<string, unknown>[]).map((r) => toRow(r, broken));
  if (params.quality && params.quality !== "all") {
    rows = rows.filter((r) => qualityOf(r).tier === params.quality);
  }
  sortRowsInPlace(rows, params.sort);

  const total = rows.length;
  const from = (params.page - 1) * params.pageSize;
  return { rows: rows.slice(from, from + params.pageSize), total, error: false };
}

export async function getEbooksSummary(): Promise<EbooksSummary> {
  const supabase = createServiceClient();

  const [total, live, drafts, pendingReview, archived, missingCovers, brokenFiles, pdfIds, broken] =
    await Promise.all([
      supabase.from("books").select("id", { count: "exact", head: true }),
      supabase.from("books").select("id", { count: "exact", head: true }).eq("status", "published"),
      supabase.from("books").select("id", { count: "exact", head: true }).eq("status", "draft"),
      supabase.from("books").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
      supabase.from("books").select("id", { count: "exact", head: true }).eq("status", "archived"),
      supabase.from("books").select("id", { count: "exact", head: true }).is("cover_url", null),
      supabase
        .from("file_health")
        .select("id", { count: "exact", head: true })
        .eq("record_type", "book")
        .eq("field", "file_url")
        .eq("status", "broken"),
      getPdfBookIds(supabase),
      getBrokenMap(supabase),
    ]);

  // Hosted PostgREST has .sum() aggregates disabled, so each of these keeps a
  // JS-sum fallback that is the path actually taken today.
  async function sumColumn(table: string, column: string): Promise<number> {
    const agg = await supabase.from(table).select(`total:${column}.sum()`).single();
    const aggTotal = (agg.data as { total: number | null } | null)?.total;
    if (!agg.error && typeof aggTotal === "number") return aggTotal;
    const { data } = await supabase.from(table).select(column).limit(ID_SCAN_LIMIT);
    return ((data ?? []) as unknown as Record<string, number | null>[]).reduce((sum, r) => sum + (r[column] ?? 0), 0);
  }

  const [totalViews, totalDownloads, storageKb, scanResult] = await Promise.all([
    sumColumn("books", "view_count"),
    sumColumn("books", "download_count"),
    sumColumn("book_files", "file_size_kb"),
    supabase.from("books").select(listColumns(false)).limit(QUALITY_SCAN_CAP),
  ]);

  const missingMetadata = ((scanResult.data ?? []) as unknown as Record<string, unknown>[])
    .map((r) => toRow(r, broken))
    .filter((r) => {
      const { tier } = qualityOf(r);
      return tier === "needs_review" || tier === "incomplete";
    }).length;

  const totalCount = total.count ?? 0;

  return {
    total: totalCount,
    live: live.count ?? 0,
    drafts: drafts.count ?? 0,
    pendingReview: pendingReview.count ?? 0,
    archived: archived.count ?? 0,
    missingCovers: missingCovers.count ?? 0,
    missingPdfs: Math.max(0, totalCount - pdfIds.size),
    brokenFiles: brokenFiles.count ?? 0,
    totalViews,
    totalDownloads,
    storageKb,
    missingMetadata,
  };
}

export async function getEbookFilterOptions(): Promise<{
  departments: EbookOption[];
  categories: EbookOption[];
  languages: EbookOption[];
  years: EbookOption[];
}> {
  const supabase = createServiceClient();

  const [{ data: departments }, { data: categories }, { data: bookMeta }] = await Promise.all([
    supabase.from("departments").select("id, name").order("name", { ascending: true }),
    supabase.from("categories").select("id, name").order("name", { ascending: true }),
    supabase.from("books").select("language, published_at").limit(ID_SCAN_LIMIT),
  ]);

  const languageSet = new Set<string>();
  const yearSet = new Set<number>();
  for (const r of (bookMeta ?? []) as { language: string | null; published_at: string | null }[]) {
    if (r.language?.trim()) languageSet.add(r.language.trim());
    if (r.published_at) {
      const y = new Date(r.published_at).getFullYear();
      if (y > 0) yearSet.add(y);
    }
  }

  return {
    departments: ((departments ?? []) as { id: string; name: string }[]).map((d) => ({ value: d.id, label: d.name })),
    categories: ((categories ?? []) as { id: string; name: string }[]).map((c) => ({ value: c.id, label: c.name })),
    languages: Array.from(languageSet)
      .sort((a, b) => a.localeCompare(b))
      .map((l) => ({ value: l, label: l })),
    years: Array.from(yearSet)
      .sort((a, b) => b - a)
      .map((y) => ({ value: String(y), label: String(y) })),
  };
}
