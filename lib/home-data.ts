// lib/home-data.ts
// Cached data fetchers for the public homepage sections.
//
// All of this data is public (is_published = true only) and identical for
// every visitor, so it is fetched with the service client (no cookie access —
// cookie reads would opt the whole route out of caching) and memoised with
// unstable_cache for 5 minutes, same pattern as lib/collection-stats.ts.
//
// Per-user data (auth state, ContinueReading) must NOT move here.
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { mapRowToBook, BOOK_SELECT, type Book } from "@/lib/books";
import {
  academicTextToPlainText,
  normalizePublicationReferences,
} from "@/lib/publications/citations";
import type { PublicationReference } from "@/lib/publications";

const REVALIDATE = 300; // seconds

// ── Trending books (hero stack + featured + browse tabs) ──────────────────
export const getTrendingBooksCached = unstable_cache(
  async (): Promise<Book[]> => {
    const db = createServiceClient();
    const { data, error } = await db
      .from("books")
      .select(BOOK_SELECT)
      .eq("is_published", true)
      .order("download_count", { ascending: false })
      .limit(12);
    if (error) {
      console.error("[home-data] trending books:", error.message);
      return [];
    }
    return (data ?? []).map(mapRowToBook);
  },
  ["home-trending-books"],
  { revalidate: REVALIDATE, tags: ["home-books"] }
);

// ── Trending search terms (top categories by activity) ────────────────────
export const getTrendingTermsCached = unstable_cache(
  async (): Promise<string[]> => {
    const db = createServiceClient();
    // Bounded candidate pool: the top-400 most-downloaded books decide the
    // ranking — the previous unbounded select grew with the whole library.
    const { data, error } = await db
      .from("books")
      .select("view_count, download_count, categories!inner(name)")
      .eq("is_published", true)
      .not("category_id", "is", null)
      .order("download_count", { ascending: false, nullsFirst: false })
      .limit(400);

    if (error || !data?.length) {
      if (error) console.error("[home-data] trending terms:", error.message);
      return ["Pedagogy", "Mathematics", "Khmer Literature", "Science", "English"];
    }

    const scoreMap = new Map<string, number>();
    for (const row of data) {
      const cat = row.categories as unknown as { name: string } | null;
      if (!cat?.name) continue;
      const score = (row.view_count ?? 0) + (row.download_count ?? 0) * 3;
      scoreMap.set(cat.name, (scoreMap.get(cat.name) ?? 0) + score);
    }

    return [...scoreMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => name);
  },
  ["home-trending-terms"],
  { revalidate: REVALIDATE, tags: ["home-books"] }
);

// ── Department tiles with counts (CategoryGrid) ────────────────────────────
export const getDepartmentCountsCached = unstable_cache(
  async (): Promise<{ name: string; count: number }[]> => {
    const db = createServiceClient();
    const { data, error } = await db
      .from("books")
      .select("departments!inner(name)")
      .eq("is_published", true);
    if (error) {
      console.error("[home-data] department counts:", error.message);
      return [];
    }
    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      const name = (row.departments as unknown as { name: string } | null)?.name;
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    // Cap is a LAYOUT bound, not an editorial one. It used to be 7, which
    // silently dropped the library's 8th department and made the subject
    // counts on the homepage sum to 111 against a collection of 112 books —
    // an arithmetic gap a reader can see and nobody could explain. 12 fits the
    // 3-column grid at four rows; past that the "All subjects" tile is the
    // honest overflow, not a truncated list that still looks complete.
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  },
  ["home-department-counts"],
  { revalidate: REVALIDATE, tags: ["home-books"] }
);

// ── Recently added + department shelves (BrowseBooksSection) ───────────────
export const getRecentlyAddedCached = unstable_cache(
  async (): Promise<Book[]> => {
    const db = createServiceClient();
    const { data, error } = await db
      .from("books")
      .select(BOOK_SELECT)
      .eq("is_published", true)
      // "Recently added" = when the book joined the library (created_at), not
      // its publication year — published_at is NULL for undated imports.
      .order("created_at", { ascending: false })
      .limit(12);
    if (error) {
      console.error("[home-data] recently added:", error.message);
      return [];
    }
    return (data ?? []).map(mapRowToBook);
  },
  ["home-recently-added"],
  { revalidate: REVALIDATE, tags: ["home-books"] }
);

export const getDeptBooksCached = unstable_cache(
  async (): Promise<{ depts: string[]; deptBooks: Record<string, Book[]> }> => {
    const db = createServiceClient();
    const { data, error } = await db
      .from("books")
      .select(BOOK_SELECT)
      .eq("is_published", true)
      .order("download_count", { ascending: false })
      .limit(60);
    if (error) {
      console.error("[home-data] dept books:", error.message);
      return { depts: [], deptBooks: {} };
    }
    const books = (data ?? []).map(mapRowToBook);
    const deptMap = new Map<string, Book[]>();
    for (const book of books) {
      const dept = book.department;
      if (dept && dept !== "General") {
        if (!deptMap.has(dept)) deptMap.set(dept, []);
        const arr = deptMap.get(dept)!;
        if (arr.length < 12) arr.push(book);
      }
    }
    return {
      depts: [...deptMap.keys()].slice(0, 6),
      deptBooks: Object.fromEntries(deptMap.entries()),
    };
  },
  ["home-dept-books"],
  { revalidate: REVALIDATE, tags: ["home-books"] }
);

