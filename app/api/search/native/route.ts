/* eslint-disable @typescript-eslint/no-explicit-any */
// Native academic search across books, theses, publications, physical catalog,
// and posts. Ranking is intentionally computed server-side so the UI receives
// a lightweight, already-ordered response.

import { createServiceClient } from "@/lib/supabase/server";
import { generateQueryEmbedding } from "@/lib/gemini-embeddings";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy, isExpensiveSearchDisabled } from "@/lib/rate-limit-policy";
import { logSecurityEvent } from "@/lib/security-log";
import { classifySignatures } from "@/lib/security/model";
import { bookDownloadAllowed } from "@/lib/books/access";
import { resolveDownloadAccess } from "@/lib/publications/access";
import {
  academicTextToPlainText,
  normalizePublicationReferences,
} from "@/lib/publications/citations";
import {
  buildFacetCounts,
  hasAnySelection,
  hasNonTypeSelection,
  matchesFacets,
  parseFacetSelections,
  type FacetSelections,
  type SearchFacetCounts,
} from "@/lib/search/facets";
import {
  anonymousSessionHash,
  isLikelyBot,
  normalizeSearchTerm,
} from "@/lib/search/analytics";
import {
  pathBodyText,
  pathDurationMinutes,
  pathModuleCount,
  pathStepCount,
} from "@/lib/search/learning-paths";
// Scoring, sorting and query normalization live in lib/search — the route
// only builds candidates. See docs/search-ranking.md.
import {
  compareBySort,
  pageHitKey,
  parseSort,
  prepareQuery,
  searchScore,
  type ActiveSearchType,
  type Candidate,
  type PreparedQuery,
  type SearchResult,
  type SearchResultType,
  type SearchSort,
} from "@/lib/search/ranking";
import {
  hasKhmer,
  isbnSearchKeys,
  normalizeIsbn,
  normalizeSearchText,
  tokenizeSearchQuery,
} from "@/lib/search/normalize";
import {
  canonicalAvailabilitySelection,
  canonicalLanguage,
  digitalAvailability,
  physicalAvailability,
} from "@/lib/search/availability";
// One definition of "show the reader where the match is", shared with the AI
// evidence layer so a page hit reads the same in a result card and under an
// answer.
import { makeSnippet } from "@/lib/search/snippet";
import { clientIp } from "@/lib/client-ip";

export type { ActiveSearchType, SearchResult, SearchResultType, SearchSort } from "@/lib/search/ranking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE_ALL = 4;
const PAGE_SIZE_TYPE = 10;
const CANDIDATE_LIMIT_ALL = 80;
const CANDIDATE_LIMIT_TYPE = 260;
// The broad pool above is ordered by popularity before the scorer sees it,
// so a query matching many descriptions ("research" matches most of the
// collection) can push an unpopular EXACT title out of it. A second, small
// pool of whole-query matches on the decisive fields rides alongside so a
// phrase match always reaches the scorer.
const PHRASE_POOL_LIMIT = 40;
const COVERS_URL = process.env.NEXT_PUBLIC_R2_COVERS_URL ?? "";
const CACHE_TTL_MS = 45_000;
const CACHE_MAX = 80;

export type SearchCounts = Record<SearchResultType, number> & { total: number };

export type PageHit = {
  recordType: "book" | "research" | "publication";
  recordId: string;
  title: string;
  url: string;
  pageNo: number;
  snippet: string;
  /** "exact" = the query text appears verbatim on the page (trigram/ILIKE);
   *  "semantic" = the passage is about the query topic (book_chunks, 0082). */
  matchType?: "exact" | "semantic";
};

export type SearchFacets = {
  subjects: string[];
  languages: string[];
  authors: string[];
  years: number[];
  formats: string[];
  availability: string[];
};

export type NativeSearchResponse = {
  results: SearchResult[];
  counts: SearchCounts;
  page: number;
  hasMore: boolean;
  fuzzy?: boolean;
  didYouMean?: string | null;
  pageHits?: PageHit[];
  facets?: SearchFacets;
  /** Per-value facet counts for the sidebar; a dimension's counts ignore its own selection. */
  facetCounts?: SearchFacetCounts;
  relatedSubjects?: string[];
  popularResources?: SearchResult[];
  sort: SearchSort;
};

type DB = ReturnType<typeof createServiceClient>;

// Facet dimensions (type/subject/lang/year/availability) are NOT here — they
// are multi-select and applied in memory over the candidate pool (see
// lib/search/facets.ts) so the sidebar gets live counts without extra queries.
type Filters = {
  dept?: string;
  author?: string;
  advisor?: string;
  program?: string;
  cohort?: string;
  format?: string;
  isbn?: string;
  publisher?: string;
  minViews?: number;
  minDownloads?: number;
  minRating?: number;
};

type PerTypeSearch = { data: SearchResult[]; count: number; allCandidates: SearchResult[] };

const responseCache = new Map<string, { expires: number; body: NativeSearchResponse }>();

function cacheGet(key: string): NativeSearchResponse | null {
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    responseCache.delete(key);
    return null;
  }
  return hit.body;
}

function cacheSet(key: string, body: NativeSearchResponse) {
  if (responseCache.size >= CACHE_MAX) {
    const first = responseCache.keys().next().value;
    if (first) responseCache.delete(first);
  }
  responseCache.set(key, { expires: Date.now() + CACHE_TTL_MS, body });
}

function coverUrlOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.startsWith("http") ? raw : `${COVERS_URL}/${raw}`;
}

