// components/ui/dashboard/ReadingSummary.tsx
// "Your reading" — one card that replaces three sections: the Library
// Snapshot count row, the four-tile My Stats row, and the Reading Progress /
// Subjects / Learning Streak cards beneath it. Between them they spent ~800px
// on a phone saying "you have started 5 books and finished 1", three times,
// in three visual styles.
//
// Every figure is real (lib/dashboard/reading-stats.ts): counts are rows, the
// week strip is the same last_read_at date set the streak is built from, and
// pages read is labelled an estimate because it is one. Nothing is shown as
// an achievement when it is zero — the insight row and subjects only appear
// once a book has been started.
import { BookOpen, CheckCircle2, Bookmark, ListChecks, Flame, BarChart3 } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReadingStats } from "@/lib/dashboard/reading-stats";
import LibraryTabLink from "@/components/ui/dashboard/LibraryTabLink";
import type { LibraryTab } from "@/components/ui/dashboard/library-tab";
import { CARD, CardHeader } from "@/components/ui/dashboard/primitives";

type Counts = { inProgress: number; completed: number; saved: number; lists: number };

export default async function ReadingSummary({ stats, counts }: { stats: ReadingStats; counts: Counts }) {
  const t = await getTranslations("dashboard");
  const locale = await getLocale();
  const intlLocale = locale === "km" ? "km-KH" : "en-US";
  const number = new Intl.NumberFormat(intlLocale);

  const tiles: { tab: LibraryTab; value: number; label: string; icon: typeof BookOpen }[] = [
    { tab: "reading", value: counts.inProgress, label: t("statInProgressShort"), icon: BookOpen },
    { tab: "reading", value: counts.completed,  label: t("statDone"),            icon: CheckCircle2 },
    { tab: "saved",   value: counts.saved,      label: t("summarySaved"),        icon: Bookmark },
    { tab: "lists",   value: counts.lists,      label: t("statLists"),           icon: ListChecks },
  ];

  // Server clock, like the greeting: no per-reader timezone is stored.
  const weekdayFmt = new Intl.DateTimeFormat(intlLocale, { weekday: "narrow" });
  const fullDateFmt = new Intl.DateTimeFormat(intlLocale, { weekday: "long", month: "short", day: "numeric" });
  const flags = stats.last7Days ?? [];
  const days = flags.map((active, idx) => {
    const date = new Date();
    date.setDate(date.getDate() - (flags.length - 1 - idx));
    return { active, today: idx === flags.length - 1, label: weekdayFmt.format(date), title: fullDateFmt.format(date) };
  });

  const started = stats.booksStarted > 0;

  return (
    <section aria-labelledby="summary-heading" className={`${CARD} flex h-full flex-col pb-5`}>
      <CardHeader id="summary-heading" title={t("yourReading")} icon={BarChart3} />

      <ul className="grid grid-cols-2 gap-2 px-5">
        {tiles.map(({ tab, value, label, icon: Icon }) => (
          <li key={label}>
            <LibraryTabLink
              tab={tab}
              className="focus-field group flex h-full flex-col rounded-xl bg-paper/70 px-3.5 py-3 transition-colors hover:bg-surface-brand-soft dark:bg-paper/40"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[24px] font-bold leading-none tabular-nums text-text-heading">{number.format(value)}</span>
                <Icon className="h-4 w-4 text-text-muted transition-colors group-hover:text-brand" aria-hidden="true" />
              </span>
              <span className="mt-1.5 text-[12px] font-medium leading-tight text-text-muted">{label}</span>
            </LibraryTabLink>
          </li>
        ))}
      </ul>

      <div className="mx-5 mt-5 border-t border-divider pt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-[12.5px] font-semibold text-text-heading">{t("last7Days")}</h3>
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-text-body">
            {stats.currentStreak > 0 ? (
              <>
                <Flame className="h-3.5 w-3.5 text-accent-text" aria-hidden="true" />
                {t("streakDays", { count: stats.currentStreak })}
              </>
            ) : (
              <span className="font-medium text-text-muted">{t("streakNone")}</span>
            )}
          </p>
        </div>
        {days.length > 0 && (
          <ol className="grid grid-cols-7 gap-1.5" aria-label={t("last7Days")}>
            {days.map((d) => (
              <li key={d.title} className="flex flex-col items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={`h-7 w-full rounded-md ${
                    d.active ? "bg-brand" : "bg-paper ring-1 ring-inset ring-divider dark:bg-paper/60"
                  } ${d.today ? "outline-2 outline-offset-2 outline-accent" : ""}`}
                />
                <span aria-hidden="true" className={`text-[10.5px] ${d.today ? "font-bold text-text-heading" : "font-medium text-text-muted"}`}>
                  {d.label}
                </span>
                <span className="sr-only">
                  {d.title}: {d.active ? t("activeDayLabel") : t("inactiveDayLabel")}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {started && (
        <dl className="mx-5 mt-4 grid grid-cols-2 gap-3 border-t border-divider pt-4">
          <div>
            <dt className="text-[11.5px] text-text-muted">{t("pagesRead")}</dt>
            <dd className="mt-0.5 text-[16px] font-bold tabular-nums text-text-heading">{number.format(stats.pagesRead)}</dd>
          </div>
          <div>
            <dt className="text-[11.5px] text-text-muted">{t("statCompletionRate")}</dt>
            <dd className="mt-0.5 text-[16px] font-bold tabular-nums text-text-heading">{stats.completionRate}%</dd>
          </div>
        </dl>
      )}

      {started && stats.topSubjects.length > 0 && (
        <div className="mx-5 mt-4 border-t border-divider pt-4">
          <h3 className="mb-2 text-[11.5px] text-text-muted">{t("subjectsHeading")}</h3>
          <ul className="flex flex-wrap gap-1.5">
            {stats.topSubjects.slice(0, 4).map(({ name, count }) => (
              <li
                key={name}
                dir="auto"
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-brand-soft px-2.5 py-1 text-[12px] font-semibold text-brand"
              >
                {name}
                <span className="tabular-nums text-brand/70">{number.format(count)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
