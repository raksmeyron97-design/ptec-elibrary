/**
 * Shared, theme-aware visual tokens for the public News & Events surfaces.
 * Client-safe (no imports beyond types) so both server and client components
 * can pull from one source and stay consistent with the post detail page.
 */

import type { PostCategory } from "@/lib/admin/posts-shared";
import type { EventStatus } from "@/lib/posts/event-status";

/** Category pill on a light surface (matches the post detail page palette). */
export const CATEGORY_BADGE: Record<PostCategory, string> = {
  Research: "bg-blue-50 text-blue-700 border border-blue-200",
  Announcement: "bg-amber-50 text-amber-700 border border-amber-200",
  Event: "bg-orange-50 text-orange-700 border border-orange-200",
  Journal: "bg-teal-50 text-teal-700 border border-teal-200",
  Other: "bg-paper text-text-muted border border-divider",
};

export function categoryBadge(category: string): string {
  return CATEGORY_BADGE[category as PostCategory] ?? CATEGORY_BADGE.Other;
}

/** Placeholder tile background when a post has no cover image. */
export const CATEGORY_PLACEHOLDER: Record<PostCategory, { bg: string; text: string }> = {
  Research: { bg: "#1e40af", text: "#bfdbfe" },
  Announcement: { bg: "#92400e", text: "#fde68a" },
  Event: { bg: "#9a3412", text: "#fed7aa" },
  Journal: { bg: "#115e59", text: "#99f6e4" },
  Other: { bg: "#1e3a5f", text: "#bae6fd" },
};

export function categoryPlaceholder(category: string) {
  return CATEGORY_PLACEHOLDER[category as PostCategory] ?? CATEGORY_PLACEHOLDER.Other;
}

/** Event-status badge appearance. `dot` is the leading indicator colour, so
 *  status is never conveyed by colour alone — the text label always shows. */
export const EVENT_STATUS_STYLE: Record<
  EventStatus,
  { badge: string; dot: string; pulse?: boolean }
> = {
  upcoming: { badge: "bg-emerald-50 text-emerald-700 border border-emerald-200", dot: "bg-emerald-500" },
  ongoing: { badge: "bg-blue-50 text-blue-700 border border-blue-200", dot: "bg-blue-500", pulse: true },
  ended: { badge: "bg-paper text-text-muted border border-divider", dot: "bg-slate-400" },
  cancelled: { badge: "bg-red-50 text-red-700 border border-red-200", dot: "bg-red-500" },
  postponed: { badge: "bg-amber-50 text-amber-800 border border-amber-200", dot: "bg-amber-500" },
};