function sanitize(raw: string): string {
  return raw
    .replace(/[%_(),\\*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function orFilter(fields: string[], tokens: string[]): string {
  const clauses: string[] = [];
  for (const tok of tokens) {
    const safe = sanitize(tok);
    if (!safe) continue;
    for (const f of fields) clauses.push(`${f}.ilike.%${safe}%`);
  }
  return clauses.join(",");
}

/**
 * An `ilike` pattern that finds a stored ISBN whatever separators it was
 * typed with: a wildcard between every digit matches "978-1-4739-4629-3",
 * "9781473946293" and "978 1 4739 4629 3" alike. It is deliberately loose —
 * any row it returns is confirmed in memory with `normalizeIsbn`.
 */
function isbnLoosePattern(digits: string): string {
  return `%${digits.split("").join("%")}%`;
}

function isbnClauses(raw: string | null | undefined): string[] {
  const keys = isbnSearchKeys(raw);
  return keys.map((key) => `isbn.ilike.${isbnLoosePattern(key)}`);
}

/** Whole-query clauses for the fields where a phrase match is decisive, plus
 *  the rows the trigram pass nominated (`seedIds`) so a misspelt title still
 *  reaches the scorer. */
function phraseFilter(fields: string[], query: PreparedQuery, filters: Filters, withIsbn: boolean, seedIds: readonly string[] = []): string {
  const safe = sanitize(query.raw);
  const clauses = safe ? fields.map((f) => `${f}.ilike.%${safe}%`) : [];
  if (withIsbn && query.isbn) clauses.push(...isbnClauses(query.raw));
  if (withIsbn && filters.isbn) clauses.push(...isbnClauses(filters.isbn));
  if (seedIds.length) clauses.push(`id.in.(${seedIds.join(",")})`);
  return clauses.join(",");
}

// Titles the trigram index thinks the query resembles (`search_library_fuzzy`,
// 0059/0110). One RPC per uncached request; the ids are folded into each
// type's phrase pool so a typo ("Essentails of Research Design") is scored
// by the same model as everything else instead of surfacing only when the
// whole search came back empty.
const FUZZY_SEED_LIMIT = 12;
const FUZZY_SEED_MIN_QUERY = 4;

async function fuzzyCandidateIds(db: DB, q: string): Promise<Record<SearchResultType, string[]>> {
  const out: Record<SearchResultType, string[]> = { book: [], research: [], publication: [], catalog: [], learning_path: [], post: [] };
  if (q.length < FUZZY_SEED_MIN_QUERY) return out;
  try {
    const { data, error } = await db.rpc("search_library_fuzzy", { query_text: q, match_count: FUZZY_SEED_LIMIT });
    if (error) return out;
    for (const r of (data ?? []) as any[]) {
      const source = r.source as SearchResultType;
      if (source in out && r.id && /^[0-9a-f-]{36}$/i.test(String(r.id))) out[source].push(String(r.id));
    }
  } catch {
    // Seeds are an aid, never a dependency.
  }
  return out;
}

type PoolRows = { data: any[] | null; count: number | null; error: { message: string; code?: string } | null };

/**
 * The broad token pool and the phrase pool, fetched together and merged by
 * id. The exact count stays the broad query's — the phrase rows are a subset
 * of it except when an ISBN key found a row the raw text could not, which
 * the caller reconciles against what it actually scored.
 */
async function fetchPools(
  run: (or: string, limit: number) => PromiseLike<PoolRows>,
  broadOr: string,
  phraseOr: string,
  limit: number,
): Promise<PoolRows> {
  const [broad, phrase] = await Promise.all([
    run(broadOr, limit),
    phraseOr ? run(phraseOr, PHRASE_POOL_LIMIT) : Promise.resolve<PoolRows>({ data: [], count: null, error: null }),
  ]);
  if (broad.error) return broad;
  if (phrase.error || !phrase.data?.length) return broad;
  const merged = [...(broad.data ?? [])];
  const seen = new Set(merged.map((r) => r.id));
  for (const row of phrase.data) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  return { data: merged, count: broad.count, error: null };
}

/** Score, order and reconcile the count with what actually survived. */
function rankCandidates(candidates: Candidate[], query: PreparedQuery, pageHitIds: Set<string>, sort: SearchSort, count: number | null): PerTypeSearch {
  let ranked = candidates.map((row) => searchScore(row, query, pageHitIds));
  // An ISBN query is answered by identity, not by text: rows the loose
  // pattern swept in that carry a different ISBN scored nothing and are not
  // results.
  if (query.isbn) ranked = ranked.filter((r) => (r.score ?? 0) > 0);
  ranked.sort((a, b) => compareBySort(a, b, sort));
  const total = query.isbn ? ranked.length : Math.max(count ?? 0, ranked.length);
  return { data: ranked.slice(0, PAGE_SIZE_ALL), count: total, allCandidates: ranked };
}

function yearOf(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const y = new Date(dateStr).getFullYear();
  return Number.isFinite(y) ? y : null;
}

function yearFromText(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function makeExcerpt(text: string | null | undefined, len = 170): string | null {
  if (!text) return null;
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= len ? clean : `${clean.slice(0, len)}...`;
}

function cleanArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const clean = typeof item === "string" ? item.trim() : "";
        return clean ? [clean] : [];
      })
    : [];
}

function getClientIP(req: Request): string {
  return clientIp(req.headers);
}

async function logSearchQuery(
  db: DB,
  term: string,
  resultCount: number,
  type: ActiveSearchType,
  sort: SearchSort,
  sessionHash: string | null = null,
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      term,
      result_count: resultCount,
      query_language: hasKhmer(term) ? "km" : "en",
      resource_type: type,
      sort,
    };
    if (sessionHash) payload.session_hash = sessionHash;
    let { error } = await db.from("search_queries").insert(payload);
    if (sessionHash && (error?.code === "42703" || error?.code === "PGRST204")) {
      // Pre-0087: session_hash column doesn't exist — keep the rich columns.
      delete payload.session_hash;
      ({ error } = await db.from("search_queries").insert(payload));
    }
    if (error?.code === "42703" || error?.code === "PGRST204") {
      await db.from("search_queries").insert({ term, result_count: resultCount });
    }
  } catch (err) {
    console.error("[native-search] query log failed:", err);
  }
}

/**
 * Admin-curated synonym lookup (0087): returns replacement queries to retry
 * when the raw term finds nothing. Only rows a librarian explicitly created
 * are ever applied — analytics data itself never mutates search behavior.
 */
async function synonymAlternatives(db: DB, q: string): Promise<string[]> {
  try {
    const norm = normalizeSearchTerm(q);
    const { data, error } = await db
      .from("search_synonyms")
      .select("synonyms")
      .eq("term", norm)
      .eq("is_active", true)
      .limit(1);
    if (error || !data?.length) return [];
    return (data[0].synonyms ?? []).filter((s: unknown): s is string => typeof s === "string" && s.trim() !== "").slice(0, 2);
  } catch {
    return [];
  }
}

/** Librarian-pinned results for a term (0087), rendered ahead of organic hits. */
async function curatedResultsFor(db: DB, q: string): Promise<SearchResult[]> {
  try {
    const norm = normalizeSearchTerm(q);
    const { data, error } = await db
      .from("search_curated_results")
      .select("id, result_type, result_url, result_title")
      .eq("term", norm)
      .eq("is_active", true)
      .limit(3);
    if (error || !data?.length) return [];
    return data.map((row: any) => {
      const type: SearchResultType =
        row.result_type === "thesis" ? "research" :
        row.result_type === "book" || row.result_type === "publication" || row.result_type === "post"
          ? row.result_type
          : "post";
      return {
        id: `curated-${row.id}`,
        ref: row.result_url,
        type,
        title: row.result_title,
        author: "",
        coverUrl: null,
        url: row.result_url,
        matchedFields: ["curated"],
        actions: { view: row.result_url },
      } satisfies SearchResult;
    });
  } catch {
    return [];
  }
}

/** Prepends curated pins, dropping organic duplicates of the same URL. */
function withCurated(curated: SearchResult[], results: SearchResult[]): SearchResult[] {
  if (curated.length === 0) return results;
  const pinned = new Set(curated.map((c) => c.url));
  return [...curated, ...results.filter((r) => !pinned.has(r.url))];
}

function countsOf(results: SearchResult[]): SearchCounts {
  const counts: SearchCounts = { book: 0, research: 0, publication: 0, catalog: 0, learning_path: 0, post: 0, total: results.length };
  for (const r of results) counts[r.type] += 1;
  return counts;
}

function facetsOf(results: SearchResult[]): SearchFacets {
  const subjects = new Set<string>();
  const languages = new Set<string>();
  const authors = new Set<string>();
  const years = new Set<number>();
  const formats = new Set<string>();
  const availability = new Set<string>();
  for (const r of results) {
    if (r.subject || r.category) subjects.add((r.subject || r.category)!);
    if (r.language) languages.add(r.language);
    if (r.author && r.author !== "Unknown") authors.add(r.author);
    if (r.year) years.add(r.year);
    if (r.format) formats.add(r.format);
    if (r.availability) availability.add(r.availability);
  }
  return {
    subjects: [...subjects].sort().slice(0, 20),
    languages: [...languages].sort().slice(0, 12),
    authors: [...authors].sort().slice(0, 12),
    years: [...years].sort((a, b) => b - a).slice(0, 20),
    formats: [...formats].sort(),
    availability: [...availability].sort(),
  };
}

/** The advanced-search ISBN field: a whole ISBN in any form, or a partial one
 *  as typed. The database pattern is loose; this is the decision. */
function isbnFilterMatches(rowIsbn: string | null | undefined, filter: string): boolean {
  const canonical = normalizeIsbn(filter);
  if (canonical && normalizeIsbn(rowIsbn) === canonical) return true;
  const rowDigits = (rowIsbn ?? "").replace(/[^0-9Xx]/g, "").toUpperCase();
  const filterDigits = filter.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (filterDigits && rowDigits.includes(filterDigits)) return true;
  return normalizeSearchText(rowIsbn).includes(normalizeSearchText(filter));
}

