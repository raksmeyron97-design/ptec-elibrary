// Native full-text search across books, research reports, catalog, and posts.
// Uses Postgres trigram ILIKE (indexes already exist on key columns).
// This is separate from /api/search which is the AI semantic "Ask Library" endpoint.

import { createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE_ALL = 4;   // results per type in "all" view (16 max total)
const PAGE_SIZE_TYPE = 10; // results per page in type-specific view
const COVERS_URL = process.env.NEXT_PUBLIC_R2_COVERS_URL ?? "";
const RATE_PER_MIN = 30;   // per-IP, no AI cost so we can be generous

// ── Types ─────────────────────────────────────────────────────────────────────

export type SearchResultType = "book" | "research" | "catalog" | "post";

export type SearchResult = {
  id: string;
  type: SearchResultType;
  title: string;
  author: string;
  coverUrl: string | null;
  url: string;
  year?: number | null;
  department?: string | null;
  language?: string | null;
  category?: string | null;
  isbn?: string | null;
  publisher?: string | null;
  rating?: number | null;
  excerpt?: string | null;
  downloadCount?: number;
};

export type SearchCounts = {
  book: number;
  research: number;
  catalog: number;
  post: number;
  total: number;
};

export type NativeSearchResponse = {
  results: SearchResult[];
  counts: SearchCounts;
  page: number;
  hasMore: boolean;
  /** True when exact search found nothing and these are trigram close matches. */
  fuzzy?: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function coverUrlOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.startsWith("http") ? raw : `${COVERS_URL}/${raw}`;
}

function sanitize(raw: string): string {
  return raw.replace(/[%_\\]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(q: string): string[] {
  const words = q.split(/\s+/).filter((w) => w.length >= 2);
  return Array.from(new Set([q, ...words])).slice(0, 5);
}

function orFilter(fields: string[], tokens: string[]): string {
  const clauses: string[] = [];
  for (const tok of tokens)
    for (const f of fields)
      clauses.push(`${f}.ilike.%${tok}%`);
  return clauses.join(",");
}

function yearOf(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const y = new Date(dateStr).getFullYear();
  return isNaN(y) ? null : y;
}

function makeExcerpt(text: string | null | undefined, len = 150): string | null {
  if (!text) return null;
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= len ? clean : clean.slice(0, len) + "…";
}

function getClientIP(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Best-effort log for "popular searches" — never fails the request. */
async function logSearchQuery(db: DB, term: string): Promise<void> {
  try {
    await db.from("search_queries").insert({ term });
  } catch (err) {
    console.error("[native-search] query log failed:", err);
  }
}

// ── Per-table searchers ───────────────────────────────────────────────────────

type DB = ReturnType<typeof createServiceClient>;

async function searchBooks(
  db: DB,
  tokens: string[],
  limit: number,
  from = 0,
  dept?: string,
  lang?: string,
  category?: string,
  author?: string,
  isbn?: string,
  publisher?: string,
): Promise<{ data: SearchResult[]; count: number }> {
  const authorsJoin = category || author ? "authors!inner(name)" : "authors(name)";
  const categoriesJoin = category ? "categories!inner(name)" : "categories(name)";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = db
    .from("books")
    .select(
      `id, slug, title, cover_url, description, language, published_at, rating, download_count, department, isbn, publisher, reviews(count), ${authorsJoin}, ${categoriesJoin}`,
      { count: "exact" }
    )
    .eq("is_published", true)
    .or(orFilter(["title", "description"], tokens));

  if (dept) q = q.eq("department", dept);
  if (lang) q = q.eq("language", lang);
  if (category) q = q.eq("categories.name", category);
  if (author) q = q.ilike("authors.name", `%${author}%`);
  if (isbn) q = q.ilike("isbn", `%${isbn.trim()}%`);
  if (publisher) q = q.ilike("publisher", `%${publisher}%`);

  const { data, count, error } = await q
    .order("download_count", { ascending: false })
    .range(from, from + limit - 1);

  if (error) {
    console.error("[native-search/books]", error.message);
    return { data: [], count: 0 };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: SearchResult[] = (data ?? []).map((r: any) => ({
    id: r.id,
    type: "book" as const,
    title: r.title,
    author: r.authors?.name ?? "Unknown",
    coverUrl: coverUrlOf(r.cover_url),
    url: `/books/${r.slug}`,
    year: yearOf(r.published_at),
    department: r.department ?? null,
    language: r.language ?? null,
    category: r.categories?.name ?? null,
    isbn: r.isbn ?? null,
    publisher: r.publisher ?? null,
    // Only surface a rating when real reviews exist — the column default (5)
    // must never render as social proof for an unreviewed book.
    rating: (r.reviews?.[0]?.count ?? 0) > 0 && r.rating ? Number(r.rating) : null,
    excerpt: makeExcerpt(r.description),
    downloadCount: r.download_count ?? 0,
  }));

  return { data: results, count: count ?? 0 };
}

async function searchResearch(
  db: DB,
  tokens: string[],
  limit: number,
  from = 0,
  category?: string,
  author?: string,
): Promise<{ data: SearchResult[]; count: number }> {
  let q = db
    .from("research_reports")
    .select(
      "id, title, cover_url, abstract, author_names, program, academic_year, view_count",
      { count: "exact" }
    )
    .eq("is_published", true)
    .or(orFilter(["title", "abstract", "author_names"], tokens));

  if (category) q = q.eq("program", category);
  if (author) q = q.ilike("author_names", `%${author}%`);

  const { data, count, error } = await q
    .order("view_count", { ascending: false })
    .range(from, from + limit - 1);

  if (error) {
    console.error("[native-search/research]", error.message);
    return { data: [], count: 0 };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: SearchResult[] = (data ?? []).map((r: any) => {
    const ayRaw: string = r.academic_year ?? "";
    const year = ayRaw ? parseInt(ayRaw.split("/")[0] ?? ayRaw, 10) || null : null;
    return {
      id: r.id,
      type: "research" as const,
      title: r.title,
      author: r.author_names ?? "Unknown",
      coverUrl: coverUrlOf(r.cover_url),
      url: `/theses/${r.id}`,
      year,
      category: r.program ?? null,
      excerpt: makeExcerpt(r.abstract),
    };
  });

  return { data: results, count: count ?? 0 };
}

async function searchCatalog(
  db: DB,
  tokens: string[],
  limit: number,
  from = 0,
  category?: string,
  author?: string,
  isbn?: string,
  publisher?: string,
): Promise<{ data: SearchResult[]; count: number }> {
  let q = db
    .from("catalog_books")
    .select(
      "id, slug, title, cover_url, author, description, category, isbn, publisher",
      { count: "exact" }
    )
    .eq("is_active", true)
    .or(orFilter(["title", "author", "description"], tokens));

  if (category) q = q.eq("category", category);
  if (author) q = q.ilike("author", `%${author}%`);
  if (isbn) q = q.ilike("isbn", `%${isbn.trim()}%`);
  if (publisher) q = q.ilike("publisher", `%${publisher}%`);

  const { data, count, error } = await q
    .order("title", { ascending: true })
    .range(from, from + limit - 1);

  if (error) {
    console.error("[native-search/catalog]", error.message);
    return { data: [], count: 0 };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: SearchResult[] = (data ?? []).map((r: any) => ({
    id: r.id,
    type: "catalog" as const,
    title: r.title,
    author: r.author ?? "Unknown",
    coverUrl: coverUrlOf(r.cover_url),
    url: `/catalogs/${r.slug ?? r.id}`,
    category: r.category ?? "Physical Book",
    isbn: r.isbn ?? null,
    publisher: r.publisher ?? null,
    excerpt: makeExcerpt(r.description),
  }));

  return { data: results, count: count ?? 0 };
}

async function searchPosts(
  db: DB,
  tokens: string[],
  limit: number,
  from = 0,
  category?: string,
): Promise<{ data: SearchResult[]; count: number }> {
  let q = db
    .from("posts")
    .select(
      "id, slug, title, cover_url, excerpt, category, created_at",
      { count: "exact" }
    )
    .eq("is_published", true)
    .or(orFilter(["title", "excerpt"], tokens));

  if (category) q = q.eq("category", category);

  const { data, count, error } = await q
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);

  if (error) {
    console.error("[native-search/posts]", error.message);
    return { data: [], count: 0 };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: SearchResult[] = (data ?? []).map((r: any) => ({
    id: r.id,
    type: "post" as const,
    title: r.title,
    author: "",
    coverUrl: coverUrlOf(r.cover_url),
    url: `/posts/${r.slug}`,
    year: yearOf(r.created_at),
    category: r.category ?? "News",
    excerpt: makeExcerpt(r.excerpt),
  }));

  return { data: results, count: count ?? 0 };
}

// ── Fuzzy fallback (typo tolerance) ───────────────────────────────────────────
// Only runs when exact ILIKE search returns zero rows and no filters are
// active. Trigram word_similarity handles misspellings in both Khmer and
// English (migration 0059_fuzzy_search.sql).

const FUZZY_URL: Record<string, (ref: string) => string> = {
  book: (ref) => `/books/${ref}`,
  research: (ref) => `/theses/${ref}`,
  catalog: (ref) => `/catalogs/${ref}`,
  post: (ref) => `/posts/${ref}`,
};

async function fuzzySearch(
  db: DB,
  q: string,
  typeFilter?: SearchResultType,
  limit = 8,
): Promise<SearchResult[]> {
  const { data, error } = await db.rpc("search_library_fuzzy", {
    query_text: q,
    match_count: limit,
  });
  if (error) {
    console.error("[native-search/fuzzy]", error.message);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[])
    .filter((r) => r.source in FUZZY_URL && (!typeFilter || r.source === typeFilter))
    .map((r) => ({
      id: r.id,
      type: r.source as SearchResultType,
      title: r.title,
      author: r.author ?? "Unknown",
      coverUrl: coverUrlOf(r.cover_url),
      url: FUZZY_URL[r.source](r.ref),
      category: r.category ?? null,
      excerpt: makeExcerpt(r.excerpt),
    }));
}

function countsOf(results: SearchResult[]): SearchCounts {
  const counts: SearchCounts = { book: 0, research: 0, catalog: 0, post: 0, total: results.length };
  for (const r of results) counts[r.type] += 1;
  return counts;
}

// ── GET /api/search/native ─────────────────────────────────────────────────────

export async function GET(req: Request) {
  const ip = getClientIP(req);
  if (!(await rateLimit(ip, RATE_PER_MIN, 60_000)).success) {
    return Response.json({ error: "Too many requests." }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const rawQ = searchParams.get("q")?.trim() ?? "";
  if (!rawQ || rawQ.length > 300) {
    return Response.json({ error: "Missing or invalid query." }, { status: 400 });
  }

  const type = (searchParams.get("type") ?? "all") as "all" | SearchResultType;
  const dept = searchParams.get("dept") ?? undefined;
  const lang = searchParams.get("lang") ?? undefined;
  const category = searchParams.get("category") ?? undefined;
  const author = searchParams.get("author") ?? undefined;
  const isbn = searchParams.get("isbn") ?? undefined;
  const publisher = searchParams.get("publisher") ?? undefined;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));

  const q = sanitize(rawQ);
  const tokens = tokenize(q);
  const db = createServiceClient();

  try {
    if (type === "all") {
      const [books, research, catalog, posts] = await Promise.all([
        searchBooks(db, tokens, PAGE_SIZE_ALL, 0, dept, lang, category, author, isbn, publisher),
        searchResearch(db, tokens, PAGE_SIZE_ALL, 0, category, author),
        searchCatalog(db, tokens, PAGE_SIZE_ALL, 0, category, author, isbn, publisher),
        searchPosts(db, tokens, PAGE_SIZE_ALL, 0, category),
        logSearchQuery(db, q),
      ]);

      const counts: SearchCounts = {
        book: books.count,
        research: research.count,
        catalog: catalog.count,
        post: posts.count,
        total: books.count + research.count + catalog.count + posts.count,
      };

      const results = [
        ...books.data,
        ...research.data,
        ...catalog.data,
        ...posts.data,
      ];

      // Zero exact matches with no filters active → try trigram close matches
      // so a typo (Khmer or English) doesn't dead-end the search page.
      const hasFilters = Boolean(dept || lang || category || author || isbn || publisher);
      if (counts.total === 0 && !hasFilters) {
        const fuzzy = await fuzzySearch(db, q);
        if (fuzzy.length > 0) {
          return Response.json({
            results: fuzzy,
            counts: countsOf(fuzzy),
            page: 1,
            hasMore: false,
            fuzzy: true,
          } satisfies NativeSearchResponse);
        }
      }

      return Response.json({ results, counts, page: 1, hasMore: false } satisfies NativeSearchResponse);
    }

    // Type-specific paginated view
    const from = (page - 1) * PAGE_SIZE_TYPE;
    let result: { data: SearchResult[]; count: number } = { data: [], count: 0 };

    if (type === "book")     result = await searchBooks(db, tokens, PAGE_SIZE_TYPE, from, dept, lang, category, author, isbn, publisher);
    else if (type === "research") result = await searchResearch(db, tokens, PAGE_SIZE_TYPE, from, category, author);
    else if (type === "catalog")  result = await searchCatalog(db, tokens, PAGE_SIZE_TYPE, from, category, author, isbn, publisher);
    else if (type === "post")     result = await searchPosts(db, tokens, PAGE_SIZE_TYPE, from, category);

    const hasFilters = Boolean(dept || lang || category || author || isbn || publisher);
    if (result.count === 0 && page === 1 && !hasFilters) {
      const fuzzy = await fuzzySearch(db, q, type, PAGE_SIZE_TYPE);
      if (fuzzy.length > 0) {
        return Response.json({
          results: fuzzy,
          counts: countsOf(fuzzy),
          page: 1,
          hasMore: false,
          fuzzy: true,
        } satisfies NativeSearchResponse);
      }
    }

    const counts: SearchCounts = {
      book:     type === "book"     ? result.count : 0,
      research: type === "research" ? result.count : 0,
      catalog:  type === "catalog"  ? result.count : 0,
      post:     type === "post"     ? result.count : 0,
      total: result.count,
    };

    return Response.json({
      results: result.data,
      counts,
      page,
      hasMore: result.count > page * PAGE_SIZE_TYPE,
    } satisfies NativeSearchResponse);
  } catch (err) {
    console.error("[native-search] error:", err);
    return Response.json({ error: "Search failed. Please try again." }, { status: 500 });
  }
}
