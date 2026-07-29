// components/about/WeeklyHoursTable.tsx
//
// The weekly schedule on /about/timings, as a real semantic table.
//
// Why a table and not a stack of cards: this is genuinely tabular data (day ×
// hours). A <table> gives screen-reader users row/column navigation and
// announces the day header with each cell; a div grid gives them a flat run of
// text. The mobile treatment is the SAME table — narrowed, never a duplicated
// card list, because two DOM copies of the schedule is how the two drift apart.
//
// Data source: the weekly rows are derived from the PUBLISHED opening-hours
// settings, not hard-coded here — an edit in /admin/system-settings changes
// this table, the footer sentence and the JSON-LD together. Only the editorial
// rows the settings model has no field for (exam period, the 24/7 e-Library)
// come from lib/about/content.ts.
//
// "Today" is resolved in Asia/Phnom_Penh by the caller and passed in, so this
// component stays pure and the highlighted row can never follow the reader's
// device timezone.

import { Globe2 } from "lucide-react";
import { dayName } from "@/lib/system-settings/hours";
import { groupWeeklySpec, minutesToHHMM } from "@/lib/about/schedule";
import { formatClock, localized, type AboutLocale } from "@/lib/about/format";
import type { SpecialScheduleRow } from "@/lib/about/types";

type Row = {
  id: string;
  /** Rendered day label. */
  label: string;
  lang?: AboutLocale;
  /** JS weekday numbers this row covers, for the "today" highlight. */
  days: number[];
  hours: string | null;
  closed: boolean;
  alwaysOpen?: boolean;
};

export default function WeeklyHoursTable({
  spec,
  specialRows,
  locale,
  todayWeekday,
  labels,
}: {
  /** Published schema.org opening-hours spec, e.g. ["Mo-Fr 07:00-17:00"]. */
  spec: readonly string[];
  specialRows: SpecialScheduleRow[];
  locale: AboutLocale;
  /** 0 = Sunday, in Cambodia local time. */
  todayWeekday: number;
  labels: {
    caption: string;
    day: string;
    hours: string;
    closed: string;
    today: string;
    alwaysOpen: string;
    unavailable: string;
  };
}) {
  const { open, closedDays } = groupWeeklySpec(spec);
  const rows: Row[] = [];

  for (const group of open) {
    const first = dayName(locale, group.days[0]);
    const last = dayName(locale, group.days[group.days.length - 1]);
    rows.push({
      id: `open-${group.days.join("-")}`,
      label: group.days.length === 1 ? first : `${first} – ${last}`,
      lang: locale,
      days: group.days,
      hours: group.intervals
        .map((r) => {
          const from = formatClock(minutesToHHMM(r.open), locale);
          const to = formatClock(minutesToHHMM(r.close), locale);
          return from && to ? `${from} – ${to}` : null;
        })
        .filter(Boolean)
        .join(" · "),
      closed: false,
    });
  }

  if (closedDays.length > 0) {
    rows.push({
      id: `closed-${closedDays.join("-")}`,
      label: closedDays.map((d) => dayName(locale, d)).join(", "),
      lang: locale,
      days: closedDays,
      hours: null,
      closed: true,
    });
  }

  for (const special of specialRows) {
    const label = localized(special.label, locale);
    if (!label) continue;
    const from = special.hours ? formatClock(special.hours.open, locale) : null;
    const to = special.hours ? formatClock(special.hours.close, locale) : null;
    rows.push({
      id: special.id,
      label: label.text,
      lang: label.lang,
      // Editorial rows are never "today" — they are conditions, not weekdays.
      days: [],
      hours: special.alwaysOpen ? labels.alwaysOpen : from && to ? `${from} – ${to}` : null,
      closed: !special.alwaysOpen && !special.hours,
      alwaysOpen: special.alwaysOpen,
    });
  }

  if (rows.length === 0) {
    return (
      <p role="status" className="rounded-2xl border border-divider bg-paper p-5 text-sm text-text-muted">
        {labels.unavailable}
      </p>
    );
  }

  return (
    // The wrapper scrolls rather than the page: `overflow-x-auto` here is what
    // keeps a long Khmer day label from pushing the whole document sideways at
    // 320px. tabIndex+role make the scrollable region keyboard-reachable,
    // which is a WCAG 2.1.1 requirement for scrollable content.
    <div
      className="overflow-x-auto rounded-2xl border border-divider bg-bg-surface shadow-sm"
      tabIndex={0}
      role="region"
      aria-label={labels.caption}
    >
      <table className="w-full min-w-[20rem] border-collapse text-left">
        <caption className="sr-only">{labels.caption}</caption>
        <thead>
          <tr className="border-b border-divider bg-paper">
            <th
              scope="col"
              className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted sm:px-5"
            >
              {labels.day}
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-text-muted sm:px-5"
            >
              {labels.hours}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-divider">
          {rows.map((row) => {
            const isToday = row.days.includes(todayWeekday);
            return (
              <tr key={row.id} className={isToday ? "bg-brand/[0.05]" : undefined}>
                {/* scope="row" makes the day the header for its hours cell. */}
                <th
                  scope="row"
                  className="px-4 py-3.5 text-sm font-medium text-text-heading sm:px-5"
                >
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span lang={row.lang} className="about-wrap">
                      {row.label}
                    </span>
                    {/* "Today" is a text badge, not just a background tint —
                        the tint alone would be colour-only information. */}
                    {isToday && (
                      <span className="inline-flex shrink-0 items-center rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-contrast">
                        {labels.today}
                      </span>
                    )}
                    {row.alwaysOpen && (
                      <Globe2 className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
                    )}
                  </span>
                </th>
                <td className="px-4 py-3.5 text-right sm:px-5">
                  {row.closed ? (
                    <span className="inline-flex items-center rounded-full border border-divider bg-paper px-2.5 py-0.5 text-xs font-semibold text-text-muted">
                      {labels.closed}
                    </span>
                  ) : (
                    <span className="whitespace-nowrap text-sm font-medium tabular-nums text-text-heading">
                      {row.hours}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
