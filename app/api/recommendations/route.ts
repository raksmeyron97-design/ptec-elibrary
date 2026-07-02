// Recommendation engine: content-based filtering from reading history.
// Returns up to 8 books the user hasn't read yet from their top category/department.
// Falls back to most-downloaded books for new users with no history.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COVERS = process.env.NEXT_PUBLIC_R2_COVERS_URL ?? "";
const BOOK_SELECT =
  "id, slug, title, cover_url, cover_color, department, language, rating, pages, authors(name), categories(name)";

export type Recommendation = {
  id:         string;
  slug:       string;
  title:      string;
  author:     string;
  coverUrl:   string | null;
  coverColor: string | null;
  category:   string | null;
  department: string | null;
  language:   string | null;
  rating:     number;
  pages:      number;
  reason:     string;
};

export type RecommendationsResponse = {
  items:    Recommendation[];
  basedOn:  string | null;
};

function mapBook(b: any, reason: string): Recommendation {
  const rawCover = b.cover_url ?? null;
  return {
    id:         b.id,
    slug:       b.slug,
    title:      b.title,
    author:     b.authors?.name ?? "Unknown",
    coverUrl:   rawCover ? (rawCover.startsWith("http") ? rawCover : `${COVERS}/${rawCover}`) : null,
    coverColor: b.cover_color ?? null,
    category:   b.categories?.name ?? null,
    department: b.department ?? null,
    language:   b.language ?? null,
    rating:     Number(b.rating) || 5,
    pages:      b.pages ?? 0,
    reason,
  };
}

export async function GET() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return Response.json({ items: [], basedOn: null } satisfies RecommendationsResponse);
  }

  const db = createServiceClient();

  // Read user's recent history to find top category and department
  const { data: history } = await db
    .from("reading_progress")
    .select("book_id, books(category_id, department, categories(name))")
    .eq("user_id", user.id)
    .gt("progress_pct", 5)
    .order("last_read_at", { ascending: false })
    .limit(20);

  const readIds = new Set((history ?? []).map((h: any) => h.book_id as string));

  let topCatId:   string | null = null;
  let topCatName: string | null = null;
  let topDept:    string | null = null;
  const catCount:  Record<string, number> = {};
  const deptCount: Record<string, number> = {};

  for (const h of history ?? []) {
    const b = (h as any).books;
    if (!b) continue;
    if (b.category_id) {
      catCount[b.category_id] = (catCount[b.category_id] || 0) + 1;
      if (!topCatId || catCount[b.category_id] > catCount[topCatId]) {
        topCatId   = b.category_id;
        topCatName = b.categories?.name ?? null;
      }
    }
    if (b.department) {
      deptCount[b.department] = (deptCount[b.department] || 0) + 1;
      if (!topDept || deptCount[b.department] > deptCount[topDept]) {
        topDept = b.department;
      }
    }
  }

  // Get most-recently-read book title for the "Because you read X" label
  let recentTitle: string | null = null;
  if (history?.length) {
    const { data: rb } = await db
      .from("books")
      .select("title")
      .eq("id", (history[0] as any).book_id)
      .single();
    recentTitle = rb?.title ?? null;
  }

  const results: Recommendation[] = [];

  // 1. Same category as top-read category
  if (topCatId) {
    const reason = recentTitle
      ? `Because you read "${recentTitle.length > 35 ? recentTitle.slice(0, 35) + "…" : recentTitle}"`
      : `Popular in ${topCatName ?? "your subjects"}`;

    const { data: catBooks } = await db
      .from("books")
      .select(BOOK_SELECT)
      .eq("is_published", true)
      .eq("category_id", topCatId)
      .order("download_count", { ascending: false })
      .limit(16);

    for (const b of catBooks ?? []) {
      if (readIds.has((b as any).id)) continue;
      results.push(mapBook(b, reason));
      if (results.length >= 8) break;
    }
  }

  // 2. Same department (fills gaps if category was narrow)
  if (results.length < 4 && topDept) {
    const { data: deptBooks } = await db
      .from("books")
      .select(BOOK_SELECT)
      .eq("is_published", true)
      .eq("department", topDept)
      .order("download_count", { ascending: false })
      .limit(16);

    for (const b of deptBooks ?? []) {
      if (readIds.has((b as any).id)) continue;
      if (results.some(r => r.id === (b as any).id)) continue;
      results.push(mapBook(b, `Popular in ${topDept}`));
      if (results.length >= 8) break;
    }
  }

  // 3. Fallback: most-downloaded library-wide (new users / no history)
  if (results.length < 4) {
    const { data: popular } = await db
      .from("books")
      .select(BOOK_SELECT)
      .eq("is_published", true)
      .order("download_count", { ascending: false })
      .limit(24);

    for (const b of popular ?? []) {
      if (readIds.has((b as any).id)) continue;
      if (results.some(r => r.id === (b as any).id)) continue;
      results.push(mapBook(b, "Most popular in the library"));
      if (results.length >= 8) break;
    }
  }

  return Response.json({
    items:   results.slice(0, 8),
    basedOn: topCatName ?? topDept ?? null,
  } satisfies RecommendationsResponse);
}
