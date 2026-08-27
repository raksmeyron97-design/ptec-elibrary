// lib/dashboard/reading-stats.ts
// Pure aggregation over already-fetched `reading_progress` rows, split out
// of app/actions/reading-analytics.ts (a "use server" file, which — per
// Next.js's Server Actions rule — may only export async functions, so a
// synchronous pure function can't live there). Mirrors the
// lib/admin/metadata-quality-report.ts split: fetch stays in the action,
// scoring/aggregation stays here, deterministic and unit-testable without
// a database.
//
// Each `reading_progress` row is one book's CURRENT state — there is no
// per-day history in this schema, so nothing here is or can be a
// day-by-day trend.

export type ReadingStats = {
  booksStarted:    number;
  booksCompleted:  number;
  pagesRead:       number;
  completionRate:  number;
  currentStreak:   number;
  topSubjects:     { name: string; count: number }[];
  thisMonthBooks:  number;
  lastMonthBooks:  number;
  /**
   * Last 7 days, oldest → newest, ending today: was at least one book's
   * `last_read_at` on that date? Same `readDates` signal the streak below
   * is built from — not a separate data source, just 7 more days of it.
   * Optional so the one other hand-built ReadingStats literal in the repo
   * (a dev-only preview route) stays valid without editing it.
   */
  last7Days?: boolean[];
};

export type ReadingProgressRow = {
  progress_pct: number;
  last_read_at: string | null;
  books: { pages: number | null; categories: { name: string } | null } | null;
};

/** A book counts as completed once its progress reaches 100% — the same
 *  threshold the dashboard's Library Snapshot/Tabs already use (unified
 *  here; this previously used 90%, which disagreed with them). */
const COMPLETED_THRESHOLD = 100;

export function computeReadingStats(progress: ReadingProgressRow[], now: Date = new Date()): ReadingStats {
  const started   = progress.length;
  const completed = progress.filter(p => p.progress_pct >= COMPLETED_THRESHOLD).length;
  const pagesRead = progress.reduce((sum, p) => {
    const pages = p.books?.pages ?? 0;
    return sum + Math.floor(pages * p.progress_pct / 100);
  }, 0);
  const completionRate = started > 0 ? Math.round(completed / started * 100) : 0;

  // Consecutive-day reading streak (from `now` backwards) and the last 7
  // days' activity flags share one signal: the set of calendar dates on
  // which at least one book's (latest-known) last_read_at falls.
  const readDates = new Set(
    progress
      .filter(p => p.last_read_at)
      .map(p => new Date(p.last_read_at!).toDateString())
  );

  let streak = 0;
  for (let i = 0; i <= 365; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    if (readDates.has(d.toDateString())) { streak++; }
    else if (i > 0) break;
  }

  const last7Days: boolean[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    last7Days.push(readDates.has(d.toDateString()));
  }

  // Top subjects from category names (top 5 by count of in-progress/completed books).
  const counts: Record<string, number> = {};
  for (const p of progress) {
    const cat = p.books?.categories?.name;
    if (cat) counts[cat] = (counts[cat] || 0) + 1;
  }
  const topSubjects = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  // Monthly activity comparison
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0);

  const thisMonthBooks = progress.filter(p =>
    p.last_read_at && new Date(p.last_read_at) >= thisMonthStart
  ).length;
  const lastMonthBooks = progress.filter(p => {
    if (!p.last_read_at) return false;
    const d = new Date(p.last_read_at);
    return d >= lastMonthStart && d <= lastMonthEnd;
  }).length;

  return {
    booksStarted: started, booksCompleted: completed, pagesRead,
    completionRate, currentStreak: streak, topSubjects,
    thisMonthBooks, lastMonthBooks, last7Days,
  };
}
