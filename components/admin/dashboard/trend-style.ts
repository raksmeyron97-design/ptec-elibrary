import { Minus, TrendingDown, TrendingUp } from "lucide-react";

/**
 * One vocabulary for "this number moved".
 *
 * Status tokens rather than palette weights: these resolve per theme and are
 * the same green/red every other callout in the app uses, so a trend arrow on
 * a KPI card cannot drift away from a delta printed next to a chart. Each of
 * the six surfaces that show a change used to spell its own colours — mostly
 * `text-emerald-700` / `text-rose-700`, which is a *different* green and red
 * from the status tokens the cards use.
 *
 * Direction is never carried by colour alone: every consumer pairs this with
 * an arrow glyph or an explicit sign.
 */
export const TREND_STYLE = {
  up: { icon: TrendingUp, className: "text-[var(--ptec-success)]" },
  down: { icon: TrendingDown, className: "text-[var(--ptec-danger)]" },
  neutral: { icon: Minus, className: "text-[var(--dash-ink-3)]" },
} as const;

/** Colour for a signed delta, in the same language as the arrows above. */
export function deltaClass(delta: number): string {
  if (delta > 0) return TREND_STYLE.up.className;
  if (delta < 0) return TREND_STYLE.down.className;
  return TREND_STYLE.neutral.className;
}
