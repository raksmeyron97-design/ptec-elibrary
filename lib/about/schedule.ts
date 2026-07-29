// lib/about/schedule.ts
//
// Turns the published opening-hours spec into the rows the weekly table
// renders. Pure and unit-tested (lib/about/schedule.test.ts).
//
// It reads `openingHoursSpec` (["Mo-Fr 07:00-17:00", …]) rather than the raw
// `weekly` document because that is what the public SiteConfig actually
// exposes (lib/system-settings/types.ts) — deriving from the spec keeps this
// page on the same published data as the footer, the JSON-LD and the "open
// now" badge, with no second source to fall out of step.
//
// Grouping rule: consecutive days in Mon→Sun order that share an identical set
// of opening windows collapse into one row ("Monday – Friday"). Days with no
// windows collect into a single closed row. This is the same grouping
// groupWeekly() applies in lib/system-settings/hours.ts, restated over the
// parsed spec.

import { parseOpeningHours, type DayRange } from "@/lib/library-hours";

/** Mon→Sun scan order in JS weekday numbers (0 = Sunday). */
const SCAN_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export type WeeklyGroup = {
  /** JS weekday numbers this row covers, in scan order. */
  days: number[];
  /** Opening windows, minutes from local midnight. Empty = closed. */
  intervals: DayRange[];
};

export type WeeklySchedule = {
  /** Rows with at least one opening window. */
  open: WeeklyGroup[];
  /** Weekdays with no opening windows at all. */
  closedDays: number[];
};

function intervalsKey(intervals: DayRange[]): string {
  return intervals.map((r) => `${r.open}-${r.close}`).join(",");
}

/**
 * Group a schema.org opening-hours spec into display rows.
 *
 * An empty or unparseable spec yields no open rows AND no closed days — the
 * caller must treat that as "schedule unavailable", never as "closed all
 * week". Reporting a building as closed because a config read failed is the
 * kind of wrong answer that sends someone across town for nothing.
 */
export function groupWeeklySpec(spec: readonly string[]): WeeklySchedule {
  const parsed = parseOpeningHours(spec);
  const hasAny = Object.values(parsed).some((ranges) => ranges.length > 0);
  if (!hasAny) return { open: [], closedDays: [] };

  const open: WeeklyGroup[] = [];
  const closedDays: number[] = [];

  let i = 0;
  while (i < SCAN_ORDER.length) {
    const day = SCAN_ORDER[i];
    const intervals = [...parsed[day]].sort((a, b) => a.open - b.open);
    if (intervals.length === 0) {
      closedDays.push(day);
      i++;
      continue;
    }
    const key = intervalsKey(intervals);
    let j = i;
    while (
      j + 1 < SCAN_ORDER.length &&
      intervalsKey([...parsed[SCAN_ORDER[j + 1]]].sort((a, b) => a.open - b.open)) === key
    ) {
      j++;
    }
    open.push({ days: SCAN_ORDER.slice(i, j + 1) as unknown as number[], intervals });
    i = j + 1;
  }

  return { open, closedDays };
}

/** Minutes-from-midnight → "HH:MM", the shape formatClock() consumes. */
export function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** The weekday (0 = Sunday) it currently is in Cambodia. */
export function cambodiaWeekday(now: Date, timeZone = "Asia/Phnom_Penh"): number {
  const label = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(now);
  const index = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(label);
  return index < 0 ? 0 : index;
}

/** Today's opening windows, or an empty array when closed today. */
export function todayIntervals(
  spec: readonly string[],
  now: Date,
  timeZone = "Asia/Phnom_Penh",
): DayRange[] {
  const parsed = parseOpeningHours(spec);
  const weekday = cambodiaWeekday(now, timeZone);
  return [...(parsed[weekday] ?? [])].sort((a, b) => a.open - b.open);
}
