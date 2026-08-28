// components/ui/dashboard/StatsOverview.tsx
// My Stats — SECONDARY weight KPI row. Plain stat tiles, not links:
// LibrarySnapshot above already owns the "click a count to go browse it"
// job, this section is for insight, not navigation.
import { BookOpen, FileText, CheckCircle2, Flame } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReadingStats } from "@/app/actions/reading-analytics";

export default async function StatsOverview({ stats }: { stats: ReadingStats }) {
  const t = await getTranslations("dashboard");

  const tiles = [
    { icon: BookOpen,     value: stats.booksStarted,   label: t("statBooksRead") },
    { icon: FileText,     value: stats.pagesRead,      label: t("pagesRead") },
    { icon: CheckCircle2, value: stats.booksCompleted, label: t("statDone") },
    { icon: Flame,        value: t("streakValue", { count: stats.currentStreak }), label: t("statCurrentStreak") },
  ];

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
      {tiles.map(({ icon: Icon, value, label }) => (
        <div key={label} className="rounded-2xl border border-divider bg-bg-surface px-4 py-3.5">
          <Icon className="h-4 w-4 text-brand" aria-hidden="true" />
          <p className="mt-1.5 text-[22px] font-bold leading-none tabular-nums text-text-heading">{value}</p>
          <p className="mt-1 text-[11.5px] font-medium leading-tight text-text-muted">{label}</p>
        </div>
      ))}
    </div>
  );
}
