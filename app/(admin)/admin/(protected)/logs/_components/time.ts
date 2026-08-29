// Timestamp presentation for /admin/logs.
//
// Two things were wrong with the previous helper and both are fixed here:
//
// 1. It built relative strings by hand ("5 min ago", "2 d ago"), which is
//    English forever — on /km the whole column stayed English. Intl.Relative-
//    TimeFormat localizes it, Khmer included.
// 2. It read Date.now() during render. The server renders this tree too, so a
//    row could serialize "59 min ago" and hydrate as "1 hr ago" — a hydration
//    mismatch that depends on the clock. The reference instant is now the
//    server's own query bound, so both renders agree by construction, and the
//    displayed age is honestly "as of when this data was read".

export type TimeParts = { relative: string; exact: string };

const TZ = "Asia/Phnom_Penh";

const UNITS: Array<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
  { unit: "year", ms: 365 * 86_400_000 },
  { unit: "month", ms: 30 * 86_400_000 },
  { unit: "day", ms: 86_400_000 },
  { unit: "hour", ms: 3_600_000 },
  { unit: "minute", ms: 60_000 },
];

export function createTimeFormatter(
  locale: string,
  /** Reference instant — the server's query end bound, NOT Date.now(). */
  anchorIso: string,
  justNow: string,
): (iso: string) => TimeParts {
  const anchor = new Date(anchorIso).getTime();
  const reference = Number.isFinite(anchor) ? anchor : Date.now();
  const relativeFormat = new Intl.RelativeTimeFormat(locale, { numeric: "always", style: "narrow" });
  const exactFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: TZ });

  return (iso: string): TimeParts => {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return { relative: "—", exact: "—" };
    const exact = exactFormat.format(at);
    const delta = at.getTime() - reference;
    const magnitude = Math.abs(delta);
    if (magnitude < 60_000) return { relative: justNow, exact };
    for (const { unit, ms } of UNITS) {
      if (magnitude >= ms) {
        return { relative: relativeFormat.format(Math.round(delta / ms), unit), exact };
      }
    }
    return { relative: justNow, exact };
  };
}

/** Clock label for the header's "Updated {time}" pill, in ADMIN_TZ. */
export function formatClock(locale: string, iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ }).format(d);
}