// ── Trending theses (TrendingResearch) ─────────────────────────────────────
export type TrendingThesisRow = {
  id: string;
  slug: string | null;
  title: string;
  author_names: string | null;
  cohort: string | null;
  cover_url: string | null;
  view_count: number | null;
  download_count: number | null;
  score: number;
};

export const getTrendingThesesCached = unstable_cache(
  async (): Promise<TrendingThesisRow[]> => {
    const db = createServiceClient();
    const { data, error } = await db
      .from("research_reports")
      .select("id, slug, title, author_names, cohort, cover_url, view_count, download_count")
      .eq("is_published", true)
      .order("view_count", { ascending: false, nullsFirst: false })
      .limit(30);
    if (error) {
      console.error("[home-data] trending theses:", error.message);
      return [];
    }
    return (data ?? [])
      .map((r) => ({
        ...r,
        score: (r.view_count ?? 0) + (r.download_count ?? 0) * 3,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  },
  ["home-trending-theses"],
  { revalidate: REVALIDATE, tags: ["home-theses"] }
);

// ── Featured publications rail ──────────────────────────────────────────────

// The homepage card clamps the abstract to 3 lines *visually* (line-clamp),
// but CSS clamping still ships the full text in the HTML — a real abstract
// measured 7.6 KB on the homepage. Truncate server-side so the homepage only
// ever promotes the publication; the full abstract lives on the detail page.
// 240 chars ≈ 3 lines at the card's measure. Latin text cuts at a word
// boundary; Khmer has no spaces, so a plain slice is correct there.
const EXCERPT_CHARS = 240;

function toExcerpt(text: string | null): string | null {
  if (!text) return text;
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= EXCERPT_CHARS) return clean;
  const slice = clean.slice(0, EXCERPT_CHARS);
  const lastSpace = slice.lastIndexOf(" ");
  return `${lastSpace > EXCERPT_CHARS - 40 ? slice.slice(0, lastSpace) : slice}…`;
}

export type FeaturedPubRow = {
  id: string;
  slug: string | null;
  title: string;
  title_km: string | null;
  article_type: string;
  journal_name: string | null;
  doi: string | null;
  publication_date: string | null;
  abstract: string | null;
  abstract_km: string | null;
  references: PublicationReference[];
  author_names: string | null;
};

export const getFeaturedPublicationsCached = unstable_cache(
  async (): Promise<FeaturedPubRow[]> => {
    const db = createServiceClient();
    const { data, error } = await db
      .from("publications_with_stats")
      .select(
        "id, slug, title, title_km, article_type, journal_name, doi, publication_date, abstract, abstract_km, references, author_names"
      )
      .eq("is_published", true)
      .order("publication_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(4);
    if (error) {
      // Publications table may not exist yet on older deployments — hide the
      // section rather than break the homepage.
      console.error("[home-data] featured publications:", error.message);
      return [];
    }
    return ((data ?? []) as FeaturedPubRow[]).map((pub) => {
      const references = normalizePublicationReferences(pub.references);
      return {
        ...pub,
        references,
        abstract: toExcerpt(academicTextToPlainText(pub.abstract, references) || null),
        abstract_km: toExcerpt(academicTextToPlainText(pub.abstract_km, references) || null),
      };
    });
  },
  ["home-featured-publications"],
  { revalidate: REVALIDATE, tags: ["home-publications"] }
);

// ── Featured candidates ────────────────────────────────────────────────────
// Ranked by view_count, a different signal from the hero stack's download
// ranking. This is a CANDIDATE POOL, not a display list: lib/home/payload.ts
// takes eight from it through the page-wide exclusion set, skipping anything
// the hero already claimed.
//
// The limit is therefore sized for the worst overlap, not for the eight cards
// shown. At 8 it was the same size as the grid, so on a collection where the
// download and view rankings agree — which is what a small library looks like —
// the hero could claim every candidate and the featured grid rendered six
// cards into an eight-card layout. 24 leaves headroom that costs one query of
// the same shape.
export const getMostViewedBooksCached = unstable_cache(
  async (): Promise<Book[]> => {
    const db = createServiceClient();
    const { data, error } = await db
      .from("books")
      .select(BOOK_SELECT)
      .eq("is_published", true)
      .order("view_count", { ascending: false, nullsFirst: false })
      .limit(24);
    if (error) {
      console.error("[home-data] most viewed:", error.message);
      return [];
    }
    return (data ?? []).map(mapRowToBook);
  },
  ["home-most-viewed"],
  { revalidate: REVALIDATE, tags: ["home-books"] }
);

// ── Latest published post (This Week editorial) ────────────────────────────
export type LatestPostRow = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  category: string | null;
  published_at: string | null;
  created_at: string | null;
};

/**
 * The newest published posts, for the homepage news column.
 *
 * Separate from getLatestPostCached (which returns exactly one and is kept for
 * callers that want just the lead item) so the two share a shape but not a
 * cache entry — a column of three and a single card have different revalidation
 * costs and different consumers.
 */
export const getLatestPostsCached = unstable_cache(
  async (limit = 3): Promise<LatestPostRow[]> => {
    const db = createServiceClient();
    const { data, error } = await db
      .from("posts")
      .select("id, title, slug, excerpt, category, published_at, created_at")
      .eq("status", "published")
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      // posts table/status column may be absent on older deployments — hide
      // the news column rather than break the homepage.
      console.error("[home-data] latest posts:", error.message);
      return [];
    }
    return (data ?? []) as LatestPostRow[];
  },
  ["home-latest-posts"],
  { revalidate: REVALIDATE, tags: ["home-posts"] }
);

export const getLatestPostCached = unstable_cache(
  async (): Promise<LatestPostRow | null> => {
    const db = createServiceClient();
    const { data, error } = await db
      .from("posts")
      .select("id, title, slug, excerpt, category, published_at, created_at")
      .eq("status", "published")
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      // posts table/status column may be absent on older deployments — hide
      // the post card rather than break This Week.
      console.error("[home-data] latest post:", error.message);
      return null;
    }
    return (data as LatestPostRow) ?? null;
  },
  ["home-latest-post"],
  { revalidate: REVALIDATE, tags: ["home-posts"] }
);

