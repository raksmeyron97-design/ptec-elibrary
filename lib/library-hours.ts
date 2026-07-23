// lib/library-hours.ts
//
// Pure, timezone-correct "is the physical library open right now?" logic for
// the homepage "Library Now" bridge.
//
// The opening-hours spec (schema.org syntax, e.g. "Mo-Fr 07:00-17:00") is a
// REQUIRED argument on every entry point here. It comes from the published
// system settings — `(await getSiteConfig()).hours.openingHoursSpec` — and is
// threaded down from the server component. These functions used to default to
// the compiled-in PTEC constant, which meant a forgotten argument silently
// rendered last year's schedule instead of failing; the default is gone on
// purpose.
//
// Everything is evaluated in Cambodia local time — NEVER the viewer's device
// timezone. Cambodia (Asia/Phnom_Penh) is UTC+7 year-round with no DST.
// getLibraryStatus() is a pure function of `now`, so it is unit-tested against
// fixed instants. Label formatting lives here too so the UI stays declarative.

export const LIBRARY_TIMEZONE = "Asia/Phnom_Penh";

/** A single open→close window, expressed in minutes from local midnight. */
export type DayRange = { open: number; close: number };
/** weekday (0=Sun … 6=Sat, JS convention) → its opening windows */
export type Schedule = Record<number, DayRange[]>;

// schema.org day tokens, in Mo→Su order, mapped to JS getDay() indices.
const DAY_ORDER = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
const TOKEN_TO_JS_DAY: Record<string, number> = {
  Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6,
};

function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Parse a schema.org openingHours spec into a per-weekday schedule.
 * Supports day ranges ("Mo-Fr"), single days ("Sa") and comma lists.
 * Unknown or malformed entries are skipped rather than thrown.
 */
export function parseOpeningHours(spec: readonly string[]): Schedule {
  const sched: Schedule = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const entry of spec) {
    const parts = entry.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const [daysPart, timePart] = parts;
    const [openS, closeS] = timePart.split("-");
    if (!openS || !closeS) continue;
    const range: DayRange = { open: hhmmToMinutes(openS), close: hhmmToMinutes(closeS) };
    if (range.close <= range.open) continue;

    for (const dayTok of daysPart.split(",")) {
      if (dayTok.includes("-")) {
        const [a, b] = dayTok.split("-");
        const ai = DAY_ORDER.indexOf(a as (typeof DAY_ORDER)[number]);
        const bi = DAY_ORDER.indexOf(b as (typeof DAY_ORDER)[number]);
        if (ai < 0 || bi < 0) continue;
        for (let i = ai; i <= bi; i++) {
          sched[TOKEN_TO_JS_DAY[DAY_ORDER[i]]].push({ ...range });
        }
      } else if (dayTok in TOKEN_TO_JS_DAY) {
        sched[TOKEN_TO_JS_DAY[dayTok]].push({ ...range });
      }
    }
  }
  return sched;
}

/** Cambodia-local weekday + minutes-from-midnight for any instant. */
export function zonedNow(
  now: Date,
  tz: string = LIBRARY_TIMEZONE,
): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  // hour12:false can emit "24" at midnight in some engines — normalise.
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const WD: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return { weekday: WD[wd] ?? 0, minutes: hour * 60 + minute };
}

export type LibraryStatus = {
  isOpen: boolean;
  /** Minutes-from-midnight the current window closes, when open. */
  closesAtMin: number | null;
  /** The next opening, when closed. `dayOffset` 0 = later today. */
  nextOpen: { dayOffset: number; weekday: number; openMin: number } | null;
};

/**
 * Is the physical library open at `now`? Pure; timezone-correct.
 * When closed, resolves the next opening within the coming week.
 */
export function getLibraryStatus(
  now: Date,
  spec: readonly string[],
  tz: string = LIBRARY_TIMEZONE,
): LibraryStatus {
  const sched = parseOpeningHours(spec);
  const { weekday, minutes } = zonedNow(now, tz);

  for (const r of sched[weekday]) {
    if (minutes >= r.open && minutes < r.close) {
      return { isOpen: true, closesAtMin: r.close, nextOpen: null };
    }
  }

  // Scan today (later windows) then the next 7 days for the next opening.
  for (let offset = 0; offset < 8; offset++) {
    const wd = (weekday + offset) % 7;
    const ranges = [...sched[wd]].sort((a, b) => a.open - b.open);
    for (const r of ranges) {
      if (offset === 0 && r.open <= minutes) continue; // already elapsed today
      return { isOpen: false, closesAtMin: null, nextOpen: { dayOffset: offset, weekday: wd, openMin: r.open } };
    }
  }
  return { isOpen: false, closesAtMin: null, nextOpen: null };
}

/** Format minutes-from-midnight as a locale-appropriate clock label. */
export function formatTimeLabel(min: number, locale: string): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const mm = String(m).padStart(2, "0");
  if (locale === "km") return `${h}:${mm}`; // 24-hour, matches Khmer hour strings
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${period}`;
}

/** "7:00–17:00" (24-hour, en-dash) — shared by compactHoursLabel. */
function compactRange(r: DayRange): string {
  const f = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
  return `${f(r.open)}–${f(r.close)}`;
}

// Khmer weekday initials for the compact label (ច=Mon … អា=Sun).
const KM_DAY_SHORT = ["អា", "ច", "អ", "ព", "ព្រ", "សុ", "សៅ"] as const;
const EN_DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * Compact one-line hours label derived from the openingHoursSpec SSOT —
 * e.g. km: "ច-សុ 7:00–17:00 · ស 8:00–16:00", en: "Mon-Fri 7:00–17:00 ·
 * Sat 8:00–16:00". Use this instead of hand-writing hour strings so a
 * schedule change published in /admin/system-settings propagates everywhere.
 */
export function compactHoursLabel(
  locale: "en" | "km",
  spec: readonly string[],
): string {
  const sched = parseOpeningHours(spec);
  const names = locale === "km" ? KM_DAY_SHORT : EN_DAY_SHORT;
  const segments: string[] = [];
  // Group consecutive weekdays (Mon→Sun scan) sharing an identical window.
  const order = [1, 2, 3, 4, 5, 6, 0];
  let i = 0;
  while (i < order.length) {
    const ranges = sched[order[i]];
    if (!ranges.length) { i++; continue; }
    const key = ranges.map(compactRange).join(",");
    let j = i;
    while (j + 1 < order.length && sched[order[j + 1]].map(compactRange).join(",") === key) j++;
    const dayLabel = i === j ? names[order[i]] : `${names[order[i]]}-${names[order[j]]}`;
    segments.push(`${dayLabel} ${key}`);
    i = j + 1;
  }
  return segments.join(" · ");
}

/**
 * Localised short weekday label for a day `dayOffset` days after `now`, read in
 * Cambodia time. Cambodia has no DST, so adding whole days is exact.
 */
export function weekdayLabel(now: Date, dayOffset: number, locale: string, tz: string = LIBRARY_TIMEZONE): string {
  const target = new Date(now.getTime() + dayOffset * 86_400_000);
  return new Intl.DateTimeFormat(locale === "km" ? "km" : "en-US", {
    timeZone: tz,
    weekday: "short",
  }).format(target);
}
