// lib/dashboard/recent-activity.ts
//
// Pure builder for the dashboard's "Recent activity" feed. There is no
// per-user "viewed/opened" event log in this app (activity_events, migration
// 0094, only records denied/failed download attempts for the admin security
// log — see its header comment). Real user activity is composed instead from
// three sources that already carry a genuine timestamp per user action:
//
//   reading_progress.last_read_at  → "opened"
//   saved_books.created_at         → "saved"
//   download_logs.downloaded_at    → "downloaded"
//
// This function does no I/O — callers fetch each source (already required
// for other dashboard sections) and pass the rows in. That keeps it
// unit-testable without a database and guarantees it can never fabricate an
// event: every item here traces back to one real row from one real table.

export type DashboardActivityType = "opened" | "saved" | "downloaded";

export type DashboardActivityItem = {
  type: DashboardActivityType;
  slug: string;
  title: string;
  /** ISO timestamp, taken verbatim from the source row — never synthesized. */
  occurredAt: string;
};

export type RecentActivityInput = {
  /** Rows shaped like the dashboard page's `reading_progress` query. */
  progress: Array<{
    last_read_at: string | null;
    books: { slug: string; title: string } | null;
  }>;
  /** Rows shaped like `getSavedBooks()`'s return value. */
  savedBooks: Array<{
    slug: string;
    title: string;
    savedAt: string | null;
  }>;
  /** Rows shaped like `getMyDownloadHistory()`'s return value. */
  downloadHistory: Array<{
    slug: string;
    title: string;
    downloadedAt: string | null;
  }>;
};

const DEFAULT_LIMIT = 6;

export function buildRecentActivity(
  { progress, savedBooks, downloadHistory }: RecentActivityInput,
  limit = DEFAULT_LIMIT,
): DashboardActivityItem[] {
  const items: DashboardActivityItem[] = [];

  for (const row of progress) {
    if (!row.last_read_at || !row.books) continue;
    items.push({
      type: "opened",
      slug: row.books.slug,
      title: row.books.title,
      occurredAt: row.last_read_at,
    });
  }

  for (const row of savedBooks) {
    if (!row.savedAt || !row.slug) continue;
    items.push({
      type: "saved",
      slug: row.slug,
      title: row.title,
      occurredAt: row.savedAt,
    });
  }

  for (const row of downloadHistory) {
    if (!row.downloadedAt || !row.slug) continue;
    items.push({
      type: "downloaded",
      slug: row.slug,
      title: row.title,
      occurredAt: row.downloadedAt,
    });
  }

  items.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  return items.slice(0, limit);
}
