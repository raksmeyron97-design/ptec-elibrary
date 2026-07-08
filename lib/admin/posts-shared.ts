/**
 * Client-safe constants, types, and pure helpers for the admin Posts CMS.
 * No "server-only" import here (unlike lib/admin/posts.ts) — this is the
 * module client components ("use client") import from. lib/admin/posts.ts
 * re-exports everything here too, so existing server-side call sites can
 * keep importing from "@/lib/admin/posts" unchanged.
 */

export const CATEGORIES = ["Research", "Announcement", "Event", "Journal", "Other"] as const;
export type PostCategory = (typeof CATEGORIES)[number];

export const STATUSES = ["draft", "published", "scheduled", "archived"] as const;
export type PostStatus = (typeof STATUSES)[number];

export const VISIBILITY_OPTIONS = ["public", "unlisted", "admin_only"] as const;
export type PostVisibility = (typeof VISIBILITY_OPTIONS)[number];

export const SORT_OPTIONS = [
  "newest",
  "oldest",
  "most-viewed",
  "least-viewed",
  "title-asc",
  "title-desc",
] as const;
export type PostSort = (typeof SORT_OPTIONS)[number];

export const CATEGORY_BADGE_STYLES: Record<string, string> = {
  Research: "bg-cyan-50 text-cyan-700 border border-cyan-200",
  Announcement: "bg-violet-50 text-violet-700 border border-violet-200",
  Event: "bg-orange-50 text-orange-700 border border-orange-200",
  Journal: "bg-brand/5 text-brand border border-brand/20",
  Other: "bg-paper text-text-body border border-divider",
};

export const STATUS_BADGE_STYLES: Record<PostStatus, string> = {
  published: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  draft: "bg-paper text-text-muted border border-divider",
  scheduled: "bg-violet-50 text-violet-700 border border-violet-200",
  archived: "bg-amber-50 text-amber-700 border border-amber-200",
};

export const STATUS_LABELS: Record<PostStatus, string> = {
  published: "Live",
  draft: "Draft",
  scheduled: "Scheduled",
  archived: "Archived",
};

export function normalizeCategory(raw: string | null | undefined): PostCategory {
  return (CATEGORIES as readonly string[]).includes(raw ?? "") ? (raw as PostCategory) : "Other";
}

export function normalizeStatus(raw: string | null | undefined): PostStatus {
  return (STATUSES as readonly string[]).includes(raw ?? "") ? (raw as PostStatus) : "draft";
}

export function normalizeVisibility(raw: string | null | undefined): PostVisibility {
  return (VISIBILITY_OPTIONS as readonly string[]).includes(raw ?? "") ? (raw as PostVisibility) : "public";
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type PostsQueryParams = {
  q?: string;
  category?: string;
  status?: string;
  authorId?: string;
  dateRange?: "all" | "today" | "7d" | "30d" | "custom";
  dateFrom?: string;
  dateTo?: string;
  minViews?: number;
  maxViews?: number;
  sort?: string;
  page: number;
  pageSize: number;
};

export type PostListRow = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  category: PostCategory;
  status: PostStatus;
  author: string;
  authorId: string | null;
  views: number;
  createdAt: string | null;
  updatedAt: string | null;
  scheduledAt: string | null;
};

export type PostsSummary = {
  total: number;
  live: number;
  drafts: number;
  scheduled: number;
  archived: number;
  totalViews: number;
};

export type PostAuthorOption = { id: string; name: string };
