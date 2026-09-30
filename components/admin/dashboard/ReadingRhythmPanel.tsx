import { useLocale, useTranslations } from "next-intl";
import type { WeekdayRhythm } from "@/lib/admin/overview-library";
import DashPanel from "./DashPanel";
import { dateTimeFormat, middayOf, numberFormat } from "./formatters";

/** A Monday, so days[i] is this date plus i days. */
const REFERENCE_MONDAY_MS = Date.parse("2026-09-28T00:00:00Z");

const dayOf = (i: number) => new Date(REFERENCE_MONDAY_MS + i * 86_400_000).toISOString().slice(0, 10);

/**
 * "Busiest reading days" — detail views summed per weekday over the period.
 * It answers a scheduling question the trend line cannot: when to publish a
 * new-arrivals post, or when a staff member watching the chat is most useful.
 *
 * One series, the busiest bar in the brand navy and the rest in its tint, so
 * the answer is the only emphasised mark. The figures sit above each bar as
 * text, and the chart is also a real list, so nothing depends on bar height
 * alone. `rhythm === null` (hourly range, or under a week) says why there is
 * no chart instead of drawing seven empty bars that would read as "nobody
 * reads on Tuesdays".
 */
export default function ReadingRhythmPanel({ rhythm }: { rhythm: WeekdayRhythm | null }) {
  const t = useTranslations("adminDashboard.library.rhythm");
  const locale = useLocale();
  const nf = numberFormat(locale);
  const short = dateTimeFormat(locale, { weekday: "short" });
  const long = dateTimeFormat(locale, { weekday: "long" });

  const max = rhythm ? Math.max(...rhythm.days.map((d) => d.total)) : 0;

  return (
    <DashPanel id="rhythm" title={t("title")} subtitle={t("subtitle")} bodyClassName="dash-panel-body flex flex-col">
      {rhythm === null ? (
        <p className="my-auto py-6 text-center text-sm text-text-muted">{t("needsWeek")}</p>
      ) : rhythm.total === 0 ? (
        <p className="my-auto py-6 text-center text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <>
          <ul className="dash-rhythm">
            {rhythm.days.map((d, i) => {
              const top = i === rhythm.busiest;
              const heightPct = max > 0 ? Math.max(2, Math.round((d.total / max) * 100)) : 2;
              const name = long.format(middayOf(dayOf(i)));
              return (
                <li key={d.weekday} className="dash-rhythm-col" data-top={top ? "" : undefined}>
                  <span className="sr-only">{t("bar", { day: name, count: nf.format(d.total) })}</span>
                  <span className="dash-rhythm-value text-[11px] font-bold tabular-nums text-text-muted" aria-hidden="true">
                    {nf.format(d.total)}
                  </span>
                  {/* The track takes whatever height the panel has left, so
                      the bars fill a panel stretched to its row's height. */}
                  <span className="dash-rhythm-track" aria-hidden="true">
                    <span className="dash-rhythm-bar" style={{ height: `${heightPct}%` }} />
                  </span>
                  <span
                    className={`text-[11px] font-semibold ${top ? "text-[var(--dash-blue)]" : "text-text-muted"}`}
                    aria-hidden="true"
                  >
                    {short.format(middayOf(dayOf(i)))}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 shrink-0 rounded-[10px] bg-[var(--dash-well)] px-3 py-2.5 text-xs leading-[18px] text-text-body">
            {rhythm.busiest !== null && (
              <strong className="font-semibold text-text-heading">
                {t("busiest", { day: long.format(middayOf(dayOf(rhythm.busiest))) })}
              </strong>
            )}
            {rhythm.weekendPct !== null && <> {t("weekend", { pct: rhythm.weekendPct })}</>}
          </p>
        </>
      )}
    </DashPanel>
  );
}
