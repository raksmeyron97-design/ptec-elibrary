export const ANALYTICS_TIME_ZONE = "Asia/Phnom_Penh";
export const ANALYTICS_UTC_OFFSET_HOURS = 7;
export const CHART_GRAINS = ["hour", "day", "week", "month"] as const;
export type ChartGrain = (typeof CHART_GRAINS)[number];

const HOUR_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):00$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const OFFSET_MS = ANALYTICS_UTC_OFFSET_HOURS * HOUR_MS;

export type AnalyticsBucket = {
  key: string;
  grain: ChartGrain;
  start: Date;
  endExclusive: Date;
};

type DateParts = { year: number; month: number; day: number; hour: number };

function validDateParts(parts: DateParts): boolean {
  if (parts.year < 2000 || parts.year > 9999 || parts.month < 1 || parts.month > 12) return false;
  if (parts.hour < 0 || parts.hour > 23) return false;
  const candidate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return (
    candidate.getUTCFullYear() === parts.year &&
    candidate.getUTCMonth() === parts.month - 1 &&
    candidate.getUTCDate() === parts.day
  );
}

/** Convert Phnom Penh wall-clock components to an absolute instant. Cambodia has no DST. */
function localInstant(parts: DateParts): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour) - OFFSET_MS);
}

function localParts(date: Date): DateParts {
  const shifted = new Date(date.getTime() + OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function ymd(parts: DateParts): string {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function datePartsFromKey(key: string, grain: ChartGrain): DateParts | null {
  if (grain === "hour") {
    const match = HOUR_RE.exec(key);
    if (!match) return null;
    const parts = {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4]),
    };
    return validDateParts(parts) ? parts : null;
  }

  const match = DATE_RE.exec(key);
  if (!match) return null;
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: 0,
  };
  if (!validDateParts(parts)) return null;
  if (grain === "month" && parts.day !== 1) return null;
  if (grain === "week") {
    const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
    if (weekday !== 1) return null;
  }
  return parts;
}

/** Strictly parse a canonical analytics bucket without browser-local date semantics. */
export function parseAnalyticsBucket(key: string, grain: ChartGrain): AnalyticsBucket | null {
  const parts = datePartsFromKey(key, grain);
  if (!parts) return null;
  const start = localInstant(parts);
  let endExclusive: Date;
  if (grain === "hour") endExclusive = new Date(start.getTime() + HOUR_MS);
  else if (grain === "day") endExclusive = new Date(start.getTime() + DAY_MS);
  else if (grain === "week") endExclusive = new Date(start.getTime() + 7 * DAY_MS);
  else endExclusive = localInstant({ year: parts.year, month: parts.month + 1, day: 1, hour: 0 });
  return { key, grain, start, endExclusive };
}

/** Produce a canonical local key for an absolute instant. */
export function analyticsBucketKey(date: Date, grain: ChartGrain): string {
  const parts = localParts(date);
  if (grain === "hour") return `${ymd(parts)}T${pad2(parts.hour)}:00`;
  if (grain === "day") return ymd(parts);
  if (grain === "month") return `${parts.year}-${pad2(parts.month)}-01`;

  const calendar = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const daysSinceMonday = (calendar.getUTCDay() + 6) % 7;
  calendar.setUTCDate(calendar.getUTCDate() - daysSinceMonday);
  return `${calendar.getUTCFullYear()}-${pad2(calendar.getUTCMonth() + 1)}-${pad2(calendar.getUTCDate())}`;
}

/** Re-key a canonical day into day/week/month grain. */
export function analyticsBucketKeyFromDay(dayKey: string, grain: Exclude<ChartGrain, "hour">): string | null {
  const day = parseAnalyticsBucket(dayKey, "day");
  return day ? analyticsBucketKey(day.start, grain) : null;
}

export function intersectAnalyticsInterval(
  bucket: AnalyticsBucket,
  lower: Date,
  upperInclusive: Date,
): { start: Date; endInclusive: Date } | null {
  const startMs = Math.max(bucket.start.getTime(), lower.getTime());
  const endMs = Math.min(bucket.endExclusive.getTime() - 1, upperInclusive.getTime());
  if (startMs > endMs) return null;
  return { start: new Date(startMs), endInclusive: new Date(endMs) };
}