function filterCommon(row: Candidate, filters: Filters): boolean {
  if (filters.minViews != null && (row.views ?? 0) < filters.minViews) return false;
  if (filters.minDownloads != null && (row.downloadCount ?? 0) < filters.minDownloads) return false;
  if (filters.minRating != null && Number(row.rating ?? 0) < filters.minRating) return false;
  if (filters.format && normalizeSearchText(row.format) !== normalizeSearchText(filters.format)) return false;
  if (filters.isbn && !isbnFilterMatches(row.isbn, filters.isbn)) return false;
  return true;
}

async function lookupIds(db: DB, table: string, column: string, q: string, idColumn = "id"): Promise<string[]> {
  if (!q) return [];
  try {
    const { data } = await db
      .from(table)
      .select(idColumn)
      .ilike(column, `%${q}%`)
      .limit(80);
    return (data ?? []).map((r: any) => String(r[idColumn])).filter(Boolean);
  } catch {
    return [];
  }
}

async function matchingBookFileIds(db: DB, filters: Filters): Promise<string[] | null> {
  if (!filters.format) return null;
  const q = db.from("book_files").select("book_id").not("file_url", "is", null).ilike("format", filters.format).limit(500);
  const { data, error } = await q;
  if (error) return [];
  return [...new Set((data ?? []).map((row: any) => row.book_id as string).filter(Boolean))];
}

async function searchBooks(db: DB, rawQ: string, filters: Filters, limit: number, pageHitIds: Set<string>, sort: SearchSort, seedIds: string[] = []): Promise<PerTypeSearch> {
  const q = sanitize(rawQ);
  const prepared = prepareQuery(q);
  const tokens = tokenizeSearchQuery(q);
  const [authorIds, categoryIds, departmentIds, fileBookIds] = await Promise.all([
    lookupIds(db, "authors", "name", q),
    lookupIds(db, "categories", "name", q),
    lookupIds(db, "departments", "name", q),
    matchingBookFileIds(db, filters),
  ]);

  const authorsJoin = filters.author || authorIds.length ? "authors!inner(name)" : "authors(name)";
  const categoriesJoin = categoryIds.length ? "categories!inner(name)" : "categories(name)";
  const departmentsJoin = filters.dept || departmentIds.length ? "departments!inner(name)" : "departments(name)";

  const BOOK_COLUMNS = `id, slug, title, cover_url, description, language, published_at, created_at, rating, download_count, view_count, department, isbn, publisher, tags, reviews(count), book_files(format, file_url), ${authorsJoin}, ${categoriesJoin}, ${departmentsJoin}`;

  // The filter chain is rebuilt rather than mutated in place so the query can
  // be re-issued with a narrower column list — see the retry below.
  const buildQuery = (columns: string, or: string, rowLimit: number) => {
    let query: any = db
      .from("books")
      .select(columns, { count: "exact" })
      .eq("is_published", true);
    if (or) query = query.or(or);

    if (filters.dept) query = query.eq("departments.name", filters.dept);
    if (filters.author) query = query.ilike("authors.name", `%${filters.author}%`);
    if (filters.isbn) query = query.or([`isbn.ilike.%${sanitize(filters.isbn)}%`, ...isbnClauses(filters.isbn)].join(","));
    if (filters.publisher) query = query.ilike("publisher", `%${filters.publisher}%`);
    if (fileBookIds) query = fileBookIds.length ? query.in("id", fileBookIds) : query.in("id", ["00000000-0000-0000-0000-000000000000"]);

    return query.order("download_count", { ascending: false, nullsFirst: false }).limit(rowLimit);
  };

  const relational = [
    authorIds.length ? `author_id.in.(${authorIds.join(",")})` : "",
    categoryIds.length ? `category_id.in.(${categoryIds.join(",")})` : "",
    departmentIds.length ? `department_id.in.(${departmentIds.join(",")})` : "",
  ].filter(Boolean);
  const broadOr = [orFilter(["title", "description", "isbn", "publisher"], tokens), ...relational].filter(Boolean).join(",");
  const phraseOr = [phraseFilter(["title"], prepared, filters, true, seedIds), ...relational].filter(Boolean).join(",");
  const runPools = (columns: string) => fetchPools((or, rowLimit) => buildQuery(columns, or, rowLimit), broadOr, phraseOr, limit);

  // allow_download (0131) decides whether a result offers a download link.
  // Asked for with a fallback: on a database without the column PostgREST
  // fails the whole select, and an empty book section is a far worse outcome
  // than a link that the gated route would refuse anyway.
  let { data, count, error } = await runPools(`${BOOK_COLUMNS}, allow_download`);
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    ({ data, count, error } = await runPools(BOOK_COLUMNS));
  }

  if (error) {
    console.error("[native-search/books]", error.message);
    return { data: [], count: 0, allCandidates: [] };
  }

  const candidates: Candidate[] = (data ?? []).map((r: any) => {
    const files = Array.isArray(r.book_files) ? r.book_files : [];
    const pdf = files.find((f: any) => f?.file_url) ?? null;
    const author = r.authors?.name ?? "Unknown";
    const category = r.categories?.name ?? null;
    const dept = r.departments?.name ?? r.department ?? null;
    const keywords = cleanArray(r.tags);
    const year = yearOf(r.published_at);
    // Offered only when the server would actually serve it. A result that
    // links at a read-online-only book's download hands the reader a 403;
    // the same resolution the detail page and the download route use
    // decides it here too. `allow_download` is absent from the select on a
    // pre-0131 database, which reads as "allowed" — the column's default.
    const canDownload = Boolean(pdf?.file_url) && bookDownloadAllowed(r.allow_download);
    return {
      id: r.id,
      ref: r.slug,
      type: "book" as const,
      title: r.title,
      author,
      coverUrl: coverUrlOf(r.cover_url),
      url: `/books/${r.slug}`,
      year,
      department: dept,
      language: canonicalLanguage(r.language),
      category,
      subject: category ?? dept,
      isbn: r.isbn ?? null,
      publisher: r.publisher ?? null,
      rating: (r.reviews?.[0]?.count ?? 0) > 0 && r.rating ? Number(r.rating) : null,
      views: r.view_count ?? 0,
      downloadCount: r.download_count ?? 0,
      excerpt: makeExcerpt(r.description),
      keywords,
      format: pdf?.format ?? "PDF",
      availability: digitalAvailability({ hasFile: Boolean(pdf?.file_url), canDownload }),
      actions: {
        view: `/books/${r.slug}`,
        read: pdf?.file_url ? `/books/${r.slug}/read` : undefined,
        download: canDownload ? `/api/books/${r.id}/download` : undefined,
        cite: `/books/${r.slug}#cite`,
        save: `/books/${r.slug}#save`,
      },
      searchableText: [r.title, author, category, dept, r.description, r.isbn, r.publisher, keywords.join(" ")].filter(Boolean).join(" "),
      titleText: r.title,
      authorText: author,
      subjectText: [category, dept].filter(Boolean).join(" "),
      keywordText: keywords.join(" "),
      bodyText: r.description ?? "",
      dateValue: year ?? 0,
      popularityValue: (r.view_count ?? 0) + (r.download_count ?? 0),
    };
  }).filter((row: Candidate) => filterCommon(row, filters));

  return rankCandidates(candidates, prepared, pageHitIds, sort, count);
}

