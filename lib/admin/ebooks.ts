import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { scoreEbookQuality } from "@/lib/admin/ebook-quality";
import { pagedScan, type PagedScanError } from "@/lib/admin/paged-scan";
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

// updated_at arrives with migration 0077, and the curation columns with 0149.
// Until each is applied the first list query 42703s; we retry without the
// column and remember (per lambda instance) so subsequent requests skip the
// failing attempt. Two independent flags, because the two migrations are
// independent — a stack that has one and not the other must degrade in
// exactly one direction.
let updatedAtMissing = false;
let featuredMissing = false;

function listColumns(withUpdatedAt: boolean, withFeatured = !featuredMissing): string {
  return `
    id, title, slug, description, language, isbn, publisher, license, status, verified_at,
    cover_url, published_at, created_at${withUpdatedAt ? ", updated_at" : ""},
    ${withFeatured ? "featured_at, featured_position," : ""}
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

function isMissingFeatured(error: { code?: string; message?: string }): boolean {
  return error.code === "42703" && /featured_(at|position)/.test(error.message ?? "");
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
    verifiedAt: (r.verified_at as string) ?? null,
    featuredAt: (r.featured_at as string) ?? null,
    featuredPosition: (r.featured_position as number) ?? null,
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

// Ceiling on how far a scan will PAGE. It is NOT a limit that one request can
// honour — PostgREST clips every response at 1000 rows whatever is asked for,
// which is why every scan below goes through pagedScan(). See paged-scan.ts.
const ID_SCAN_LIMIT = 10_000;

/** Reads a whole result set, with this file's page ceiling applied. */
function scanAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: PagedScanError | null }>,
  maxRows: number = ID_SCAN_LIMIT,
) {
  return pagedScan<T>(page, maxRows);
}

/**
 * Distinct book ids that have at least one book_files row with a real file URL.
 * Used only by getEbooksSummary() for the stat-bar "Missing PDFs" count — the
 * result is a Set<string> consumed in JS, so no UUIDs are injected into a URL.
 * Do NOT use this to build a NOT IN (…) PostgREST filter; that path causes
 * HTTP 414 URI Too Long for any collection with more than ~200 books.
 *
 * Paged, because one request cannot return more than 1000 rows whatever the
 * `.limit()` says. A one-shot scan here returned 1,000 ids for a library of
 * 1,734 books that all had files, and the summary published the difference as
 * "Missing PDFs 734" — a badge whose own drill-down filter then matched nothing,
 * because every one of those books did have a PDF.
 *
 * `.order("id")` is load-bearing, not tidiness: without a stable sort Postgres
 * may hand the same row to two pages or to neither, and a row skipped between
 * pages is indistinguishable from a book with no file — the phantom again.
 *
 * Returns null when a page failed, i.e. the set is INCOMPLETE. Subtracting a
 * partial set from the total is exactly the bug above, so the caller must not.
 */
async function getPdfBookIds(supabase: ServiceClient): Promise<Set<string> | null> {
  const { data, error } = await scanAllRows<{ book_id: string | null }>((from, to) =>
    supabase
      .from("book_files")
      .select("book_id")
      .not("file_url", "is", null)
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (error) {
    console.error("[getPdfBookIds] paged scan failed:", error.message);
    return null;
  }
  const ids = new Set<string>();
  for (const r of data) if (r.book_id) ids.add(r.book_id);
  return ids;
}

type BrokenMap = Map<string, { file: boolean; cover: boolean }>;

/** Broken-URL results from the out-of-band checker (file_health, 0065). */
async function getBrokenMap(supabase: ServiceClient): Promise<BrokenMap> {
  const map: BrokenMap = new Map();
  const { data } = await scanAllRows<{ record_id: string; field: string }>((from, to) =>
    supabase
      .from("file_health")
      .select("record_id, field")
      .eq("record_type", "book")
      .eq("status", "broken")
      .order("id", { ascending: true })
      .range(from, to),
  );
  for (const r of data) {
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
  const { data } = await scanAllRows<{ id: string; tags: string[] | null }>((from, to) =>
    supabase.from("books").select("id, tags").order("id", { ascending: true }).range(from, to),
  );
  const lower = term.toLowerCase();
  return data
    .filter((r) => Array.isArray(r.tags) && r.tags.some((t) => t.toLowerCase().includes(lower)))
    .map((r) => r.id);
}

// Query params arrive straight from the URL — an eq() against a uuid column
// with a malformed value is a Postgres error, so validate before filtering.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(v: string | undefined): v is string {
  return Boolean(v && UUID_RE.test(v));
}

/**
 * Character budget for id lists serialised into a filter.
 *
 * Every `in.(…)` below travels in the REQUEST URI, and nginx/Kong answer a
 * request line over 8 KB with 414 — which takes the whole admin list down, not
 * just the filter. A uuid costs 37 characters with its comma, so 8 KB minus the
 * base URL, the (long) select list and the other clauses leaves roughly 6 KB;
 * 5000 keeps a margin.
 *
 * This bound REPLACES an accidental one. Until now the only thing keeping these
 * lists short was PostgREST clipping the scans that produced them at 1000 rows
 * — a row cap standing in for a byte limit, and wrong in both directions at
 * once: 1000 uuids is ~37 KB and 414s anyway, while a legitimate 1200-row match
 * was silently cut. Now the scans are complete and the truncation happens where
 * the real constraint is.
 */
const MAX_ID_FILTER_CHARS = 5_000;

/**
 * Appends `<column>.in.(…)` to an `or(...)` list, truncated to the URI budget
 * left after the clauses already pushed. Callers push the small, high-signal
 * lists first (author, department, category) so the big one — book ids matched
 * by tag or file name — takes whatever remains rather than crowding them out.
 */
function pushIdClause(orParts: string[], column: string, ids: string[]): void {
  if (ids.length === 0) return;
  const used = orParts.reduce((n, part) => n + part.length + 1, 0) + column.length + 6;
  const room = Math.max(0, Math.floor((MAX_ID_FILTER_CHARS - used) / 37));
  if (room === 0) return;
  orParts.push(`${column}.in.(${ids.slice(0, room).join(",")})`);
}

/**
 * Applies every filter except `quality`, `fileStatus` and `broken_cover`, which
 * all need a JS pass (see getEbooks). Those three are excluded for one reason:
 * each would require injecting a uuid per matching row into an `in.(…)` URL
 * param, and a few hundred of those exceed the 8 KB URI limit enforced by
 * nginx/Kong/Cloudflare (HTTP 414 / 400) — which fails the whole listing, not
 * just the filter.
 *
 * SYNCHRONOUS, and it returns the builder rather than `{ query }`: the async
 * lookups a search term needs now live in resolveSearchOr(), so this can be
 * applied once per PAGE of a paged scan without re-running them. (The old
 * `{ query }` wrapper existed only because Supabase builders are thenable, so
 * `return query` from an async function got flattened into an executed result.)
 */
function applyFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  base: any,
  params: EbooksQueryParams,
  searchOr: string[] | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
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

  // Verification is orthogonal to status — combining the two (?status=published
  // &verification=unverified) is what surfaces the records whose public pages
  // carry the "not yet verified" citation warning.
  if (params.verification === "verified") {
    query = query.not("verified_at", "is", null);
  } else if (params.verification === "unverified") {
    query = query.is("verified_at", null);
  }

  // Curation, the third axis. Only applied when 0149 is in the database —
  // otherwise the filter would 42703 the whole list rather than being ignored.
  if (!featuredMissing && params.featured && params.featured !== "all") {
    if (params.featured === "featured") query = query.not("featured_at", "is", null);
    if (params.featured === "not_featured") query = query.is("featured_at", null);
  }

  // has_cover / missing_cover are column predicates and stay in SQL.
  // broken_cover is NOT here: it used to serialise one uuid per broken cover
  // into the request URI — the 414 that `broken_file` had already been moved
  // into the JS pass to avoid. It now takes the same route (toRow() resolves
  // `coverBroken` from the same file_health map), so the filter is complete
  // however many covers are broken, instead of stopping at whatever fitted in
  // a URL.
  if (params.coverStatus === "has_cover") query = query.not("cover_url", "is", null);
  if (params.coverStatus === "missing_cover") query = query.is("cover_url", null);

  if (searchOr && searchOr.length) query = query.or(searchOr.join(","));

  return query;
}

/**
 * The async half of the filter set: the id lookups a search term needs, and the
 * `or(...)` clauses they produce. Null when there is no term.
 *
 * Split out of applyFilters() because the scan path below PAGES through the
 * collection, and applying the filters per page would re-run these five queries
 * — one of them itself a full paged scan of `books` for tag matches — once per
 * page. Resolved once per request, they cost what they always did.
 */
async function resolveSearchOr(
  supabase: ServiceClient,
  params: EbooksQueryParams,
): Promise<string[] | null> {
  const term = sanitizeSearchTerm(params.q ?? "");
  if (!term) return null;

  const like = `%${term}%`;
  const [{ data: authorMatches }, { data: deptMatches }, { data: catMatches }, tagIds, fileMatches] =
    await Promise.all([
      supabase.from("authors").select("id").ilike("name", like).limit(200),
      supabase.from("departments").select("id").ilike("name", like).limit(200),
      supabase.from("categories").select("id").ilike("name", like).limit(200),
      getTagMatchIds(supabase, term),
      scanAllRows<{ book_id: string | null }>((from, to) =>
        supabase
          .from("book_files")
          .select("book_id")
          .ilike("file_url", like)
          .order("id", { ascending: true })
          .range(from, to),
      ),
    ]);

  const orParts = [
    `title.ilike.${like}`,
    `isbn.ilike.${like}`,
    `publisher.ilike.${like}`,
    `department.ilike.${like}`,
    `language.ilike.${like}`,
  ];
  // Smallest and most specific first — see pushIdClause on why the order is
  // what decides which list gets truncated when a term is very broad.
  pushIdClause(orParts, "author_id", (authorMatches ?? []).map((r: { id: string }) => r.id));
  pushIdClause(orParts, "department_id", (deptMatches ?? []).map((r: { id: string }) => r.id));
  pushIdClause(orParts, "category_id", (catMatches ?? []).map((r: { id: string }) => r.id));

  const directIds = new Set<string>(tagIds);
  for (const r of fileMatches.data) if (r.book_id) directIds.add(r.book_id);
  pushIdClause(orParts, "id", Array.from(directIds));

  return orParts;
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
// filtering, file-status filtering, broken_cover and file-size sorting. Those
// filters resolve through toRow() (fileUrl / fileSizeKb / fileBroken /
// coverBroken) in JS rather than serialising thousands of UUIDs into a URL
// parameter, which causes HTTP 414 URI Too Long at scale.
//
// Like ID_SCAN_LIMIT this bounds how far the scan PAGES, not what one request
// returns — the server caps that at 1000 regardless. Same value, so the JS
// path never sees less of the collection than the id helpers above do.
const QUALITY_SCAN_CAP = 10_000;

export async function getEbooks(
  params: EbooksQueryParams,
): Promise<{ rows: EbookListRow[]; total: number; error: boolean }> {
  const supabase = createServiceClient();
  const [broken, searchOr] = await Promise.all([
    getBrokenMap(supabase),
    resolveSearchOr(supabase, params),
  ]);
  const needsJsPass =
    Boolean(params.quality && params.quality !== "all") ||
    // fileStatus filtering is done in JS — see applyFilters() comment.
    Boolean(params.fileStatus && params.fileStatus !== "all") ||
    params.coverStatus === "broken_cover" ||
    params.sort === "metadata-quality" ||
    params.sort === "size-desc" ||
    params.sort === "size-asc";

  if (!needsJsPass) {
    const from = (params.page - 1) * params.pageSize;
    const to = from + params.pageSize - 1;

    const run = async (withUpdatedAt: boolean) => {
      let query = supabase.from("books").select(listColumns(withUpdatedAt), { count: "exact" });
      query = applyFilters(query, params, searchOr);
      query = applySqlSort(query, params.sort, withUpdatedAt);
      // Stable tie-breaker so rows don't shuffle/duplicate across pages.
      query = query.order("id", { ascending: true });
      return query.range(from, to);
    };

    let result = await run(!updatedAtMissing);
    if (result.error && isMissingFeatured(result.error)) {
      featuredMissing = true;
      result = await run(!updatedAtMissing);
    }
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

  // Quality / fileStatus / size path: scan all matching rows, filter/sort in JS,
  // then paginate. applyFilters() still handles status, dept, category, language,
  // year, verification, featured and the cover_url predicates — reducing the
  // scan set before the JS pass.
  //
  // PAGED, because one request returns at most 1000 rows whatever the `.limit()`
  // says: un-paged, this scan stopped at the thousandth book, so every quality
  // tier, file-status and size view showed an arbitrary prefix of the collection
  // and reported its length as the total.
  const runScan = (withUpdatedAt: boolean) =>
    scanAllRows<Record<string, unknown>>(
      (from, to) =>
        applyFilters(supabase.from("books").select(listColumns(withUpdatedAt)), params, searchOr)
          .order("id", { ascending: true })
          .range(from, to),
      QUALITY_SCAN_CAP,
    );
  let scan = await runScan(!updatedAtMissing);
  if (scan.error && isMissingFeatured(scan.error)) {
    featuredMissing = true;
    scan = await runScan(!updatedAtMissing);
  }
  if (scan.error && isMissingUpdatedAt(scan.error)) {
    updatedAtMissing = true;
    scan = await runScan(false);
  }
  if (scan.error) {
    console.error("[getEbooks] scan query failed:", scan.error.message);
    return { rows: [], total: 0, error: true };
  }

  let rows = scan.data.map((r) => toRow(r, broken));

  // fileStatus JS filter — toRow() resolves fileUrl / fileSizeKb / fileBroken
  // from the joined book_files relation, so no extra query is needed here.
  if (params.fileStatus && params.fileStatus !== "all") {
    if (params.fileStatus === "has_pdf") {
      rows = rows.filter((r) => Boolean(r.fileUrl));
    } else if (params.fileStatus === "missing_pdf") {
      rows = rows.filter((r) => !r.fileUrl);
    } else if (params.fileStatus === "large_file") {
      rows = rows.filter((r) => (r.fileSizeKb ?? 0) >= LARGE_FILE_KB);
    } else if (params.fileStatus === "broken_file") {
      rows = rows.filter((r) => r.fileBroken);
    }
  }

  if (params.coverStatus === "broken_cover") {
    rows = rows.filter((r) => r.coverBroken);
  }

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

  const [total, live, drafts, pendingReview, archived, missingCovers, brokenFiles, pdfIds, broken, unverifiedLive] =
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
      supabase
        .from("books")
        .select("id", { count: "exact", head: true })
        .eq("status", "published")
        .is("verified_at", null),
    ]);

  // Counted separately rather than inside the Promise.all above so a
  // pre-0149 database answers "0 featured" instead of failing the whole
  // summary — the KPI row must never be the thing that takes the page down.
  const featuredCount = await supabase
    .from("books")
    .select("id", { count: "exact", head: true })
    .not("featured_at", "is", null)
    .then(
      (res: { count: number | null; error: { code?: string } | null }) =>
        res.error ? 0 : (res.count ?? 0),
      () => 0,
    );

  // Hosted PostgREST has .sum() aggregates disabled, so each of these keeps a
  // JS-sum fallback that is the path actually taken today — and it therefore
  // has to PAGE. A sum over a response the server clipped at 1000 rows is not a
  // partial total, it is a wrong one: total views, total downloads and total
  // storage were all being reported from the first thousand rows of a
  // 1,734-book library.
  async function sumColumn(table: string, column: string): Promise<number> {
    const agg = await supabase.from(table).select(`total:${column}.sum()`).single();
    const aggTotal = (agg.data as { total: number | null } | null)?.total;
    if (!agg.error && typeof aggTotal === "number") return aggTotal;
    const { data } = await scanAllRows<Record<string, number | null>>((from, to) =>
      supabase.from(table).select(column).order("id", { ascending: true }).range(from, to),
    );
    return data.reduce((sum, r) => sum + (r[column] ?? 0), 0);
  }

  const [totalViews, totalDownloads, storageKb, scanResult] = await Promise.all([
    sumColumn("books", "view_count"),
    sumColumn("books", "download_count"),
    sumColumn("book_files", "file_size_kb"),
    scanAllRows<Record<string, unknown>>(
      (from, to) =>
        supabase.from("books").select(listColumns(false)).order("id", { ascending: true }).range(from, to),
      QUALITY_SCAN_CAP,
    ),
  ]);

  const missingMetadata = scanResult.data
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
    // An INCOMPLETE id scan must never be published as missing books — that is
    // the 734-phantom itself. Unknown reads as 0, failing soft the same way
    // featuredCount above does, rather than inventing a repair queue.
    missingPdfs: pdfIds ? Math.max(0, totalCount - pdfIds.size) : 0,
    brokenFiles: brokenFiles.count ?? 0,
    totalViews,
    totalDownloads,
    storageKb,
    missingMetadata,
    unverifiedLive: unverifiedLive.count ?? 0,
    featured: featuredCount,
  };
}

export async function getEbookFilterOptions(): Promise<{
  departments: EbookOption[];
  categories: EbookOption[];
  languages: EbookOption[];
  years: EbookOption[];
}> {
  const supabase = createServiceClient();

  // The books scan is paged: clipped at 1000 rows it offered the language and
  // year filters of an arbitrary prefix of the collection, so a language used
  // only by later books had no chip to filter by at all.
  const [{ data: departments }, { data: categories }, { data: bookMeta }] = await Promise.all([
    supabase.from("departments").select("id, name").order("name", { ascending: true }),
    supabase.from("categories").select("id, name").order("name", { ascending: true }),
    scanAllRows<{ language: string | null; published_at: string | null }>((from, to) =>
      supabase
        .from("books")
        .select("language, published_at")
        .order("id", { ascending: true })
        .range(from, to),
    ),
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
