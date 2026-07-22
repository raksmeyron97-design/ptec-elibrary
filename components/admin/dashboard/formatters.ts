/**
 * Cached Intl formatters for the dashboard.
 *
 * Constructing an `Intl.*Format` is one of the more expensive things a render
 * can do, and every dashboard panel needs the same handful of them. These are
 * memoised at module scope by locale (plus options, where they vary), which is
 * safe: formatters are stateless and the cache key fully determines behaviour.
 */

const APP_TZ = "Asia/Phnom_Penh";

/** next-intl locales map to BCP-47 tags for Intl. */
export function intlLocale(locale: string): string {
  return locale === "km" ? "km-KH" : "en-US";
}

const numberFormats = new Map<string, Intl.NumberFormat>();

export function numberFormat(locale: string): Intl.NumberFormat {
  const tag = intlLocale(locale);
  let f = numberFormats.get(tag);
  if (!f) {
    f = new Intl.NumberFormat(tag);
    numberFormats.set(tag, f);
  }
  return f;
}

const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();

/** Always resolved in the library's own timezone, never the server's. */
export function dateTimeFormat(
  locale: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const tag = intlLocale(locale);
  const key = `${tag}|${JSON.stringify(options)}`;
  let f = dateTimeFormats.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(tag, { timeZone: APP_TZ, ...options });
    dateTimeFormats.set(key, f);
  }
  return f;
}

const relativeTimeFormats = new Map<string, Intl.RelativeTimeFormat>();

export function relativeTimeFormat(locale: string): Intl.RelativeTimeFormat {
  const tag = intlLocale(locale);
  let f = relativeTimeFormats.get(tag);
  if (!f) {
    f = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
    relativeTimeFormats.set(tag, f);
  }
  return f;
}

/**
 * "3 days ago" / "18 minutes ago" relative to a fixed reference time.
 *
 * `now` is passed in (never read from the clock) so a server render and the
 * client hydration that follows it produce identical text.
 */
export function relativeFromNow(locale: string, iso: string, now: number): string {
  const rtf = relativeTimeFormat(locale);
  const diff = now - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "";
  const days = Math.floor(diff / 86_400_000);
  if (days >= 1) return rtf.format(-days, "day");
  const hours = Math.floor(diff / 3_600_000);
  if (hours >= 1) return rtf.format(-hours, "hour");
  return rtf.format(-Math.max(1, Math.floor(diff / 60_000)), "minute");
}
