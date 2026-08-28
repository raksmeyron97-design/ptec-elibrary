// components/ui/dashboard/ReadingProgressChart.tsx
// My Stats — PRIMARY visualization. There is no per-day reading-activity
// log in this schema (reading_progress holds one CURRENT-state row per
// book), so this is a real snapshot view rather than a fabricated trend
// line: the completion rate plus the only two non-overlapping, honestly
// derivable buckets (every progress_pct > 0 row is either done or not).
import { getTranslations } from "next-intl/server";
import type { ReadingStats } from "@/app/actions/reading-analytics";

export default async function ReadingProgressChart({ stats }: { stats: ReadingStats }) {
  const t = await getTranslations("dashboard");
  const inProgress = stats.booksStarted - stats.booksCompleted;
  const max = Math.max(stats.booksStarted, 1);

  const bars = [
    { label: t("statDone"), value: stats.booksCompleted, barClass: "bg-emerald-500" },
    { label: t("statInProgressShort"), value: inProgress, barClass: "bg-brand" },
  ];

  return (
    <section aria-label={t("readingProgressHeading")} className="rounded-2xl border border-divider bg-bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h3 className="text-[15px] font-bold text-text-heading">{t("readingProgressHeading")}</h3>
        <div className="text-right">
          <p className="text-[32px] font-bold leading-none tabular-nums text-brand">{stats.completionRate}%</p>
          <p className="mt-0.5 text-[11px] font-medium text-text-muted">{t("completionRateLabel")}</p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {bars.map(({ label, value, barClass }) => (
          <div key={label} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-[12.5px] font-medium text-text-body">{label}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-paper">
              <div className={`h-full rounded-full ${barClass} transition-all`} style={{ width: `${(value / max) * 100}%` }} />
            </div>
            <span className="w-6 shrink-0 text-right text-[12.5px] font-bold tabular-nums text-text-heading">{value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
