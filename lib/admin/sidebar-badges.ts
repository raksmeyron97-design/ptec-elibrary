import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { PermLevel } from "@/lib/types/roles";
import { EMPTY_SIDEBAR_BADGES, type SidebarBadges } from "@/lib/admin/sidebar-badges-shared";

export { EMPTY_SIDEBAR_BADGES };
export type { SidebarBadges };

// Mirrors app/actions/review.ts getPendingReviewCount so the badge matches the
// count the /admin/review page itself shows.
const REVIEW_STATUSES = ["needs_review", "pending_review", "in_review"];

function can(perms: Record<string, PermLevel>, resource: string): boolean {
  return (perms[resource] ?? "none") !== "none";
}

/**
 * Lean, permission-gated badge counts. This runs inside the admin shell layout
 * on *every* admin page, so:
 *  - every query is a metadata-only `head` count (no rows transferred),
 *  - each query is individually fault-tolerant (a missing table/column or a
 *    transient error degrades that one badge to 0 — navigation never breaks),
 *  - only counts the administrator is authorised to act on are queried.
 */
export async function getSidebarBadges(
  perms: Record<string, PermLevel>,
): Promise<SidebarBadges> {
  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch {
    return EMPTY_SIDEBAR_BADGES;
  }

  const canBooks = can(perms, "books");
  const canContact = can(perms, "contact");

  const count = async (
    gate: boolean,
    build: () => PromiseLike<{ count: number | null }>,
  ): Promise<number> => {
    if (!gate) return 0;
    try {
      const { count } = await build();
      return count ?? 0;
    } catch {
      return 0;
    }
  };

  const [reviewBooks, reviewTheses, bookRequests, inbox, dataQuality] = await Promise.all([
    count(canBooks, () =>
      supabase.from("books").select("id", { count: "exact", head: true }).in("status", REVIEW_STATUSES),
    ),
    count(canBooks, () =>
      supabase.from("research_reports").select("id", { count: "exact", head: true }).in("status", REVIEW_STATUSES),
    ),
    count(canBooks, () =>
      supabase.from("book_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ),
    count(canContact, () =>
      supabase.from("contact_messages").select("id", { count: "exact", head: true }).eq("status", "new"),
    ),
    count(canBooks, () =>
      supabase.from("file_health").select("id", { count: "exact", head: true }).eq("status", "broken"),
    ),
  ]);

  return {
    review: reviewBooks + reviewTheses,
    bookRequests,
    inbox,
    dataQuality,
  };
}
