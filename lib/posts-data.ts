/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/posts-data.ts
//
// Cookie-free, cached data layer for the public News & Events hub (/posts).
//
// Everything here uses createPublicClient() (no cookies), so it can be wrapped
// in unstable_cache without leaking per-user state. Admin mutations call
// revalidatePost() (lib/cache/revalidate.ts) → revalidateTag("posts"), which
// invalidates every entry below at once. This replaces the old page that
// fetched ALL published posts with the anon session client and filtered them
// in the browser.
//
// Row visibility: the anon key still enforces the posts RLS policy (published
// and not admin_only), and we additionally exclude `unlisted` here so those
// direct-link-only posts never surface in the public index (0073 intent).

import { unstable_cache } from "next/cache";
import { createPublicClient } from "./supabase/public";
import { CATEGORIES, normalizeCategory, type PostCategory } from "./admin/posts-shared";
import type { EventFields } from "./posts/event-status";

export const POSTS_PAGE_SIZE = 9;
export const POSTS_PAGE_SIZE_OPTIONS = [9, 18, 36] as const;

export function resolvePostsPageSize(raw: string | undefined): number {
  const n = Number(raw);
  return (POSTS_PAGE_SIZE_OPTIONS as readonly number[]).includes(n) ? n : POSTS_PAGE_SIZE;
}

export type PostSort = "newest" | "oldest" | "most-viewed";
export type EventWhen = "upcoming" | "past";

export type PostsListParams = {
  q?: string;
  category?: string; // "All" or one of CATEGORIES
  year?: string; // "YYYY"
  when?: string; // "upcoming" | "past" — event-time filter (events only)
  sort?: string; // PostSort
  /** Internal: omit a post (the featured story) so it isn't shown twice on the
   *  clean listing. Part of the params so it keys the cache correctly. */
  excludeId?: string;
};

export type PostListItem = {
  id: string;
  title: string;
  slug: string;
  category: PostCategory;
  excerpt: string | null;
  coverUrl: string | null;
  coverAlt: string | null;
  author: string;
  publishedAt: string | null;
  featured: boolean;
  /** Present only when the post is a dated event. */
  event: EventFields | null;
};

const EVENT_COLUMNS =
  "event_start_at, event_end_at, event_location, event_format, event_registration_url, event_registration_deadline, event_status_override";

function listSelect(withEvents: boolean): string {
  return `
    id, title, slug, category, excerpt, cover_url, cover_urls, cover_meta,
    created_at, published_at, featured${withEvents ? `,
    ${EVENT_COLUMNS}` : ""},
    author:profiles!author_id ( full_name, email )
  `;
}

/**
 * Whether migration 0099's event_* columns exist yet. Selecting or filtering on
 * a column that doesn't exist makes PostgREST fail the WHOLE query (error
 * 42703), which would blank out the public listing in the window between this
 * code deploying and the migration applying. This one cheap probe (cached under
 * the "posts" tag) lets every query below degrade to a no-event shape instead.
 * Once the migration lands, an admin edit busts the tag and events light up.
 */
export const eventColumnsAvailable = unstable_cache(
  async (): Promise<boolean> => {
    const supabase = createPublicClient();
    const { error } = await supabase.from("posts").select("event_start_at").limit(1);
    if (error && (error as any).code === "42703") return false;
    return true;
  },
  ["posts-event-columns"],
  { revalidate: 600, tags: ["posts"] },
);

