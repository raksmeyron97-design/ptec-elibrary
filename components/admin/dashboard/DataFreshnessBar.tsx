import { getTranslations, getLocale } from "next-intl/server";
import type { HealthLevel } from "@/lib/admin/dashboard-shared";
import { dateTimeFormat } from "./formatters";

/** Same status vocabulary as every other state mark on the dashboard. */
const LEVEL_STATUS: Record<HealthLevel, string> = {
  operational: "dash-status--ok",
  degraded: "dash-status--warn",
  critical: "dash-status--crit",
  unknown: "dash-status--neutral",
};

/**
 * Footer stating exactly how current the numbers are and what they exclude.
 *
 * Dashboard data is queried per request with no cache, so freshness equals
 * render time — the bar says so rather than implying a background pipeline. If
 * a section did fail, its own boundary reports it; this line never claims
 * stale data is live.
 */
export default async function DataFreshnessBar({
  generatedAt,
  level,
  notes,
}: {
  generatedAt: string;
  level: HealthLevel;
  notes: string[];
}) {
  const [t, locale] = await Promise.all([getTranslations("adminDashboard.states"), getLocale()]);
  const time = dateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(generatedAt));

  return (
    <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[var(--dash-line)] pt-2.5 text-xs text-text-muted">
      <p className={`${LEVEL_STATUS[level]} flex items-center gap-1.5`}>
        <span aria-hidden="true" className="dash-dot" />
        {t("liveAt", { time, tz: "Asia/Phnom_Penh" })}
      </p>
      {notes.length > 0 && (
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </footer>
  );
}
