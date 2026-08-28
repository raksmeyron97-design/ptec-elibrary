// components/ui/dashboard/TopSubjects.tsx
// My Stats — SECONDARY weight. Same topSubjects definition getReadingStats()
// has always used (category counts among the user's in-progress/completed
// books), just shown top-5 instead of top-3 and as horizontal bars instead
// of chips. Counts are always shown as text — never color/length-only.
import { getTranslations } from "next-intl/server";
import type { ReadingStats } from "@/app/actions/reading-analytics";

export default async function TopSubjects({ topSubjects }: { topSubjects: ReadingStats["topSubjects"] }) {
  const t = await getTranslations("dashboard");
  if (topSubjects.length === 0) return null;

  const max = Math.max(...topSubjects.map((s) => s.count), 1);

  return (
    <section aria-label={t("subjectsHeading")} className="rounded-2xl border border-divider bg-bg-surface p-5">
      <h3 className="mb-4 text-[15px] font-bold text-text-heading">{t("subjectsHeading")}</h3>
      <div className="space-y-2.5">
        {topSubjects.map(({ name, count }) => (
          <div key={name} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-[12.5px] font-medium text-text-body" dir="auto">{name}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper">
              <div className="h-full rounded-full bg-brand/70" style={{ width: `${(count / max) * 100}%` }} />
            </div>
            <span className="w-5 shrink-0 text-right text-[12px] font-bold tabular-nums text-text-heading">{count}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