async function searchResearch(db: DB, rawQ: string, filters: Filters, limit: number, pageHitIds: Set<string>, sort: SearchSort, seedIds: string[] = []): Promise<PerTypeSearch> {
  const q = sanitize(rawQ);
  const prepared = prepareQuery(q);
  const tokens = tokenizeSearchQuery(q);

  const build = (or: string, rowLimit: number) => {
    let query: any = db
      .from("research_reports")
      .select(
        "id, slug, title, cover_url, abstract, author_names, advisor_name, co_advisor_name, program, cohort, academic_year, subject, faculty, keywords, language, thesis_type, view_count, download_count, published_at, created_at, file_url",
        { count: "exact" },
      )
      .eq("is_published", true);
    if (or) query = query.or(or);

    if (filters.author) query = query.ilike("author_names", `%${filters.author}%`);
    if (filters.program) query = query.eq("program", filters.program);
    if (filters.cohort) query = query.eq("cohort", filters.cohort);
    if (filters.format && normalizeSearchText(filters.format) !== "pdf") query = query.in("id", ["00000000-0000-0000-0000-000000000000"]);

    return query.order("view_count", { ascending: false }).limit(rowLimit);
  };

  const { data, count, error } = await fetchPools(
    build,
    orFilter(["title", "abstract", "author_names", "advisor_name", "subject"], tokens),
    phraseFilter(["title", "author_names", "subject"], prepared, filters, false, seedIds),
    limit,
  );
  if (error) {
    console.error("[native-search/research]", error.message);
    return { data: [], count: 0, allCandidates: [] };
  }

  const candidates: Candidate[] = (data ?? []).map((r: any) => {
    const year = yearFromText(r.academic_year) ?? yearOf(r.published_at) ?? yearOf(r.created_at);
    const author = r.author_names ?? "Unknown";
    const subject = r.subject ?? r.program ?? r.faculty ?? "Thesis";
    const keywords = cleanArray(r.keywords);
    const ref = r.slug ?? r.id;
    return {
      id: r.id,
      ref,
      type: "research" as const,
      title: r.title,
      author,
      coverUrl: coverUrlOf(r.cover_url),
      url: `/theses/${ref}`,
      year,
      language: canonicalLanguage(r.language),
      category: r.program ?? "Thesis",
      subject,
      rating: null,
      views: r.view_count ?? 0,
      downloadCount: r.download_count ?? 0,
      excerpt: makeExcerpt(r.abstract),
      keywords,
      format: r.file_url ? "PDF" : null,
      availability: digitalAvailability({ hasFile: Boolean(r.file_url), canDownload: Boolean(r.file_url) }),
      actions: {
        view: `/theses/${ref}`,
        read: r.file_url ? `/theses/${ref}#fulltext` : undefined,
        download: r.file_url ? `/api/theses/${r.id}/file?download=1` : undefined,
        cite: `/theses/${ref}#cite`,
        save: `/theses/${ref}#save`,
      },
      searchableText: [r.title, author, r.advisor_name, r.co_advisor_name, subject, r.abstract, keywords.join(" ")].filter(Boolean).join(" "),
      titleText: r.title,
      authorText: [author, r.advisor_name, r.co_advisor_name].filter(Boolean).join(" "),
      subjectText: subject,
      keywordText: keywords.join(" "),
      bodyText: r.abstract ?? "",
      dateValue: year ?? 0,
      popularityValue: (r.view_count ?? 0) + (r.download_count ?? 0),
    };
  }).filter((row: Candidate) => {
    if (filters.advisor) {
      const haystack = normalizeSearchText(row.authorText);
      if (!haystack.includes(normalizeSearchText(filters.advisor))) return false;
    }
    return filterCommon(row, filters);
  });

  return rankCandidates(candidates, prepared, pageHitIds, sort, count);
}

async function searchPublications(db: DB, rawQ: string, filters: Filters, limit: number, pageHitIds: Set<string>, sort: SearchSort, seedIds: string[] = []): Promise<PerTypeSearch> {
  const q = sanitize(rawQ);
  const prepared = prepareQuery(q);
  const tokens = tokenizeSearchQuery(q);

  const build = (or: string, rowLimit: number) => {
    let query: any = db
      .from("publications_with_stats")
      .select(
        // `*` rather than a column list: the access resolution below needs
        // allow_download / download_disabled_reason / fulltext_redistributable,
        // and naming a column a pre-0125 database has not got would fail the
        // whole publications leg of the search.
        "*",
        { count: "exact" },
      )
      .eq("is_published", true);
    if (or) query = query.or(or);

    if (filters.author) query = query.ilike("author_names", `%${filters.author}%`);
    if (filters.publisher) query = query.ilike("publisher", `%${filters.publisher}%`);
    if (filters.isbn) query = query.or([`isbn.ilike.%${sanitize(filters.isbn)}%`, ...isbnClauses(filters.isbn)].join(","));
    if (filters.format && normalizeSearchText(filters.format) !== "pdf") query = query.in("id", ["00000000-0000-0000-0000-000000000000"]);

    return query.order("view_count", { ascending: false }).limit(rowLimit);
  };

  const { data, count, error } = await fetchPools(
    build,
    orFilter(["title", "title_km", "abstract", "abstract_km", "author_names", "journal_name", "publisher", "isbn"], tokens),
    phraseFilter(["title", "title_km", "author_names"], prepared, filters, true, seedIds),
    limit,
  );
  if (error) {
    console.error("[native-search/publications]", error.message);
    return { data: [], count: 0, allCandidates: [] };
  }

  const candidates: Candidate[] = (data ?? []).map((p: any) => {
    const year = yearOf(p.publication_date) ?? yearOf(p.published_at) ?? yearOf(p.created_at);
    const keywords = cleanArray(p.keywords);
    const subjects = cleanArray(p.subjects);
    const subject = subjects[0] ?? p.journal_name ?? "Publication";
    const references = normalizePublicationReferences(p.references);
    const abstract = academicTextToPlainText(p.abstract, references);
    const abstractKm = academicTextToPlainText(p.abstract_km, references);
    // Offered only when the server would actually serve it. A search result
    // that links straight at ?download=1 for a read-online-only record hands
    // the reader a 403 — the same resolution the detail page and the download
    // route use decides it here too.
    const canDownload = resolveDownloadAccess({
      slug: p.slug,
      title: p.title,
      publisher: p.publisher ?? null,
      license: p.license ?? null,
      allow_download: p.allow_download,
      fulltext_redistributable: p.fulltext_redistributable,
      pdf_url: p.pdf_url,
    }).canDownload;
    return {
      id: p.id,
      ref: p.slug,
      type: "publication" as const,
      title: p.title,
      author: p.author_names ?? "Unknown",
      coverUrl: coverUrlOf(p.cover_url),
      url: `/publications/${p.slug}`,
      year,
      language: canonicalLanguage(p.language),
      category: p.article_type ?? "Publication",
      subject,
      isbn: p.isbn ?? null,
      publisher: p.publisher ?? p.journal_name ?? null,
      rating: null,
      views: p.view_count ?? 0,
      downloadCount: p.download_count ?? 0,
      excerpt: makeExcerpt(abstract || abstractKm),
      keywords: [...new Set([...keywords, ...subjects])],
      format: p.pdf_url ? "PDF" : null,
      availability: digitalAvailability({ hasFile: Boolean(p.pdf_url), canDownload }),
      actions: {
        view: `/publications/${p.slug}`,
        read: p.pdf_url ? `/publications/${p.slug}#fulltext` : undefined,
        download: canDownload ? `/api/publications/${p.slug}/file?download=1` : undefined,
        cite: `/publications/${p.slug}#cite-panel`,
        save: `/publications/${p.slug}#save`,
      },
      searchableText: [p.title, p.title_km, p.author_names, p.journal_name, p.publisher, abstract, abstractKm, keywords.join(" "), subjects.join(" ")].filter(Boolean).join(" "),
      titleText: [p.title, p.title_km].filter(Boolean).join(" "),
      authorText: p.author_names ?? "",
      subjectText: [subject, p.journal_name, subjects.join(" ")].filter(Boolean).join(" "),
      keywordText: [...keywords, ...subjects].join(" "),
      bodyText: [abstract, abstractKm].filter(Boolean).join(" "),
      dateValue: year ?? 0,
      popularityValue: (p.view_count ?? 0) + (p.download_count ?? 0),
    };
  }).filter((row: Candidate) => filterCommon(row, filters));

  return rankCandidates(candidates, prepared, pageHitIds, sort, count);
}

