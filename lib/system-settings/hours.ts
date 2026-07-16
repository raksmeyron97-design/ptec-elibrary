// lib/system-settings/hours.ts
//
// Pure derivations from the structured HoursSettings document. Client-safe.
//
// The stored shape is weekly intervals + special closures; EVERYTHING shown to
// visitors is derived here so a schedule edit in /admin/system-settings
// propagates to the schema.org spec, the footer/contact sentences and the
// "open now" logic without any hand-written strings that can drift:
//
//   weeklyToOpeningHoursSpec()  → ["Mo-Fr 07:00-17:00", …] (lib/library-hours
//                                 parses this; JSON-LD uses it verbatim)
//   hoursSentence("en"|"km")    → the human sentence previously hard-coded in
//                                 lib/ptec.ts (pinned by tests)
//   activeClosure()             → the special closure covering "today" in
//                                 Asia/Phnom_Penh, if any

import { hhmmToMinutes } from "./schemas";
import type { HoursClosure, HoursInterval, HoursSettings } from "./types";

// Mo→Su scan order (JS weekday numbers) and schema.org tokens.
const SCAN_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const SCHEMA_TOKENS: Record<number, string> = {
  0: "Su", 1: "Mo", 2: "Tu", 3: "We", 4: "Th", 5: "Fr", 6: "Sa",
};

const EN_DAY = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;
const KM_DAY = [
  "អាទិត្យ", "ច័ន្ទ", "អង្គារ", "ពុធ", "ព្រហស្បតិ៍", "សុក្រ", "សៅរ៍",
] as const;

/** Full weekday name for a JS weekday index (0 = Sunday). */
export function dayName(locale: "en" | "km", jsDay: number): string {
  return (locale === "km" ? KM_DAY : EN_DAY)[jsDay] ?? "";
}

const KM_DIGITS = ["០", "១", "២", "៣", "៤", "៥", "៦", "៧", "៨", "៩"] as const;

function toKmDigits(n: number | string): string {
  return String(n).replace(/\d/g, (d) => KM_DIGITS[Number(d)]);
}

function intervalsKey(list: HoursInterval[]): string {
  return list.map((r) => `${r.open}-${r.close}`).join(",");
}

type DayGroup = { days: number[]; intervals: HoursInterval[] };

/** Consecutive Mo→Su days sharing an identical interval list. */
export function groupWeekly(weekly: HoursSettings["weekly"]): {
  open: DayGroup[];
  closedDays: number[];
} {
  const open: DayGroup[] = [];
  const closedDays: number[] = [];
  let i = 0;
  while (i < SCAN_ORDER.length) {
    const day = SCAN_ORDER[i];
    const intervals = weekly[String(day)] ?? [];
    if (intervals.length === 0) {
      closedDays.push(day);
      i++;
      continue;
    }
    const key = intervalsKey(intervals);
    let j = i;
    while (
      j + 1 < SCAN_ORDER.length &&
      intervalsKey(weekly[String(SCAN_ORDER[j + 1])] ?? []) === key
    ) {
      j++;
    }
    open.push({ days: SCAN_ORDER.slice(i, j + 1) as unknown as number[], intervals });
    i = j + 1;
  }
  return { open, closedDays };
}

/** schema.org openingHours spec, e.g. ["Mo-Fr 07:00-17:00", "Sa 08:00-16:00"]. */
export function weeklyToOpeningHoursSpec(weekly: HoursSettings["weekly"]): string[] {
  const { open } = groupWeekly(weekly);
  const out: string[] = [];
  for (const group of open) {
    const first = SCHEMA_TOKENS[group.days[0]];
    const last = SCHEMA_TOKENS[group.days[group.days.length - 1]];
    const dayPart = group.days.length === 1 ? first : `${first}-${last}`;
    for (const r of group.intervals) {
      out.push(`${dayPart} ${r.open}-${r.close}`);
    }
  }
  return out;
}

// ── Human sentences ──────────────────────────────────────────────────────────

function enTime(hhmm: string): string {
  const min = hhmmToMinutes(hhmm);
  const h = Math.floor(min / 60);
  const m = min % 60;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Khmer clock label with day-period word: 07:00 → "៧:០០ ព្រឹក",
 *  16:00 → "៤:០០ រសៀល", 17:00 → "៥:០០ ល្ងាច", 20:00 → "៨:០០ យប់". */
function kmTime(hhmm: string): string {
  const min = hhmmToMinutes(hhmm);
  const h = Math.floor(min / 60);
  const m = min % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const period = h < 12 ? "ព្រឹក" : h < 17 ? "រសៀល" : h < 19 ? "ល្ងាច" : "យប់";
  return `${toKmDigits(h12)}:${toKmDigits(String(m).padStart(2, "0"))} ${period}`;
}

/**
 * The display sentence previously hand-written in lib/ptec.ts, derived from
 * the schedule. For the default schedule this produces EXACTLY:
 *   en: "Monday – Friday: 7:00 AM – 5:00 PM · Saturday: 8:00 AM – 4:00 PM (Sunday: Closed)"
 *   km: "ច័ន្ទ – សុក្រ: ម៉ោង ៧:០០ ព្រឹក – ៥:០០ ល្ងាច · សៅរ៍: ៨:០០ ព្រឹក – ៤:០០ រសៀល (ថ្ងៃអាទិត្យ: បិទ)"
 */
export function hoursSentence(locale: "en" | "km", weekly: HoursSettings["weekly"]): string {
  const { open, closedDays } = groupWeekly(weekly);
  const dayNames = locale === "km" ? KM_DAY : EN_DAY;
  const fmt = locale === "km" ? kmTime : enTime;

  const segments = open.map((group, idx) => {
    const first = dayNames[group.days[0]];
    const last = dayNames[group.days[group.days.length - 1]];
    const dayLabel = group.days.length === 1 ? first : `${first} – ${last}`;
    const times = group.intervals
      .map((r) => `${fmt(r.open)} – ${fmt(r.close)}`)
      .join(" & ");
    // Khmer style: "ម៉ោង" (o'clock) is spoken before the first time only.
    const prefix = locale === "km" && idx === 0 ? "ម៉ោង " : "";
    return `${dayLabel}: ${prefix}${times}`;
  });

  let sentence = segments.join(" · ");
  if (closedDays.length > 0) {
    const closedLabel = closedDays
      .map((d) => (locale === "km" ? `ថ្ងៃ${dayNames[d]}` : dayNames[d]))
      .join(locale === "km" ? " " : ", ");
    const closedWord = locale === "km" ? "បិទ" : "Closed";
    sentence += ` (${closedLabel}: ${closedWord})`;
  }
  return sentence;
}

// ── Special closures ─────────────────────────────────────────────────────────

/** "YYYY-MM-DD" for `now` in the given timezone (Cambodia by default). */
export function localISODate(now: Date, timeZone = "Asia/Phnom_Penh"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The closure covering `now` (Cambodia-local date), or null. */
export function activeClosure(
  now: Date,
  closures: HoursClosure[],
  timeZone = "Asia/Phnom_Penh",
): HoursClosure | null {
  if (!closures.length) return null;
  const today = localISODate(now, timeZone);
  return closures.find((c) => c.from <= today && today <= c.to) ?? null;
}

/** Closures that have not fully passed yet (for the admin overview). */
export function upcomingClosures(
  now: Date,
  closures: HoursClosure[],
  timeZone = "Asia/Phnom_Penh",
): HoursClosure[] {
  const today = localISODate(now, timeZone);
  return closures.filter((c) => c.to >= today);
}
