import { getTranslations, getLocale } from "next-intl/server";
import type { HealthLevel } from "@/lib/admin/dashboard-shared";
import { dateTimeFormat } from "./formatters";

const LEVEL_DOT: Record<HealthLevel, string> = {
  operational: "bg-emerald-500",
  degraded: "bg-amber-500",
  critical: "bg-rose-500",
  unknown: "bg-slate-400",
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
    <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-divider/70 pt-2.5 text-[11px] text-text-muted">
      <p className="flex items-center gap-1.5">
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${LEVEL_DOT[level]}`} />
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