async function searchCatalog(db: DB, rawQ: string, filters: Filters, limit: number, pageHitIds: Set<string>, sort: SearchSort, seedIds: string[] = []): Promise<PerTypeSearch> {
  const q = sanitize(rawQ);
  const prepared = prepareQuery(q);
  const tokens = tokenizeSearchQuery(q);

  const build = (or: string, rowLimit: number) => {
    let query: any = db
      .from("catalog_books")
      .select("id, slug, title, cover_url, author, description, category, department, language, isbn, publisher, year, keywords, copies_available, copies_total, shelf_location, created_at", { count: "exact" })
      .eq("is_active", true);
    if (or) query = query.or(or);

    if (filters.author) query = query.ilike("author", `%${filters.author}%`);
    if (filters.isbn) query = query.or([`isbn.ilike.%${sanitize(filters.isbn)}%`, ...isbnClauses(filters.isbn)].join(","));
    if (filters.publisher) query = query.ilike("publisher", `%${filters.publisher}%`);
    if (filters.format && normalizeSearchText(filters.format) !== "print") query = query.in("id", ["00000000-0000-0000-0000-000000000000"]);

    return query.order("title", { ascending: true }).limit(rowLimit);
  };

  const { data, count, error } = await fetchPools(
    build,
    orFilter(["title", "author", "description", "category", "department", "isbn", "publisher"], tokens),
    phraseFilter(["title", "author", "category"], prepared, filters, true, seedIds),
    limit,
  );
  if (error) {
    console.error("[native-search/catalog]", error.message);
    return { data: [], count: 0, allCandidates: [] };
  }

  const candidates: Candidate[] = (data ?? []).map((r: any) => {
    const keywords = cleanArray(r.keywords);
    const hasCopyCounters = r.copies_total != null;
    return {
      id: r.id,
      ref: r.slug ?? r.id,
      type: "catalog" as const,
      title: r.title,
      author: r.author ?? "Unknown",
      coverUrl: coverUrlOf(r.cover_url),
      url: `/catalogs/${r.slug ?? r.id}`,
      year: r.year ?? yearOf(r.created_at),
      department: r.department ?? null,
      language: canonicalLanguage(r.language),
      category: r.category ?? "Physical Book",
      subject: r.category ?? r.department ?? "Physical Book",
      isbn: r.isbn ?? null,
      publisher: r.publisher ?? null,
      views: 0,
      downloadCount: 0,
      excerpt: makeExcerpt(r.description),
      keywords,
      format: "Print",
      availability: physicalAvailability({ copiesTotal: r.copies_total, copiesAvailable: r.copies_available }),
      copiesAvailable: hasCopyCounters ? (r.copies_available ?? 0) : null,
      copiesTotal: hasCopyCounters ? r.copies_total : null,
      shelfLocation: r.shelf_location?.trim() || null,
      actions: { view: `/catalogs/${r.slug ?? r.id}` },
      searchableText: [r.title, r.author, r.category, r.department, r.description, r.isbn, r.publisher, keywords.join(" ")].filter(Boolean).join(" "),
      titleText: r.title,
      authorText: r.author ?? "",
      subjectText: [r.category, r.department].filter(Boolean).join(" "),
      keywordText: keywords.join(" "),
      bodyText: r.description ?? "",
      dateValue: r.year ?? yearOf(r.created_at) ?? 0,
      popularityValue: r.copies_available ?? 0,
    };
  }).filter((row: Candidate) => filterCommon(row, filters));

  return rankCandidates(candidates, prepared, pageHitIds, sort, count);
}

async function searchPosts(db: DB, rawQ: string, filters: Filters, limit: number, pageHitIds: Set<string>, sort: SearchSort, seedIds: string[] = []): Promise<PerTypeSearch> {
  const q = sanitize(rawQ);
  const prepared = prepareQuery(q);
  const tokens = tokenizeSearchQuery(q);

  const build = (or: string, rowLimit: number) => {
    let query: any = db
      .from("posts")
      .select("id, slug, title, cover_url, excerpt, content, category, tags, views, created_at, updated_at", { count: "exact" })
      .eq("is_published", true);
    if (or) query = query.or(or);
    if (filters.format && normalizeSearchText(filters.format) !== "html") query = query.in("id", ["00000000-0000-0000-0000-000000000000"]);
    return query.order("created_at", { ascending: false }).limit(rowLimit);
  };

  const { data, count, error } = await fetchPools(
    build,
    orFilter(["title", "excerpt", "content", "category"], tokens),
    phraseFilter(["title"], prepared, filters, false, seedIds),
    limit,
  );
  if (error) {
    console.error("[native-search/posts]", error.message);
    return { data: [], count: 0, allCandidates: [] };
  }

  const candidates: Candidate[] = (data ?? []).map((p: any) => {
    const year = yearOf(p.created_at);
    const keywords = cleanArray(p.tags);
    return {
      id: p.id,
      ref: p.slug,
      type: "post" as const,
      title: p.title,
      author: "PTEC Library",
      coverUrl: coverUrlOf(p.cover_url),
      url: `/posts/${p.slug}`,
      year,
      category: p.category ?? "News",
      subject: p.category ?? "News",
      views: p.views ?? 0,
      downloadCount: 0,
      excerpt: makeExcerpt(p.excerpt ?? p.content),
      keywords,
      format: "HTML",
      availability: "read_online",
      actions: { view: `/posts/${p.slug}`, read: `/posts/${p.slug}` },
      searchableText: [p.title, p.category, p.excerpt, p.content, keywords.join(" ")].filter(Boolean).join(" "),
      titleText: p.title,
      authorText: "PTEC Library",
      subjectText: p.category ?? "News",
      keywordText: keywords.join(" "),
      bodyText: [p.excerpt, p.content].filter(Boolean).join(" "),
      dateValue: year ?? 0,
      popularityValue: p.views ?? 0,
    };
  }).filter((row: Candidate) => filterCommon(row, filters));

  return rankCandidates(candidates, prepared, pageHitIds, sort, count);
}

/** Path ids whose module/step text matches the query, so a path found only by
 *  a step title still enters the candidate pool (title/description match on the
 *  path row itself is handled by the main or-filter). */