// ── Recent additions across every digital type ──────────────────────────────
//
// "What has the library added lately", answered across books, theses AND
// publications rather than books alone (getRecentlyAddedCached, above, is
// books-only and feeds the book rails).
//
// Three queries, not one. PostgREST cannot UNION across tables, and these
// three have genuinely different shapes — so each is fetched at the target
// size, merged, and re-sorted in JS. Taking `limit` from each is what makes
// the merged top-N correct: a smaller per-table limit could miss a recent item
// that lost its own table's cut but would have won the combined one.
//
// Ordering is by created_at — when the item JOINED the library — never
// published_at, which is the work's own publication date and is NULL for
// undated imports. Same rule as getRecentlyAddedCached.

export type RecentItemType = "book" | "thesis" | "publication";

export type RecentItem = {
  id: string;
  title: string;
  author: string | null;
  type: RecentItemType;
  coverUrl: string | null;
  addedAt: string;
  slug: string;
};

/** Rows missing a slug can't be linked to, so they never reach the UI. */
type RawRecent = {
  id: string;
  title: string | null;
  slug: string | null;
  cover_url?: string | null;
  author_names?: string | null;
  created_at: string | null;
};

function toRecentItems(rows: RawRecent[] | null, type: RecentItemType): RecentItem[] {
  return (rows ?? [])
    .filter((r): r is RawRecent & { slug: string; title: string; created_at: string } =>
      Boolean(r.slug && r.title && r.created_at))
    .map((r) => ({
      id: r.id,
      title: r.title,
      author: r.author_names?.trim() || null,
      type,
      coverUrl: r.cover_url ?? null,
      addedAt: r.created_at,
      slug: r.slug,
    }));
}

export const getRecentAdditions = unstable_cache(
  async (limit = 4): Promise<RecentItem[]> => {
    const db = createServiceClient();

    // Each query is independently fault-tolerant: publications did not exist on
    // older deployments, so one missing table must degrade the strip, not empty
    // it. Promise.all over settled shapes keeps that per-source.
    const [books, theses, publications] = await Promise.all([
      db.from("books")
        .select("id, title, slug, cover_url, created_at, authors(name)")
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(limit),
      db.from("research_reports")
        .select("id, title, slug, cover_url, author_names, created_at")
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(limit),
      // publications_with_stats, NOT the base table: `author_names` is a view
      // column (it aggregates publication_authors). Selecting it from
      // `publications` fails with "column publications.author_names does not
      // exist" on every render, which silently dropped publications from the
      // recent-additions strip entirely — visible only in the build log.
      db.from("publications_with_stats")
        .select("id, title, slug, author_names, created_at")
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);

    for (const [name, res] of [
      ["books", books], ["theses", theses], ["publications", publications],
    ] as const) {
      if (res.error) console.error(`[home-data] recent additions (${name}):`, res.error.message);
    }

    // books embeds authors(name); flatten it to the shared author_names shape.
    // PostgREST returns an embedded to-one relation as an object on some
    // deployments and a single-element array on others, so handle both.
    type BookRow = RawRecent & { authors?: { name: string | null } | { name: string | null }[] | null };
    const bookRows: RawRecent[] = ((books.data ?? []) as BookRow[]).map((r) => ({
      ...r,
      author_names: (Array.isArray(r.authors) ? r.authors[0]?.name : r.authors?.name) ?? null,
    }));

    return [
      ...toRecentItems(bookRows, "book"),
      ...toRecentItems(theses.data as RawRecent[] | null, "thesis"),
      ...toRecentItems(publications.data as RawRecent[] | null, "publication"),
    ]
      .sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt))
      .slice(0, limit);
  },
  ["home-recent-additions"],
  { revalidate: REVALIDATE, tags: ["home-books", "home-theses", "home-publications"] }
);
