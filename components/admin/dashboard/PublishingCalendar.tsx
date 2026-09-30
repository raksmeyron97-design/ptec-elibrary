import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { OverviewData } from "@/lib/admin/intelligence";
import type { ScheduledItem } from "@/lib/admin/collection-pulse";
import { WEEKDAYS, monthGrid } from "@/lib/admin/overview-library";
import DashPanel from "./DashPanel";
import { dateTimeFormat, middayOf, phnomPenhDay } from "./formatters";

/** A Monday, so WEEKDAYS[i] is this date plus i days. */
const REFERENCE_MONDAY = "2026-09-28";

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The reference design's calendar, for a library: which days of the month
 * content went live (gold dot), which days something is scheduled to (ring),
 * and — under the grid — the next scheduled items themselves.
 *
 * The month is the one the selected period ENDS in, so the calendar and the
 * trend beside it describe the same stretch of time. Publish days come from
 * the catalog the Overview already loaded; the only extra read is the short
 * scheduled list. A table, because a month IS a table: screen readers can
 * move by week and by weekday, and every day cell says what happened on it.
 */
export default function PublishingCalendar({
  publishing,
  scheduled,
  scheduledAllowed,
  editable,
  className,
}: {
  publishing: OverviewData["publishing"];
  /** Null = could not be read (or not permitted — see `scheduledAllowed`). */
  scheduled: ScheduledItem[] | null;
  /** False when the viewer may open none of the scheduled types: the
   *  "Coming up" list is then omitted rather than reported as failed. */
  scheduledAllowed: boolean;
  editable: Partial<Record<ScheduledItem["type"], boolean>>;
  className?: string;
}) {
  const t = useTranslations("adminDashboard.library.calendar");
  const locale = useLocale();

  const counts = new Map(publishing.days.map((d) => [d.date, d.count]));
  const scheduledDays = new Set(
    (scheduled ?? []).map((s) => phnomPenhDay(s.at)).filter((d): d is string => !!d),
  );
  const cells = monthGrid(publishing.month);
  const weeks: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const monthName = dateTimeFormat(locale, { month: "long", year: "numeric" }).format(
    middayOf(`${publishing.month}-15`),
  );
  const weekdayShort = dateTimeFormat(locale, { weekday: "short" });
  const weekdayLong = dateTimeFormat(locale, { weekday: "long" });
  const dayLong = dateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" });
  const monthShort = dateTimeFormat(locale, { month: "short" });
  const dayNumber = dateTimeFormat(locale, { day: "numeric" });
  const timeShort = dateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });

  return (
    <DashPanel
      id="calendar"
      title={t("title")}
      subtitle={t("subtitle", { count: publishing.days.length, month: monthName })}
      bodyClassName="flex flex-col"
      className={className}
    >
      <div className="px-4 pt-3">
        <table className="w-full table-fixed border-collapse">
          <caption className="sr-only">{monthName}</caption>
          <thead>
            <tr>
              {WEEKDAYS.map((w, i) => {
                const day = middayOf(addDays(REFERENCE_MONDAY, i));
                return (
                  <th key={w} scope="col" className="dash-cal-dow">
                    <abbr title={weekdayLong.format(day)} className="no-underline">
                      {weekdayShort.format(day)}
                    </abbr>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week[0].date}>
                {week.map((cell) => {
                  const count = cell.inMonth ? (counts.get(cell.date) ?? 0) : 0;
                  const isToday = cell.date === publishing.today;
                  const isScheduled = scheduledDays.has(cell.date);
                  return (
                    <td
                      key={cell.date}
                      className="dash-cal-day"
                      data-out={cell.inMonth ? undefined : ""}
                      data-today={isToday ? "" : undefined}
                      data-published={count > 0 ? "" : undefined}
                      data-scheduled={isScheduled ? "" : undefined}
                    >
                      <span className="dash-cal-num" aria-hidden="true">
                        {dayNumber.format(middayOf(cell.date))}
                      </span>
                      <span className="dash-cal-dot" aria-hidden="true" />
                      {cell.inMonth && (
                        <span className="sr-only">
                          {t("dayLabel", { date: dayLong.format(middayOf(cell.date)), count })}
                          {isToday ? ` · ${t("today")}` : ""}
                          {isScheduled ? ` · ${t("scheduled")}` : ""}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 px-5 pb-3 pt-1 text-xs text-text-muted" aria-hidden="true">
        <li className="inline-flex items-center gap-1.5">
          <span className="dash-cal-legend-dot bg-[var(--dash-gold-ink)]" />
          {t("published")}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="dash-cal-legend-dot ring-2 ring-inset ring-[var(--ptec-series-views)]" />
          {t("scheduled")}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="dash-cal-legend-dot bg-[var(--dash-blue)]" />
          {t("today")}
        </li>
      </ul>

      {scheduledAllowed && (
        <div className="mt-auto border-t border-[var(--dash-line-subtle)] px-5 pb-4 pt-3">
          <h3 className="dash-eyebrow">{t("comingUp")}</h3>
          {scheduled === null ? (
            <p className="mt-2 text-xs text-text-muted">{t("scheduledUnavailable")}</p>
          ) : scheduled.length === 0 ? (
            <p className="mt-2 text-xs text-text-muted">{t("nothingScheduled")}</p>
          ) : (
            <ul className="mt-2.5 space-y-2.5">
              {scheduled.map((s) => {
                const at = new Date(s.at);
                const inner = (
                  <>
                    <span className="dash-cal-date" aria-hidden="true">
                      <span className="text-[11px] font-bold uppercase">{monthShort.format(at)}</span>
                      <span className="text-base font-extrabold">{dayNumber.format(at)}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="dash-truncate block text-[13px] font-semibold leading-5 text-text-heading" dir="auto">
                        {s.title}
                      </span>
                      <span className="block text-xs text-text-muted">
                        {t(`type.${s.type}`)} · <time dateTime={s.at}>{dayLong.format(at)}, {timeShort.format(at)}</time>
                      </span>
                    </span>
                  </>
                );
                return (
                  <li key={`${s.type}:${s.id}`}>
                    {editable[s.type] ? (
                      <Link
                        href={s.editHref}
                        className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-[var(--dash-well)]"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </DashPanel>
  );
}