async function matchingPathIdsFromSteps(db: DB, q: string): Promise<string[]> {
  if (q.length < 2) return [];
  try {
    const { data, error } = await db
      .from("learning_path_steps")
      .select("resource_title, instruction, learning_path_modules!inner(path_id, learning_paths!inner(is_published))")
      .eq("learning_path_modules.learning_paths.is_published", true)
      .or(`resource_title.ilike.%${q}%,instruction.ilike.%${q}%`)
      .limit(120);
    if (error) return [];
    return [
      ...new Set(
        (data ?? [])
          .map((r: any) => r.learning_path_modules?.path_id as string | undefined)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
  } catch {
    return [];
  }
}

async function searchLearningPaths(db: DB, rawQ: string, filters: Filters, limit: number, pageHitIds: Set<string>, sort: SearchSort, seedIds: string[] = []): Promise<PerTypeSearch> {
  // Learning paths have no format/print/pdf artifact — a format filter for any
  // other type excludes them entirely (mirrors posts/catalog self-exclusion).
  if (filters.format && normalizeSearchText(filters.format) !== "path") {
    return { data: [], count: 0, allCandidates: [] };
  }

  const q = sanitize(rawQ);
  const prepared = prepareQuery(q);
  const tokens = tokenizeSearchQuery(q);
  const stepPathIds = await matchingPathIdsFromSteps(db, q);
  const stepClause = stepPathIds.length ? `id.in.(${stepPathIds.join(",")})` : "";

  const build = (or: string, rowLimit: number) => {
    let query: any = db
      .from("learning_paths")
      .select(
        "id, slug, title, title_km, description, description_km, audience, cover_url, created_at, updated_at, learning_path_modules(title, title_km, learning_path_steps(resource_title, instruction, instruction_km, est_minutes))",
        { count: "exact" },
      )
      .eq("is_published", true);
    if (or) query = query.or(or);
    return query.order("position", { ascending: true }).limit(rowLimit);
  };

  const { data, count, error } = await fetchPools(
    build,
    [orFilter(["title", "title_km", "description", "description_km", "audience"], tokens), stepClause].filter(Boolean).join(","),
    [phraseFilter(["title", "title_km"], prepared, filters, false, seedIds), stepClause].filter(Boolean).join(","),
    limit,
  );
  if (error) {
    console.error("[native-search/learning_paths]", error.message);
    return { data: [], count: 0, allCandidates: [] };
  }

  const candidates: Candidate[] = (data ?? []).map((p: any) => {
    const modules = p.learning_path_modules ?? [];
    const steps = pathStepCount(modules);
    const moduleCount = pathModuleCount(modules);
    const durationMin = pathDurationMinutes(modules);
    const year = yearOf(p.created_at) ?? yearOf(p.updated_at);
    const title = [p.title, p.title_km].filter(Boolean).join(" ");
    const description = [p.description, p.description_km].filter(Boolean).join(" ");
    const subject = p.audience ?? "Learning Path";
    const stepText = pathBodyText(modules);
    return {
      id: p.id,
      ref: p.slug,
      type: "learning_path" as const,
      title: p.title,
      author: "PTEC Library",
      coverUrl: coverUrlOf(p.cover_url),
      url: `/paths/${p.slug}`,
      year,
      language: null,
      category: subject,
      subject,
      views: 0,
      downloadCount: 0,
      excerpt: makeExcerpt(p.description ?? p.description_km),
      keywords: [],
      format: "Path",
      availability: "read_online",
      pathSteps: steps,
      pathModules: moduleCount,
      pathDurationMin: durationMin,
      actions: { view: `/paths/${p.slug}` },
      searchableText: [title, description, subject, stepText].filter(Boolean).join(" "),
      titleText: title,
      authorText: "PTEC Library",
      subjectText: subject,
      keywordText: "",
      bodyText: [description, stepText].filter(Boolean).join(" "),
      dateValue: year ?? 0,
      popularityValue: steps,
    };
  }).filter((row: Candidate) => filterCommon(row, filters));

  return rankCandidates(candidates, prepared, pageHitIds, sort, count);
}

const FUZZY_URL: Record<SearchResultType, (ref: string) => string> = {
  book: (ref) => `/books/${ref}`,
  research: (ref) => `/theses/${ref}`,
  publication: (ref) => `/publications/${ref}`,
  catalog: (ref) => `/catalogs/${ref}`,
  learning_path: (ref) => `/paths/${ref}`,
  post: (ref) => `/posts/${ref}`,
};

async function fuzzySearch(db: DB, q: string, typeFilter?: SearchResultType, limit = 8): Promise<SearchResult[]> {
  const { data, error } = await db.rpc("search_library_fuzzy", {
    query_text: q,
    match_count: limit,
  });
  if (error) {
    console.error("[native-search/fuzzy]", error.message);
    return [];
  }

  return ((data ?? []) as any[])
    .filter((r) => r.source in FUZZY_URL && (!typeFilter || r.source === typeFilter))
    .map((r) => ({
      id: r.id,
      ref: r.ref,
      type: r.source as SearchResultType,
      title: r.title,
      author: r.author ?? "Unknown",
      coverUrl: coverUrlOf(r.cover_url),
      url: FUZZY_URL[r.source as SearchResultType](r.ref),
      category: r.category ?? null,
      subject: r.category ?? null,
      excerpt: makeExcerpt(r.excerpt),
      score: Math.round(Number(r.similarity ?? 0) * 100),
      matchedFields: ["title"],
      actions: { view: FUZZY_URL[r.source as SearchResultType](r.ref) },
    }));
}

async function searchPageContent(db: DB, q: string, limit = 6): Promise<PageHit[]> {
  if (q.length < 3) return [];
  try {
    const { data, error } = await db
      .from("book_pages")
      .select("record_type, record_id, page_no, content")
      .ilike("content", `%${q}%`)
      .order("page_no", { ascending: true })
      .limit(30);
    if (error || !data?.length) return [];

    const byRecord = new Map<string, (typeof data)[number]>();
    for (const row of data) {
      const key = `${row.record_type}:${row.record_id}`;
      if (!byRecord.has(key)) byRecord.set(key, row);
    }
    const picked = [...byRecord.values()].slice(0, limit);

    const bookIds = picked.filter((r) => r.record_type === "book").map((r) => r.record_id);
    const researchIds = picked.filter((r) => r.record_type === "research").map((r) => r.record_id);
    const publicationIds = picked.filter((r) => r.record_type === "publication").map((r) => r.record_id);

    const [{ data: books }, { data: theses }, { data: publications }] = await Promise.all([
      bookIds.length
        ? db.from("books").select("id, title, slug").in("id", bookIds).eq("is_published", true)
        : Promise.resolve({ data: [] as { id: string; title: string; slug: string }[] }),
      researchIds.length
        ? db.from("research_reports").select("id, slug, title").in("id", researchIds).eq("is_published", true)
        : Promise.resolve({ data: [] as { id: string; slug: string | null; title: string }[] }),
      publicationIds.length
        ? db.from("publications").select("id, slug, title").in("id", publicationIds).eq("is_published", true)
        : Promise.resolve({ data: [] as { id: string; slug: string; title: string }[] }),
    ]);

    const bookMap = new Map((books ?? []).map((b) => [b.id, b]));
    const researchMap = new Map((theses ?? []).map((r) => [r.id, r]));
    const publicationMap = new Map((publications ?? []).map((p) => [p.id, p]));

    const hits: PageHit[] = [];
    for (const row of picked) {
      if (row.record_type === "book") {
        const b = bookMap.get(row.record_id);
        if (b) hits.push({ recordType: "book", recordId: row.record_id, title: b.title, url: `/books/${b.slug}`, pageNo: row.page_no, snippet: makeSnippet(row.content, q), matchType: "exact" });
      } else if (row.record_type === "research") {
        const r = researchMap.get(row.record_id);
        if (r) hits.push({ recordType: "research", recordId: row.record_id, title: r.title, url: `/theses/${r.slug ?? row.record_id}`, pageNo: row.page_no, snippet: makeSnippet(row.content, q), matchType: "exact" });
      } else if (row.record_type === "publication") {
        const p = publicationMap.get(row.record_id);
        if (p) hits.push({ recordType: "publication", recordId: row.record_id, title: p.title, url: `/publications/${p.slug}`, pageNo: row.page_no, snippet: makeSnippet(row.content, q), matchType: "exact" });
      }
    }
    return hits;
  } catch (err) {
    console.error("[native-search/pages]", err);
    return [];
  }
}

// Semantic passages from inside PDFs (book_chunks, migration 0082): finds
// pages ABOUT the query even when its words never appear verbatim. Costs one
// Gemini query embedding per uncached all-tab search, so it is guarded: skips
// short queries and emergency mode, and fails open on quota/RPC/embed errors
// (the exact-match hits above still render).
const SEMANTIC_MIN_SIMILARITY = 0.35;
const SEMANTIC_SNIPPET_LEN = 230;

async function semanticPassages(db: DB, q: string, limit = 6): Promise<PageHit[]> {
  if (q.length < 4 || !process.env.GEMINI_API_KEY || isExpensiveSearchDisabled()) return [];
  try {
    const vec = await generateQueryEmbedding(q);
    const { data, error } = await db.rpc("match_book_chunks", {
      query_embedding: vec,
      match_count: limit * 2, // over-fetch: multiple chunks may share a record
      min_similarity: SEMANTIC_MIN_SIMILARITY,
    });
    if (error || !data?.length) return [];

    const hits: PageHit[] = [];
    const seen = new Set<string>();
    for (const r of data as any[]) {
      if (r.source !== "book" && r.source !== "research" && r.source !== "publication") continue;
      const key = `${r.source}:${r.record_id}`;
      if (seen.has(key)) continue; // rows arrive ordered by similarity — keep the best chunk
      seen.add(key);
      const text: string = r.content ?? "";
      const clipped = text.length > SEMANTIC_SNIPPET_LEN ? `${text.slice(0, SEMANTIC_SNIPPET_LEN).trim()}...` : text;
      hits.push({
        recordType: r.source as PageHit["recordType"],
        recordId: r.record_id,
        title: r.title,
        url: FUZZY_URL[r.source as SearchResultType](r.ref),
        pageNo: r.page_no,
        // Leading ellipsis: a chunk is an excerpt from mid-book by nature.
        snippet: `...${clipped}`,
        matchType: "semantic",
      });
      if (hits.length >= limit) break;
    }
    return hits;
  } catch (err) {
    console.error("[native-search/semantic]", err);
    return [];
  }
}

/** Exact hits first, then semantic passages for records not already listed. */
function mergePageHits(exact: PageHit[], semantic: PageHit[], cap = 6): PageHit[] {
  const seen = new Set(exact.map((h) => `${h.recordType}:${h.recordId}`));
  const merged = [...exact];
  for (const hit of semantic) {
    if (merged.length >= cap) break;
    const key = `${hit.recordType}:${hit.recordId}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(hit);
    }
  }
  return merged.slice(0, cap);
}

function parseType(value: string | null): ActiveSearchType {
  return value === "book" || value === "research" || value === "publication" || value === "catalog" || value === "learning_path" || value === "post"
    ? value
    : "all";
}

function numberParam(searchParams: URLSearchParams, key: string): number | undefined {
  const raw = searchParams.get(key);
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export async function GET(req: Request) {
  const ip = getClientIP(req);
  const { limit: rlLimit, windowMs } = ratePolicy("searchNative");
  if (!(await rateLimit(ip, rlLimit, windowMs)).success) {
    logSecurityEvent({ type: "rate_limited", where: "/api/search/native", ip });
    return Response.json({ error: "Too many requests." }, { status: 429 });
  }

  // Analytics context: obvious bots still get results but never enter the
  // query log; humans get a daily-rotating anonymous session hash (no raw
  // IP is ever stored — see lib/search/analytics.ts).
  const userAgent = req.headers.get("user-agent");
  const skipLogging = isLikelyBot(userAgent);
  const sessionHash = skipLogging
    ? null
    : anonymousSessionHash(ip, userAgent ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { searchParams } = new URL(req.url);
  const rawQ = searchParams.get("q")?.trim() ?? "";
  if (!rawQ || rawQ.length > 300) {
    return Response.json({ error: "Missing or invalid query." }, { status: 400 });
  }

  const q = sanitize(rawQ);
  if (!q) return Response.json({ error: "Missing or invalid query." }, { status: 400 });

  // Classify the raw query against known attack shapes. This is the library's
  // largest public input surface, so it is where injection probing actually
  // shows up. Recording is all that happens here — `sanitize()` above already
  // neutralised the input, and one match is NOT an incident (a database
  // textbook search legitimately contains "UNION SELECT"): the detector needs
  // several matches of the same signature class before it opens one.
  //
  // Only the class is stored, never the query text.
  const signatures = classifySignatures(rawQ);
  if (signatures.length) {
    logSecurityEvent({
      type: "injection_pattern",
      where: "/api/search/native",
      ip,
      target: signatures[0],
      detail: `search query matched ${signatures.length} signature class(es)`,
      metadata: { signature: signatures[0], signatureCount: signatures.length },
    });
  }

  const type = parseType(searchParams.get("resourceType") ?? searchParams.get("type"));
  const sort = parseSort(searchParams.get("sort"));
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const filters: Filters = {
    dept: searchParams.get("dept") ?? undefined,
    author: searchParams.get("author") ?? undefined,
    advisor: searchParams.get("advisor") ?? undefined,
    program: searchParams.get("program") ?? undefined,
    cohort: searchParams.get("cohort") ?? undefined,
    format: searchParams.get("format") ?? undefined,
    isbn: searchParams.get("isbn") ?? undefined,
    publisher: searchParams.get("publisher") ?? undefined,
    minViews: numberParam(searchParams, "views"),
    minDownloads: numberParam(searchParams, "downloads"),
    minRating: numberParam(searchParams, "rating"),
  };

  const selections: FacetSelections = parseFacetSelections((key) => searchParams.get(key));
  // Old links and the advanced modal's umbrella "digital" map onto the
  // canonical vocabulary (lib/search/availability.ts).
  selections.availability = canonicalAvailabilitySelection(selections.availability);
  const hasFilters =
    Object.values(filters).some((value) => value !== undefined && value !== "") || hasAnySelection(selections);

  const cacheKey = JSON.stringify({ q, type, sort, page, filters, selections });
  const cached = cacheGet(cacheKey);
  if (cached) {
    // With facets active, cached counts.total is post-filter — not the "does
    // the library have this" signal — so those repeats go unlogged (45s TTL).
    if (type === "all" && page === 1 && !hasFilters && !skipLogging) {
      const dbForLog = createServiceClient();
      logSearchQuery(dbForLog, q, cached.counts.total, type, sort, sessionHash);
    }
    return Response.json(cached, { headers: { "Cache-Control": "public, s-maxage=45, stale-while-revalidate=120" } });
  }

  const db = createServiceClient();

  try {
    const [pageHits, seeds] = await Promise.all([searchPageContent(db, q), fuzzyCandidateIds(db, q)]);
    const pageHitIds = new Set(pageHits.map((hit) => pageHitKey(hit.recordType, hit.recordId)));
    const candidateLimit = type === "all" ? CANDIDATE_LIMIT_ALL : CANDIDATE_LIMIT_TYPE;

    // Trigram seeds belong to the query as typed; a synonym re-run gets none.
    const seedsFor = (t: SearchResultType, qx: string) => (qx === q ? seeds[t] : []);
    const run = {
      book: (qx: string = q) => searchBooks(db, qx, filters, candidateLimit, pageHitIds, sort, seedsFor("book", qx)),
      research: (qx: string = q) => searchResearch(db, qx, filters, candidateLimit, pageHitIds, sort, seedsFor("research", qx)),
      publication: (qx: string = q) => searchPublications(db, qx, filters, candidateLimit, pageHitIds, sort, seedsFor("publication", qx)),
      catalog: (qx: string = q) => searchCatalog(db, qx, filters, candidateLimit, pageHitIds, sort, seedsFor("catalog", qx)),
      learning_path: (qx: string = q) => searchLearningPaths(db, qx, filters, candidateLimit, pageHitIds, sort, seedsFor("learning_path", qx)),
      post: (qx: string = q) => searchPosts(db, qx, filters, candidateLimit, pageHitIds, sort, seedsFor("post", qx)),
    } satisfies Record<SearchResultType, (qx?: string) => Promise<PerTypeSearch>>;

    let response: NativeSearchResponse;

    if (type === "all") {
      // Semantic passages ride along with the type searches (no added latency);
      // they don't feed pageHitIds scoring — only the rendered hit list.
      const [books, research, publications, catalog, learningPaths, posts, semantic] = await Promise.all([
        run.book(),
        run.research(),
        run.publication(),
        run.catalog(),
        run.learning_path(),
        run.post(),
        semanticPassages(db, q),
      ]);
      const mergedPageHits = mergePageHits(pageHits, semantic);

      const byType: Record<SearchResultType, PerTypeSearch> = {
        book: books,
        research,
        publication: publications,
        catalog,
        learning_path: learningPaths,
        post: posts,
      };
      const typeIds = Object.keys(byType) as SearchResultType[];
      const unionCandidates = typeIds.flatMap((t) => byType[t].allCandidates);
      const allCandidates = [...unionCandidates].sort((a, b) => compareBySort(a, b, sort));

      // Facet counts come from the candidate pool already in hand — grouped in
      // memory, never one query per facet value.
      const facetCounts = buildFacetCounts(unionCandidates, selections);

      // Exact DB counts stay authoritative until an in-memory facet narrows the
      // pool; then the honest number is how many candidates survived.
      const nonTypeActive = hasNonTypeSelection(selections);
      const typeCountOf = (t: SearchResultType): number =>
        nonTypeActive
          ? byType[t].allCandidates.filter((c) => matchesFacets(c, selections, "types")).length
          : byType[t].count;
      const activeTypes = selections.types.length
        ? typeIds.filter((t) => selections.types.some((v) => v.toLowerCase() === t))
        : typeIds;
      // Demand signal for the zero-result report: "does the library have
      // anything for this term at all", independent of active facets.
      const preFacetTotal = typeIds.reduce((sum, t) => sum + byType[t].count, 0);

      const counts: SearchCounts = {
        book: typeCountOf("book"),
        research: typeCountOf("research"),
        publication: typeCountOf("publication"),
        catalog: typeCountOf("catalog"),
        learning_path: typeCountOf("learning_path"),
        post: typeCountOf("post"),
        total: activeTypes.reduce((sum, t) => sum + typeCountOf(t), 0),
      };

      const results = activeTypes.flatMap((t) =>
        byType[t].allCandidates.filter((c) => matchesFacets(c, selections)).slice(0, PAGE_SIZE_ALL),
      );

      if (counts.total === 0 && !hasFilters) {
        // Librarian-curated synonyms first (0087): a reviewed mapping beats a
        // fuzzy guess. Only fires on zero results, so normal ranking is
        // untouched. Logged with the recovered count — the term is no longer
        // "missing content", which keeps the acquisition report clean.
        for (const alt of await synonymAlternatives(db, q)) {
          const [b2, r2, p2, c2, l2, s2] = await Promise.all([
            run.book(alt), run.research(alt), run.publication(alt), run.catalog(alt), run.learning_path(alt), run.post(alt),
          ]);
          const altResults = [b2, r2, p2, c2, l2, s2].flatMap((t) => t.allCandidates.slice(0, PAGE_SIZE_ALL));
          if (altResults.length > 0) {
            response = {
              results: altResults,
              counts: countsOf(altResults),
              page: 1,
              hasMore: false,
              fuzzy: true,
              didYouMean: alt,
              pageHits: mergedPageHits,
              facets: facetsOf(altResults),
              facetCounts: buildFacetCounts(altResults, selections),
              relatedSubjects: facetsOf(altResults).subjects.slice(0, 8),
              popularResources: [],
              sort,
            };
            if (!skipLogging) logSearchQuery(db, q, altResults.length, type, sort, sessionHash);
            cacheSet(cacheKey, response);
            return Response.json(response);
          }
        }

        const fuzzy = await fuzzySearch(db, q);
        if (fuzzy.length > 0) {
          response = {
            results: fuzzy,
            counts: countsOf(fuzzy),
            page: 1,
            hasMore: false,
            fuzzy: true,
            didYouMean: fuzzy[0]?.title ?? null,
            pageHits: mergedPageHits,
            facets: facetsOf(fuzzy),
            facetCounts: buildFacetCounts(fuzzy, selections),
            relatedSubjects: facetsOf(fuzzy).subjects.slice(0, 8),
            popularResources: [],
            sort,
          };
          if (!skipLogging) logSearchQuery(db, q, 0, type, sort, sessionHash);
          cacheSet(cacheKey, response);
          return Response.json(response);
        }
      }

      // Curated pins (0087): librarian-selected results render first for
      // this exact term; organic duplicates of the same URL are dropped.
      const curated = page === 1 && !hasFilters ? await curatedResultsFor(db, q) : [];

      response = {
        results: withCurated(curated, results),
        counts,
        page: 1,
        hasMore: false,
        pageHits: mergedPageHits,
        facets: facetsOf(allCandidates),
        facetCounts,
        relatedSubjects: facetsOf(allCandidates).subjects.slice(0, 8),
        popularResources: allCandidates.slice(0, 5),
        sort,
      };
      if (!skipLogging) logSearchQuery(db, q, preFacetTotal, type, sort, sessionHash);
    } else {
      const result = await run[type]();
      const sorted = result.allCandidates.sort((a, b) => compareBySort(a, b, sort));
      // On a type tab the `types` dimension is meaningless — the tab already
      // fixes the type — so it is excluded from both matching and counting.
      const facetCounts = buildFacetCounts(sorted, selections);
      const facetFiltered = hasNonTypeSelection(selections)
        ? sorted.filter((c) => matchesFacets(c, selections, "types"))
        : sorted;
      const effectiveCount = hasNonTypeSelection(selections) ? facetFiltered.length : result.count;
      const from = (page - 1) * PAGE_SIZE_TYPE;
      let pageResults = facetFiltered.slice(from, from + PAGE_SIZE_TYPE);
      let fuzzy = false;
      let didYouMean: string | null = null;

      if (result.count === 0 && page === 1 && !hasFilters) {
        const fuzzyMatches = await fuzzySearch(db, q, type, PAGE_SIZE_TYPE);
        if (fuzzyMatches.length > 0) {
          pageResults = fuzzyMatches;
          fuzzy = true;
          didYouMean = fuzzyMatches[0]?.title ?? null;
        }
      }

      const counts: SearchCounts = {
        book: type === "book" ? effectiveCount : 0,
        research: type === "research" ? effectiveCount : 0,
        publication: type === "publication" ? effectiveCount : 0,
        catalog: type === "catalog" ? effectiveCount : 0,
        learning_path: type === "learning_path" ? effectiveCount : 0,
        post: type === "post" ? effectiveCount : 0,
        total: effectiveCount,
      };

      response = {
        results: pageResults,
        counts: fuzzy ? countsOf(pageResults) : counts,
        page,
        hasMore: !fuzzy && effectiveCount > page * PAGE_SIZE_TYPE,
        fuzzy,
        didYouMean,
        pageHits: [],
        facets: facetsOf(sorted),
        facetCounts,
        relatedSubjects: facetsOf(sorted).subjects.slice(0, 8),
        popularResources: sorted.slice(0, 5),
        sort,
      };
    }

    cacheSet(cacheKey, response);
    return Response.json(response, { headers: { "Cache-Control": "public, s-maxage=45, stale-while-revalidate=120" } });
  } catch (err) {
    console.error("[native-search] error:", err);
    return Response.json({ error: "Search failed. Please try again." }, { status: 500 });
  }
}
