"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";

export type ReadingStats = {
  booksStarted:    number;
  booksCompleted:  number;
  pagesRead:       number;
  completionRate:  number;
  currentStreak:   number;
  topSubjects:     { name: string; count: number }[];
  thisMonthBooks:  number;
  lastMonthBooks:  number;
};

export async function getReadingStats(): Promise<ReadingStats | null> {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const db = createServiceClient();
  const { data: progress } = await db
    .from("reading_progress")
    .select("progress_pct, last_read_at, books(pages, categories(name))")
    .eq("user_id", user.id)
    .gt("progress_pct", 0);

  if (!progress?.length) {
    return {
      booksStarted: 0, booksCompleted: 0, pagesRead: 0,
      completionRate: 0, currentStreak: 0, topSubjects: [],
      thisMonthBooks: 0, lastMonthBooks: 0,
    };
  }

  const started   = progress.length;
  const completed = progress.filter(p => p.progress_pct >= 90).length;
  const pagesRead = progress.reduce((sum, p) => {
    const pages = (p.books as any)?.pages ?? 0;
    return sum + Math.floor(pages * p.progress_pct / 100);
  }, 0);
  const completionRate = started > 0 ? Math.round(completed / started * 100) : 0;

  // Consecutive-day reading streak (from today backwards)
  const readDates = new Set(
    progress
      .filter(p => p.last_read_at)
      .map(p => new Date(p.last_read_at!).toDateString())
  );
  let streak = 0;
  const today = new Date();
  for (let i = 0; i <= 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (readDates.has(d.toDateString())) { streak++; }
    else if (i > 0) break;
  }

  // Top subjects from category names
  const counts: Record<string, number> = {};
  for (const p of progress) {
    const cat = (p.books as any)?.categories?.name;
    if (cat) counts[cat] = (counts[cat] || 0) + 1;
  }
  const topSubjects = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => ({ name, count }));

  // Monthly activity comparison
  const now = new Date();
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
    thisMonthBooks, lastMonthBooks,
  };
}
