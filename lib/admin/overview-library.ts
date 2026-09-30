/**
 * Pure shaping for the library-facing panels of the admin Overview: the
 * reading-rhythm bars and the publishing calendar.
 *
 * Nothing here queries anything. Both take series and dates the Overview has
 * ALREADY loaded (the engagement series, the content catalog), so the panels
 * they feed cost no extra round trip — and the rules can be tested offline.
 *
 * Every date string here is a Phnom Penh calendar day ("YYYY-MM-DD"), the key
 * `dayKey()` in lib/admin/dashboard.ts produces. A weekday is read from that
 * string with UTC arithmetic on purpose: the string already IS the local day,
 * so converting it through the server's own timezone again is how a Monday
 * becomes a Sunday on a UTC host.
 */

import type { TrendPoint } from "./dashboard";

/** Monday first — the week as it is written in Cambodia. */
export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 0 = Monday … 6 = Sunday, or null when the key is not a calendar day. */
export function weekdayIndex(day: string): number | null {
  const m = DAY_RE.exec(day);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (!Number.isFinite(ms)) return null;
  return (new Date(ms).getUTCDay() + 6) % 7;
}

export type WeekdayRhythm = {
  /** Mon → Sun. `days` is how many calendar days of that weekday the window
   *  held, so a 10-day window's two Mondays are not read as one busy Monday. */
  days: { weekday: Weekday; total: number; days: number }[];
  total: number;
  /** Index into `days` of the busiest weekday, or null when nothing happened. */
  busiest: number | null;
  /** Saturday + Sunday as a share of the total, 0–100. */
  weekendPct: number | null;
};

/**
 * Totals per weekday over a DAILY series.
 *
 * Returns null — "this panel has nothing honest to say" — rather than a chart
 * of zeros when the series is hourly (the Today range) or spans under a week:
 * with fewer than seven days some weekdays are simply absent, and a bar chart
 * would present "no Tuesday in the window" as "nobody reads on Tuesdays".
 */
export function weekdayRhythm(series: readonly TrendPoint[]): WeekdayRhythm | null {
  if (series.length < 7) return null;
  const days = WEEKDAYS.map((weekday) => ({ weekday, total: 0, days: 0 }));
  for (const point of series) {
    const i = weekdayIndex(point.date);
    if (i === null) return null; // an hourly key — not a daily series
    days[i].total += point.value;
    days[i].days += 1;
  }
  const total = days.reduce((sum, d) => sum + d.total, 0);
  let busiest: number | null = null;
  for (let i = 0; i < days.length; i++) {
    if (days[i].total > 0 && (busiest === null || days[i].total > days[busiest].total)) busiest = i;
  }
  const weekend = days[5].total + days[6].total;
  return {
    days,
    total,
    busiest,
    weekendPct: total > 0 ? Math.round((weekend / total) * 100) : null,
  };
}

export type CalendarCell = { date: string; day: number; inMonth: boolean };

/** "2026-09" for a "YYYY-MM-DD" day key. */
export function monthOf(day: string): string | null {
  const m = DAY_RE.exec(day);
  return m ? `${m[1]}-${m[2]}` : null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * The cells of a month view: whole Monday-first weeks, with the days of the
 * neighbouring months that complete the first and last week marked
 * `inMonth: false` (drawn muted, never counted).
 */
export function monthGrid(month: string): CalendarCell[] {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return [];
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  const first = Date.UTC(year, monthIndex, 1);
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const lead = (new Date(first).getUTCDay() + 6) % 7;
  const cellCount = Math.ceil((lead + daysInMonth) / 7) * 7;

  const cells: CalendarCell[] = [];
  for (let i = 0; i < cellCount; i++) {
    const d = new Date(first + (i - lead) * 86_400_000);
    cells.push({
      date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === monthIndex,
    });
  }
  return cells;
}

/**
 * Per-day publishing counts for one month, from publish timestamps already
 * converted to Phnom Penh day keys. Days outside the month are dropped, so a
 * caller can hand over a whole catalog's worth of keys.
 */
export function publishingDays(month: string, dayKeys: readonly string[]): { date: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const key of dayKeys) {
    if (monthOf(key) !== month) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
