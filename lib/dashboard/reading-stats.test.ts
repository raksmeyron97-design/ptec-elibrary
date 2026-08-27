import { describe, it, expect } from "vitest";
import { computeReadingStats } from "./reading-stats";

const NOW = new Date("2026-08-27T12:00:00Z"); // Thursday
const daysAgo = (n: number) => {
  const d = new Date(NOW);
  d.setDate(NOW.getDate() - n);
  return d.toISOString();
};

function row(overrides: Partial<{
  progress_pct: number;
  last_read_at: string | null;
  pages: number | null;
  category: string | null;
}> = {}) {
  const { progress_pct = 50, last_read_at = daysAgo(0), pages = 100, category = "Education" } = overrides;
  return {
    progress_pct,
    last_read_at,
    books: { pages, categories: category ? { name: category } : null },
  };
}

describe("computeReadingStats", () => {
  it("returns all-zero stats for empty input — never fabricates", () => {
    const stats = computeReadingStats([], NOW);
    expect(stats).toEqual({
      booksStarted: 0, booksCompleted: 0, pagesRead: 0,
      completionRate: 0, currentStreak: 0, topSubjects: [],
      thisMonthBooks: 0, lastMonthBooks: 0, last7Days: [false, false, false, false, false, false, false],
    });
  });

  it("treats >=100% as completed, not 90%", () => {
    const stats = computeReadingStats([
      row({ progress_pct: 90 }),
      row({ progress_pct: 99 }),
      row({ progress_pct: 100 }),
    ], NOW);
    expect(stats.booksStarted).toBe(3);
    expect(stats.booksCompleted).toBe(1);
    expect(stats.completionRate).toBe(33);
  });

  it("sums estimated pages read as floor(pages * pct/100)", () => {
    const stats = computeReadingStats([
      row({ progress_pct: 50, pages: 200 }), // 100
      row({ progress_pct: 33, pages: 100 }), // 33
      row({ progress_pct: 50, pages: null }), // 0 — missing metadata, not fabricated
    ], NOW);
    expect(stats.pagesRead).toBe(133);
  });

  it("computes a consecutive-day streak ending today", () => {
    const stats = computeReadingStats([
      row({ last_read_at: daysAgo(0) }),
      row({ last_read_at: daysAgo(1) }),
      row({ last_read_at: daysAgo(2) }),
      row({ last_read_at: daysAgo(5) }), // gap — doesn't extend the streak
    ], NOW);
    expect(stats.currentStreak).toBe(3);
  });

  it("streak is 0 when nothing was read today or yesterday-onward unbroken from today", () => {
    const stats = computeReadingStats([
      row({ last_read_at: daysAgo(2) }),
    ], NOW);
    expect(stats.currentStreak).toBe(0);
  });

  it("builds last7Days oldest-to-newest from the same read dates as the streak", () => {
    const stats = computeReadingStats([
      row({ last_read_at: daysAgo(0) }),
      row({ last_read_at: daysAgo(2) }),
    ], NOW);
    // index 6 = today (daysAgo 0), index 0 = 6 days ago
    expect(stats.last7Days).toEqual([false, false, false, false, true, false, true]);
  });

  it("orders topSubjects by count descending and caps at 5", () => {
    const rows = [
      ...Array(3).fill(0).map(() => row({ category: "A" })),
      ...Array(5).fill(0).map(() => row({ category: "B" })),
      ...Array(1).fill(0).map(() => row({ category: "C" })),
      row({ category: "D" }),
      row({ category: "E" }),
      row({ category: "F" }),
    ];
    const stats = computeReadingStats(rows, NOW);
    expect(stats.topSubjects).toHaveLength(5);
    expect(stats.topSubjects[0]).toEqual({ name: "B", count: 5 });
    expect(stats.topSubjects[1]).toEqual({ name: "A", count: 3 });
  });

  it("skips rows with no category rather than inventing a subject label", () => {
    const stats = computeReadingStats([row({ category: null })], NOW);
    expect(stats.topSubjects).toEqual([]);
  });

  it("counts this-month vs last-month books from last_read_at", () => {
    const thisMonth = new Date(NOW.getFullYear(), NOW.getMonth(), 5).toISOString();
    const lastMonth = new Date(NOW.getFullYear(), NOW.getMonth() - 1, 15).toISOString();
    const stats = computeReadingStats([
      row({ last_read_at: thisMonth }),
      row({ last_read_at: lastMonth }),
    ], NOW);
    expect(stats.thisMonthBooks).toBe(1);
    expect(stats.lastMonthBooks).toBe(1);
  });
});
