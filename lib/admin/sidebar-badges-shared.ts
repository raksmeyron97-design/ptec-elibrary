/**
 * Client-safe half of the sidebar badge module.
 *
 * The query itself lives in `lib/admin/sidebar-badges.ts`, which is
 * `server-only`. AdminSidebar is a client component, so the shape and the
 * empty default must live here — importing them from the server module would
 * pull `server-only` into the client bundle and fail the build. (Same split as
 * lib/admin/posts.ts ↔ posts-shared.ts.)
 */

/**
 * Actionable counts surfaced as badges in the admin sidebar. Each maps to a
 * single navigation destination so a badge always means "there is work waiting
 * for you here", never a decorative total:
 *   review       → /admin/review        (books/theses in the verification workflow)
 *   bookRequests → /admin/book-requests (reader requests awaiting triage)
 *   inbox        → /admin/inbox         (new, unread contact messages)
 *   dataQuality  → /admin/data-quality  (files that failed their health check)
 *   securityIncidents → /admin/security  (Sev 1-2 incidents still open)
 */
export type SidebarBadges = {
  review: number;
  bookRequests: number;
  inbox: number;
  dataQuality: number;
  /**
   * Live Sev 1-2 incidents only. Sev 3 and Sev 4 are deliberately excluded:
   * a badge means "there is work waiting for you here", and an always-on
   * count of informational events is how a badge stops being read.
   */
  securityIncidents: number;
};

export const EMPTY_SIDEBAR_BADGES: SidebarBadges = {
  review: 0,
  bookRequests: 0,
  inbox: 0,
  dataQuality: 0,
  securityIncidents: 0,
};
