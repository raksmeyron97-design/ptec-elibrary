// lib/home-data.ts
// Cached data fetchers for the public homepage sections.
//
// All of this data is public (is_published = true only) and identical for
// every visitor, so it is fetched with the service client (no cookie access —
// cookie reads would opt the whole route out of caching) and memoised with
// unstable_cache for 5 minutes, same pattern as lib/home-stats.ts.
//
// Per-user data (auth state, ContinueReading) must NOT move here.
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { mapRowToBook, BOOK_SELECT, type Book } from "@/lib/books";

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
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 7);
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
      .order("published_at", { ascending: false })
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
  view_count: number | null;
  download_count: number | null;
  score: number;
};

export const getTrendingThesesCached = unstable_cache(
  async (): Promise<TrendingThesisRow[]> => {
    const db = createServiceClient();
    const { data, error } = await db
      .from("research_reports")
      .select("id, slug, title, author_names, cohort, view_count, download_count")
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
  author_names: string | null;
};

export const getFeaturedPublicationsCached = unstable_cache(
  async (): Promise<FeaturedPubRow[]> => {
    const db = createServiceClient();
    const { data, error } = await db
      .from("publications_with_stats")
      .select(
        "id, slug, title, title_km, article_type, journal_name, doi, publication_date, abstract, abstract_km, author_names"
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
    return (data ?? []) as FeaturedPubRow[];
  },
  ["home-featured-publications"],
  { revalidate: REVALIDATE, tags: ["home-publications"] }
);
