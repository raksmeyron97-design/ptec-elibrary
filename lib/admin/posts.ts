import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import {
  normalizeCategory,
  normalizeStatus,
  slugify,
  type PostListRow,
  type PostsQueryParams,
  type PostsSummary,
  type PostAuthorOption,
} from "@/lib/admin/posts-shared";

/**
 * Server-only data-access helpers for the admin Posts CMS. Constants, types,
 * and pure helpers (categories, statuses, badge styles, slugify, ...) live in
 * lib/admin/posts-shared.ts, which client components import directly — this
 * module re-exports all of it so existing server-side imports of
 * "@/lib/admin/posts" keep working unchanged.
 */
export * from "@/lib/admin/posts-shared";

type ServiceClient = ReturnType<typeof createServiceClient>;

export async function uniqueSlug(supabase: ServiceClient, base: string, ignoreId?: string): Promise<string> {
  let slug = base || "post";
  let n = 1;
  while (true) {
    const { data } = await supabase.from("posts").select("id").eq("slug", slug).limit(1);
    const taken = (data ?? []).some((r: { id: string }) => r.id !== ignoreId);
    if (!taken) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

/** Server Action wrapper for the client-side live-availability check. */
export async function checkSlugAvailable(slug: string, ignoreId?: string): Promise<boolean> {
  const clean = slugify(slug);
  if (!clean) return false;
  const supabase = createServiceClient();
  const { data } = await supabase.from("posts").select("id").eq("slug", clean).limit(1);
  return !(data ?? []).some((r: { id: string }) => r.id !== ignoreId);
}

// ── Search sanitization ───────────────────────────────────────────────────
// Strip PostgREST .or()/.ilike() metacharacters before building filter
// strings from user input (same rule as sanitizeSearchTerm in app/api/chat).
function sanitizeSearchTerm(input: string): string {
  return input.replace(/[%,()\\*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

function dateRangeToFrom(range: string | undefined): string | null {
  const now = new Date();
  if (range === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (range === "7d") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  if (range === "30d") return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return null;
}

export async function getPosts(
  params: PostsQueryParams,
): Promise<{ rows: PostListRow[]; total: number; error: boolean }> {
  const supabase = createServiceClient();
  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;

  let query = supabase
    .from("posts")
    .select(
      `
      id, title, slug, excerpt, category, status, views, created_at, updated_at, scheduled_at,
      author_id, author:profiles!author_id ( full_name, email )
    `,
      { count: "exact" },
    );

  const q = sanitizeSearchTerm(params.q ?? "");
  if (q) {
    let authorIds: string[] = [];
    const { data: matchingAuthors } = await supabase
      .from("profiles")
      .select("id")
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(50);
    authorIds = (matchingAuthors ?? []).map((p: { id: string }) => p.id);

    const orParts = [
      `title.ilike.%${q}%`,
      `excerpt.ilike.%${q}%`,
      `category.ilike.%${q}%`,
      `tags.cs.{${q}}`,
    ];
    if (authorIds.length) orParts.push(`author_id.in.(${authorIds.join(",")})`);
    query = query.or(orParts.join(","));
  }

  if (params.category && params.category !== "All") {
    query = query.eq("category", normalizeCategory(params.category));
  }

  if (params.status && params.status !== "all") {
    query = query.eq("status", normalizeStatus(params.status));
  }

  if (params.authorId) {
    query = query.eq("author_id", params.authorId);
  }

  if (params.dateRange === "custom" && params.dateFrom) {
    query = query.gte("created_at", params.dateFrom);
    if (params.dateTo) query = query.lte("created_at", params.dateTo);
  } else {
    const from_ = dateRangeToFrom(params.dateRange);
    if (from_) query = query.gte("created_at", from_);
  }

  if (typeof params.minViews === "number") query = query.gte("views", params.minViews);
  if (typeof params.maxViews === "number") query = query.lte("views", params.maxViews);

  switch (params.sort) {
    case "oldest":
      query = query.order("created_at", { ascending: true });
      break;
    case "most-viewed":
      query = query.order("views", { ascending: false });
      break;
    case "least-viewed":
      query = query.order("views", { ascending: true });
      break;
    case "title-asc":
      query = query.order("title", { ascending: true });
      break;
    case "title-desc":
      query = query.order("title", { ascending: false });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  query = query.range(from, to);

  const { data, count, error } = await query;
  if (error) {
    console.error("[getPosts] query failed:", error.message);
    return { rows: [], total: 0, error: true };
  }

  const rows: PostListRow[] = (data ?? []).map((p) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = p as any;
    return {
      id: row.id as string,
      title: row.title as string,
      slug: row.slug as string,
      excerpt: row.excerpt ?? null,
      category: normalizeCategory(row.category),
      status: normalizeStatus(row.status),
      author: row.author?.full_name ?? row.author?.email ?? "—",
      authorId: row.author_id ?? null,
      views: row.views ?? 0,
      createdAt: row.created_at ?? null,
      updatedAt: row.updated_at ?? null,
      scheduledAt: row.scheduled_at ?? null,
    };
  });

  return { rows, total: count ?? 0, error: false };
}

export async function getPostsSummary(): Promise<PostsSummary> {
  const supabase = createServiceClient();

  const [total, live, drafts, scheduled, archived] = await Promise.all([
    supabase.from("posts").select("id", { count: "exact", head: true }),
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("status", "scheduled"),
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("status", "archived"),
  ]);

  let totalViews = 0;
  // Try a DB-side aggregate first; fall back to a full scan+sum if the
  // PostgREST version in front of this project doesn't support it.
  const agg = await supabase.from("posts").select("total:views.sum()").single();
  if (!agg.error && agg.data && typeof (agg.data as { total: number | null }).total === "number") {
    totalViews = (agg.data as { total: number }).total;
  } else {
    const { data: allViews } = await supabase.from("posts").select("views");
    totalViews = (allViews ?? []).reduce((sum: number, r: { views: number | null }) => sum + (r.views ?? 0), 0);
  }

  return {
    total: total.count ?? 0,
    live: live.count ?? 0,
    drafts: drafts.count ?? 0,
    scheduled: scheduled.count ?? 0,
    archived: archived.count ?? 0,
    totalViews,
  };
}

export async function getPostAuthors(): Promise<PostAuthorOption[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("posts")
    .select("author_id, author:profiles!author_id(full_name, email)")
    .not("author_id", "is", null);

  const seen = new Map<string, string>();
  for (const row of data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;
    if (!r.author_id || seen.has(r.author_id)) continue;
    seen.set(r.author_id, r.author?.full_name ?? r.author?.email ?? "—");
  }
  return Array.from(seen.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