// Strip PostgREST .or()/.ilike() metacharacters before building filter strings
// from user input (same rule as lib/admin/posts.ts sanitizeSearchTerm).
function sanitizeSearchTerm(input: string): string {
  return input.replace(/[%,()\\*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

function coverAltFor(row: any, url: string | null): string | null {
  if (!url) return null;
  const meta = row.cover_meta;
  if (meta && typeof meta === "object" && meta[url] && typeof meta[url].alt === "string") {
    return meta[url].alt || null;
  }
  return null;
}

function mapRow(row: any): PostListItem {
  const coverUrl =
    (Array.isArray(row.cover_urls) && row.cover_urls[0]) || row.cover_url || null;
  const category = normalizeCategory(row.category);
  const hasEvent = category === "Event" && !!row.event_start_at;
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    category,
    excerpt: row.excerpt ?? null,
    coverUrl,
    coverAlt: coverAltFor(row, coverUrl),
    author: row.author?.full_name ?? row.author?.email ?? "PTEC Library",
    publishedAt: row.published_at ?? row.created_at ?? null,
    featured: !!row.featured,
    event: hasEvent
      ? {
          startAt: row.event_start_at ?? null,
          endAt: row.event_end_at ?? null,
          location: row.event_location ?? null,
          format: row.event_format ?? null,
          registrationUrl: row.event_registration_url ?? null,
          registrationDeadline: row.event_registration_deadline ?? null,
          statusOverride: row.event_status_override ?? null,
        }
      : null,
  };
}

/** Base filter every public query shares: published, public visibility only. */
function publicBase(query: any) {
  return query.eq("is_published", true).eq("visibility", "public");
}

/**
 * One page of the public listing — server-side filtering, sorting and
 * pagination with an exact total. Cached per params+page under the "posts" tag.
 */
export const getPostsPage = unstable_cache(
  async (
    params: PostsListParams,
    page: number,
    pageSize: number = POSTS_PAGE_SIZE,
  ): Promise<{ items: PostListItem[]; total: number; page: number }> => {
    const supabase = createPublicClient();
    const safePage = Math.max(1, Number(page) || 1);
    const size = pageSize > 0 ? pageSize : POSTS_PAGE_SIZE;
    const from = (safePage - 1) * size;
    const to = from + size - 1;
    // Computed at cache-fill time, then stable for the revalidate window — so
    // upcoming/past buckets can be up to a few minutes stale but the cache key
    // (params + page + size) stays constant and actually hits.
    const now = new Date().toISOString();
    const withEvents = await eventColumnsAvailable();

    let query = publicBase(
      supabase.from("posts").select(listSelect(withEvents), { count: "exact" }),
    );

    if (params.excludeId) query = query.neq("id", params.excludeId);

    const category = params.category && params.category !== "All"
      ? normalizeCategory(params.category)
      : null;
    if (category) query = query.eq("category", category);

    const q = sanitizeSearchTerm(params.q ?? "");
    if (q) {
      query = query.or(
        [
          `title.ilike.%${q}%`,
          `excerpt.ilike.%${q}%`,
          `content.ilike.%${q}%`,
          `tags.cs.{${q}}`,
        ].join(","),
      );
    }

    if (params.year && /^\d{4}$/.test(params.year)) {
      const y = Number(params.year);
      query = query
        .gte("created_at", `${y}-01-01T00:00:00Z`)
        .lt("created_at", `${y + 1}-01-01T00:00:00Z`);
    }

    // Event-time filter implies "events only" (only dated events have a start).
    // Ignored entirely until the event columns exist (pre-migration window).
    const when: EventWhen | null =
      withEvents && (params.when === "upcoming" || params.when === "past")
        ? params.when
        : null;
    if (when === "upcoming") {
      query = query.gte("event_start_at", now);
    } else if (when === "past") {
      query = query.not("event_start_at", "is", null).lt("event_start_at", now);
    }

    // Sorting. An event-time filter forces a chronological event sort;
    // otherwise honour the requested sort over publication date/views.
    if (when === "upcoming") {
      query = query.order("event_start_at", { ascending: true });
    } else if (when === "past") {
      query = query.order("event_start_at", { ascending: false });
    } else if (params.sort === "oldest") {
      query = query.order("created_at", { ascending: true });
    } else if (params.sort === "most-viewed") {
      query = query.order("views", { ascending: false }).order("created_at", { ascending: false });
    } else {
      query = query.order("created_at", { ascending: false });
    }

    const { data, count, error } = await query.range(from, to);
    if (error) {
      if ((error as any).code !== "PGRST103") {
        console.error("[getPostsPage] query failed:", error.message);
      }
      return { items: [], total: 0, page: safePage };
    }

    return { items: (data ?? []).map(mapRow), total: count ?? 0, page: safePage };
  },
  ["posts-page"],
  { revalidate: 300, tags: ["posts"] },
);

/**
 * The single featured story shown at the top of the hub. Data-driven: the most
 * recent published, public post flagged `featured`. Returns null when none is
 * flagged, so the section collapses cleanly. Cancelled events never feature.
 */
export const getFeaturedPost = unstable_cache(
  async (): Promise<PostListItem | null> => {
    const supabase = createPublicClient();
    const withEvents = await eventColumnsAvailable();
    let query = publicBase(supabase.from("posts").select(listSelect(withEvents)))
      .eq("featured", true);
    // Keep a cancelled event from headlining the page (only once the column
    // exists — the filter would 42703 the whole query otherwise).
    if (withEvents) {
      query = query.or("event_status_override.is.null,event_status_override.neq.cancelled");
    }
    const { data, error } = await query
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("[getFeaturedPost] query failed:", error.message);
      return null;
    }
    const row = (data ?? [])[0];
    return row ? mapRow(row) : null;
  },
  ["posts-featured"],
  { revalidate: 300, tags: ["posts"] },
);

export type PostsFacets = {
  /** Categories that actually have public posts, with counts. */
  categories: { key: PostCategory; count: number }[];
  /** Publication years present, newest first. */
  years: number[];
  /** Whether any upcoming public event exists (drives the events filter UI). */
  hasUpcomingEvents: boolean;
  total: number;
};

/**
 * Facet metadata for the filter UI: per-category counts, available years, and
 * whether upcoming events exist. Read with a light projection (no covers/body).
 */
export const getPostsFacets = unstable_cache(
  async (): Promise<PostsFacets> => {
    const supabase = createPublicClient();
    const now = new Date().toISOString();
    const withEvents = await eventColumnsAvailable();

    const { data, error } = await publicBase(
      supabase.from("posts").select(withEvents ? "category, created_at, event_start_at" : "category, created_at"),
    ).limit(5000);

    if (error || !data) {
      if (error) console.error("[getPostsFacets] query failed:", error.message);
      return { categories: [], years: [], hasUpcomingEvents: false, total: 0 };
    }

    const catCounts = new Map<PostCategory, number>();
    const yearSet = new Set<number>();
    let hasUpcomingEvents = false;

    for (const row of data as any[]) {
      const cat = normalizeCategory(row.category);
      catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
      if (row.created_at) {
        const y = new Date(row.created_at).getUTCFullYear();
        if (!Number.isNaN(y)) yearSet.add(y);
      }
      if (row.event_start_at && row.event_start_at >= now) hasUpcomingEvents = true;
    }

    const categories = (CATEGORIES as readonly PostCategory[])
      .map((key) => ({ key, count: catCounts.get(key) ?? 0 }))
      .filter((c) => c.count > 0);

    return {
      categories,
      years: Array.from(yearSet).sort((a, b) => b - a),
      hasUpcomingEvents,
      total: data.length,
    };
  },
  ["posts-facets"],
  { revalidate: 300, tags: ["posts"] },
);
