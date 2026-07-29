// lib/about/format.ts
//
// Locale-aware presentation helpers for the About pages. Pure and
// client-safe — every one of these is unit-tested (lib/about/format.test.ts).
//
// The hard rule these encode: NOTHING the user sees may ever be the string
// "undefined", "null", "NaN" or "Invalid Date". Each helper takes the
// possibly-missing value and returns either good output or a caller-supplied
// fallback — there is no code path that stringifies a bad value.

import type { LocalizedText, SourcedNumber } from "./types";

export type AboutLocale = "en" | "km";

/** Narrow an arbitrary locale string to the two this site serves. */
export function toAboutLocale(locale: string): AboutLocale {
  return locale === "km" ? "km" : "en";
}

/**
 * The string to display for the active locale, falling back to the other
 * language when the source supplied only one. Returns "" when neither exists,
 * which callers treat as "render nothing" rather than printing a placeholder.
 */
export function pickLocale(
  text: LocalizedText | null | undefined,
  locale: AboutLocale,
): string {
  if (!text) return "";
  const primary = locale === "km" ? text.km : text.en;
  if (primary && primary.trim()) return primary;
  const secondary = locale === "km" ? text.en : text.km;
  return secondary && secondary.trim() ? secondary : "";
}

/**
 * Which language a picked string actually ended up in, so the caller can set
 * a correct `lang` attribute. Returns null when there is nothing to render.
 *
 * This matters for screen readers: a Khmer string inside an English page
 * announced with an English voice is unintelligible.
 */
export function pickLocaleLang(
  text: LocalizedText | null | undefined,
  locale: AboutLocale,
): AboutLocale | null {
  if (!text) return null;
  const primary = locale === "km" ? text.km : text.en;
  if (primary && primary.trim()) return locale;
  const other: AboutLocale = locale === "km" ? "en" : "km";
  const secondary = locale === "km" ? text.en : text.km;
  return secondary && secondary.trim() ? other : null;
}

/** Both of the above at once — the shape the components consume. */
export function localized(
  text: LocalizedText | null | undefined,
  locale: AboutLocale,
): { text: string; lang: AboutLocale } | null {
  const value = pickLocale(text, locale);
  const lang = pickLocaleLang(text, locale);
  if (!value || !lang) return null;
  return { text: value, lang };
}

/**
 * Grouped number for display. Khmer uses Western digits across this site's UI
 * (`km-u-nu-latn`), matching lib/collection-stats.ts — the two must agree or
 * the same figure renders differently on two pages.
 */
export function formatNumber(
  value: number | null | undefined,
  locale: AboutLocale,
): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat(locale === "km" ? "km-u-nu-latn" : "en-US").format(
    Math.floor(value),
  );
}

/**
 * A sourced figure, formatted only when we are willing to stand behind it.
 * `disputed` and `unverified` figures return null so the caller renders its
 * empty state — this is the guard that keeps a contested number off a card.
 */
export function formatSourcedNumber(
  n: SourcedNumber | null | undefined,
  locale: AboutLocale,
): string | null {
  if (!n || n.confidence !== "verified") return null;
  return formatNumber(n.value, locale);
}

/** ISO date → a readable, locale-correct date. Never "Invalid Date". */
export function formatDate(
  iso: string | null | undefined,
  locale: AboutLocale,
): string | null {
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "km" ? "km-u-nu-latn" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * "HH:MM" (24-hour, Cambodia local) → a clock label.
 * English uses 12-hour with a period; Khmer keeps 24-hour, matching
 * formatTimeLabel() in lib/library-hours.ts.
 */
export function formatClock(
  hhmm: string | null | undefined,
  locale: AboutLocale,
): string | null {
  if (!hhmm) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const mm = String(minutes).padStart(2, "0");
  if (locale === "km") return `${hours}:${mm}`;
  const period = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${mm} ${period}`;
}

/** Percentage of a whole, clamped to [0,100]; 0 when the whole is 0. */
export function percentOf(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return Math.min(100, Math.max(0, (part / whole) * 100));
}

/** Bar width for the DDC chart — never below a hairline, so a category with
 *  a small count still has a visible (and hoverable) bar. */
export function barWidth(part: number, whole: number): string {
  const pct = percentOf(part, whole);
  return `${Math.max(pct, 0.75).toFixed(2)}%`;
}
