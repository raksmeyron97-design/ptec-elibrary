// components/ui/dashboard/MyStats.tsx
// Personal reading analytics — real data only, no fabricated metrics.
// Replaces the old sidebar "My Stats" widget (ReadingStats.tsx) with one
// fuller section instead of two overlapping ones on the same page.
//
// There is no per-day reading-activity log in this schema, so the PRIMARY
// visualization is a real snapshot (completion rate + completed/in-progress
// breakdown) rather than a fabricated time-series chart — see
// ReadingProgressChart.tsx for the detail.
import { Link } from "@/i18n/navigation";
import { BarChart3 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReadingStats } from "@/app/actions/reading-analytics";
import StatsOverview from "@/components/ui/dashboard/StatsOverview";
import ReadingProgressChart from "@/components/ui/dashboard/ReadingProgressChart";
import TopSubjects from "@/components/ui/dashboard/TopSubjects";
import LearningStreak from "@/components/ui/dashboard/LearningStreak";

export default async function MyStats({ stats }: { stats: ReadingStats | null }) {
  const t = await getTranslations("dashboard");

  if (!stats || stats.booksStarted === 0) {
    // Deliberately quieter than ContinueReadingHero's own empty state
    // higher up the page — that one already owns the loud "start your
    // journey" moment for a brand-new user; this just doesn't pretend 0s
    // are meaningful achievements.
    return (
      <section aria-label={t("myStats")} className="flex items-center gap-3 rounded-2xl border border-dashed border-divider bg-bg-surface px-5 py-5">
        <BarChart3 className="h-5 w-5 shrink-0 text-text-muted" aria-hidden="true" />
        <p className="flex-1 text-[13px] text-text-muted">{t("statsEmptyDesc")}</p>
        <Link href="/books" className="focus-field shrink-0 rounded text-[12.5px] font-semibold text-brand hover:underline">
          {t("browseCatalogue")}
        </Link>
      </section>
    );
  }

  return (
    <section aria-label={t("myStats")}>
      <div className="mb-4">
        <h2 className="text-[17px] font-bold text-text-heading">{t("myStats")}</h2>
        <p className="mt-0.5 text-[13px] text-text-muted">{t("statsSubtitle")}</p>
      </div>

      <div className="space-y-4">
        <StatsOverview stats={stats} />
        <ReadingProgressChart stats={stats} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TopSubjects topSubjects={stats.topSubjects} />
          <LearningStreak currentStreak={stats.currentStreak} last7Days={stats.last7Days} />
        </div>
      </div>
    </section>
  );
}
