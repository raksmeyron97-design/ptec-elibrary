// lib/dashboard/relative-time.ts
// Pure "time ago" bucketing for the dashboard's server-rendered sections
// (Continue Reading's "last opened", Recent Activity). Returns a structured
// unit rather than a formatted string so the caller supplies the translated
// label — keeps this testable without next-intl and keeps every locale's
// copy in messages/*.json rather than hardcoded here.
//
// Safe to compute purely server-side: these are server components (no
// client hydration diff involved), so there is no clock-skew/hydration-
// mismatch concern the way a client-rendered "now" ticker would have.

export type RelativeTimeUnit =
  | { unit: "justNow" }
  | { unit: "minutes"; count: number }
  | { unit: "hours"; count: number }
  | { unit: "days"; count: number }
  | { unit: "weeks"; count: number };

export function relativeTimeUnit(iso: string, nowMs: number = Date.now()): RelativeTimeUnit {
  const diffMs = Math.max(0, nowMs - new Date(iso).getTime());
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return { unit: "justNow" };
  if (minutes < 60) return { unit: "minutes", count: minutes };

  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 24) return { unit: "hours", count: hours };

  const days = Math.floor(diffMs / 86_400_000);
  if (days < 7) return { unit: "days", count: days };

  return { unit: "weeks", count: Math.floor(days / 7) };
}

type Translator = (key: string, values?: Record<string, number>) => string;

/** Resolve a `relativeTimeUnit()` result to translated copy via the `dashboard` namespace. */
export function formatRelativeTime(iso: string, t: Translator, nowMs?: number): string {
  const r = relativeTimeUnit(iso, nowMs);
  switch (r.unit) {
    case "justNow": return t("justNow");
    case "minutes": return t("minutesAgo", { minutes: r.count });
    case "hours":   return t("hoursAgo", { hours: r.count });
    case "days":    return t("daysAgo", { days: r.count });
    case "weeks":   return t("weeksAgo", { weeks: r.count });
  }
}
