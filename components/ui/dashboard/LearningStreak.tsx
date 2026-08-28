// components/ui/dashboard/LearningStreak.tsx
// My Stats — TERTIARY weight. Real streak count + a real 7-day activity
// row, both built from the same last_read_at-derived date set
// computeReadingStats() already uses for the streak — never an assumed
// active day. Weekday letters are locale-formatted (Intl), so Khmer gets
// real localized single-letter labels with no extra translation keys.
import { Flame } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

export default async function LearningStreak({
  currentStreak, last7Days,
}: { currentStreak: number; last7Days: boolean[] | undefined }) {
  const t = await getTranslations("dashboard");
  const locale = await getLocale();

  const weekdayFmt = new Intl.DateTimeFormat(locale === "km" ? "km-KH" : "en-US", { weekday: "narrow" });
  const fullDateFmt = new Intl.DateTimeFormat(locale === "km" ? "km-KH" : "en-US", { weekday: "long", month: "short", day: "numeric" });

  const days = (last7Days ?? []).map((active, idx) => {
    const offsetFromToday = (last7Days?.length ?? 7) - 1 - idx; // 0 = today
    const date = new Date();
    date.setDate(date.getDate() - offsetFromToday);
    return { active, label: weekdayFmt.format(date), title: fullDateFmt.format(date) };
  });

  return (
    <section aria-label={t("streakHeading")} className="rounded-2xl border border-divider bg-bg-surface p-5">
      <h3 className="mb-3 text-[15px] font-bold text-text-heading">{t("streakHeading")}</h3>

      <div className="flex items-center gap-2.5">
        <Flame className="h-6 w-6 text-orange-500" aria-hidden="true" />
        <span className="text-[24px] font-bold leading-none tabular-nums text-text-heading">
          {t("streakValue", { count: currentStreak })}
        </span>
      </div>

      <p className="mt-1.5 text-[12.5px] text-text-muted">
        {currentStreak > 0 ? t("streakDescription", { count: currentStreak }) : t("streakDescriptionZero")}
      </p>

      {days.length > 0 && (
        <div className="mt-4 flex justify-between gap-1.5">
          {days.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <span className="text-[10px] font-semibold text-text-muted">{d.label}</span>
              <span
                title={d.title}
                aria-label={`${d.title}: ${d.active ? t("activeDayLabel") : t("inactiveDayLabel")}`}
                className={`h-3 w-3 rounded-full ${d.active ? "bg-orange-500" : "border border-divider bg-transparent"}`}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
