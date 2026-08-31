import { useId } from "react";
import { AlertOctagon, AlertTriangle, ChevronRight, Info, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { TrendInfo } from "@/lib/admin/dashboard-shared";
import SparkLine from "./SparkLine";
import { TREND_STYLE } from "./trend-style";
import type { TrendPoint } from "@/lib/admin/dashboard";

/** Metric colour identity — drives the icon tile tint + top accent strip.
 *  "ok" / "warn" / "crit" / "unknown" are THRESHOLD accents (good / attention
 *  / bad / no-data), for a KPI whose colour communicates a state rather than
 *  a fixed metric identity — e.g. search-insights' zero-result-rate card,
 *  which must read as "bad" when it rises, unlike the four engagement
 *  measures where "up" is always good news. */
export type KpiAccent =
  | "visitors"
  | "views"
  | "reader"
  | "downloads"
  | "brand"
  | "gold"
  | "emerald"
  | "ok"
  | "warn"
  | "crit"
  | "unknown";

/** A value that has crossed a health threshold. Never colour alone: the tone
 *  adds a glyph and an sr-only label alongside the tinted figure. */
export type KpiTone = "warn" | "critical";

const TONE: Record<KpiTone, { status: string; icon: typeof AlertTriangle }> = {
  warn: { status: "dash-status--warn", icon: AlertTriangle },
  critical: { status: "dash-status--crit", icon: AlertOctagon },
};

/**
 * Wiring for the SELECTABLE variant (the Executive Pulse row): the whole card
 * becomes one `aria-pressed` button that drives the engagement chart, with the
 * definition popover and a "details" link moved into a footer row instead of
 * the header. Supplied only by `MetricCard.tsx`, the thin client wrapper that
 * owns the selection hook — this component itself stays a Server Component.
 */
export type KpiCardSelection = {
  isSelected: boolean;
  onSelect: () => void;
  selectedLabel: string;
  detailsLabel: string;
  onOpenDetails: () => void;
  defOpen: boolean;
  onToggleDef: (open: boolean) => void;
  /** Localised, e.g. "Detail views: definition" — replaces the plain mode's
   *  hardcoded English label, matching the rest of the Executive Pulse row. */
  definitionAriaLabel: string;
  /** True while the metric's instrumentation is newer than the selected
   *  period, so no honest comparison exists yet. */
  collecting: boolean;
  collectingLabel: string;
  /** Pre-formatted, e.g. "213" — already localised by the caller. Null when
   *  there is no previous-period baseline to show. */
  formattedPrevious: string | null;
  /** i18n string built from `formattedPrevious`, e.g. "213 previously". */
  previousLabel: string | null;
  /** Shown when there is neither a trend nor a collecting state to report. */
  noComparisonLabel: string;
};

export type KpiCardProps = {
  title: string;
  value: string;
  /** Popover explanation behind the ⓘ. Omit when there is nothing to add
   *  beyond the label. */
  definition?: string;
  /** Always-visible caption line under the trend/badge row (search-insights'
   *  KPIs use this; the dashboard's own cards do not). */
  hint?: string;
  /**
   * Plain mode only: muted text shown in place of the trend/badge line when
   * there is genuinely nothing to compare against (no previous period). Every
   * other plain KPI card renders nothing in that case — this exists because
   * search-insights' cards always state the period, comparison or not.
   */
  noTrendLabel?: string;
  trend?: TrendInfo | null;
  compareLabel?: string | null;
  badge?: string | null;
  spark?: TrendPoint[] | null;
  href?: string;
  drillLabel?: string;
  icon: LucideIcon;
  accent?: KpiAccent;
  /** Tints the figure when it has crossed a health threshold. */
  tone?: KpiTone;
  /** Names that threshold for assistive tech and on hover. */
  toneLabel?: string;
  /**
   * Overrides the colour `trend.direction` would otherwise imply. Direction
   * alone assumes "up" is good news, which is true for the four core
   * engagement measures but false for a metric like a zero-result rate, where
   * a rise is the bad outcome. Pass the sentiment explicitly whenever the
   * metric can move in a direction that is not "more is better".
   */
  trendTone?: "success" | "danger";
  selected?: KpiCardSelection;
};

/** The small icon+value pill used wherever a percent trend is shown. Shared
 *  because it is the one piece that was pixel-identical across both prior
 *  implementations. */
function TrendChip({
  trend,
  trendTone,
}: {
  trend: TrendInfo;
  trendTone?: "success" | "danger";
}) {
  const style = trendTone
    ? { icon: TREND_STYLE[trend.direction].icon, className: `text-[var(--ptec-${trendTone})]` }
    : TREND_STYLE[trend.direction];
  const Icon = style.icon;
  return (
    <span className={`inline-flex items-center gap-0.5 font-bold tabular-nums ${style.className}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {trend.value}
    </span>
  );
}

/**
 * ONE KPI card, in two wiring modes:
 *
 *  - plain (default): a div, optionally a Link when `href` is given. Header
 *    carries the icon, title and the ⓘ popover together; the sub-line quietly
 *    shows nothing when there is no badge or trend to report.
 *  - `selected`: the whole card is a pressable, `aria-pressed` button (driven
 *    by the caller's selection state); the ⓘ popover and a "details" link move
 *    to a footer row, and the sub-line always states something — a trend, a
 *    "still collecting" notice, or an explicit "no comparison" line — because
 *    these are the headline Executive Pulse cards, never a quiet omission.
 *
 * This is the single implementation of the KPI-card pattern used across the
 * admin dashboard — it replaces what were three independently drifting
 * versions of the same idea (a 27px vs 28px headline figure was one symptom).
 * `StatCard.tsx` is a deliberately separate component: it is shared far
 * beyond the dashboard (several other admin sections and two public `/about`
 * pages), so folding it in here would touch code outside this refactor's
 * scope for no benefit — its own "quiet" variant already reads from the same
 * status tokens this card does.
 */
export default function KpiCard({
  title,
  value,
  definition,
  hint,
  noTrendLabel,
  trend,
  compareLabel,
  badge,
  spark,
  href,
  drillLabel,
  icon: IconCmp,
  accent = "brand",
  tone,
  toneLabel,
  trendTone,
  selected,
}: KpiCardProps) {
  const toneStyle = tone ? TONE[tone] : null;
  const ToneIcon = toneStyle?.icon;

  const iconTile = (
    <span className={`dash-ico dash-ico--${accent} dash-ico--sm`} aria-hidden="true">
      <IconCmp className="h-[15px] w-[15px]" />
    </span>
  );

  const valueRow = (
    <span className="flex w-full items-end justify-between gap-2">
      {/* Proportional figures, not `tabular-nums`: equal-width digits are for
          columns that must align, and at this size they make a value like
          "116" look gappy. The comparison line below stays tabular. */}
      <span
        className={`dash-num-display flex items-center gap-1.5 text-2xl font-bold leading-none ${
          toneStyle ? `${toneStyle.status} text-[var(--dash-status-fg)]` : "text-text-heading"
        }`}
      >
        {value}
        {ToneIcon && (
          <span title={toneLabel}>
            <ToneIcon className="dash-mark h-4 w-4" aria-hidden="true" />
            {toneLabel && <span className="sr-only">{toneLabel}</span>}
          </span>
        )}
      </span>
      {spark && spark.length > 1 && <SparkLine points={spark} accent={accent} />}
    </span>
  );

  // Only the selectable mode links the trigger to the popover text via
  // aria-describedby — plain mode never had this, and adding it there is
  // outside this refactor's scope. useId() is called unconditionally
  // (required for hooks) and simply unused when there is no definition.
  const defId = useId();
  const definitionPopover = definition ? (
    <details
      className={selected ? "relative" : "group relative shrink-0"}
      {...(selected
        ? {
            open: selected.defOpen,
            onToggle: (e: React.SyntheticEvent<HTMLDetailsElement>) =>
              selected.onToggleDef((e.currentTarget as HTMLDetailsElement).open),
          }
        : {})}
    >
      <summary
        aria-label={selected ? selected.definitionAriaLabel : `${title}: definition`}
        aria-describedby={selected && selected.defOpen ? defId : undefined}
        className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-lg text-text-muted transition-colors [--focus-ring-offset:1px] hover:bg-paper hover:text-brand [&::-webkit-details-marker]:hidden"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </summary>
      {/* `.dash-popover` carries z-index: var(--dash-z-popover). A hand-written
          z-index once sat below the sticky control bar, so on the Audience
          view this definition opened behind the bar. */}
      <p
        id={selected ? defId : undefined}
        role="note"
        className={`dash-popover absolute w-64 p-3 text-xs leading-5 text-text-body ${
          selected ? "start-0 bottom-8" : "end-0 top-8"
        }`}
      >
        {definition}
      </p>
    </details>
  ) : null;

  // ── Selectable (Executive Pulse) ────────────────────────────────────────
  if (selected) {
    const s = selected;
    return (
      <div
        className={`dash-kpi dash-kpi--${accent} dash-metric-card ${s.isSelected ? "is-selected" : ""}`}
        data-selected={s.isSelected}
      >
        <button
          type="button"
          aria-pressed={s.isSelected}
          onClick={s.onSelect}
          // Inset ring: the button fills the card, so a positive offset would
          // paint outside the card's own border.
          className="flex w-full cursor-pointer flex-col items-start gap-2.5 rounded-[calc(var(--dash-r-lg)-2px)] p-5 pb-2 text-start [--focus-ring-offset:-2px]"
        >
          <span className="flex w-full items-center gap-2">
            {iconTile}
            <span className="min-w-0 flex-1 dash-truncate text-xs font-semibold text-text-muted">{title}</span>
            {s.isSelected && (
              <span className="shrink-0 rounded-md bg-brand/10 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-brand">
                {s.selectedLabel}
              </span>
            )}
          </span>

          {valueRow}

          <span className="min-h-[34px] w-full text-xs leading-[17px]">
            {s.collecting ? (
              <span className="inline-flex items-center rounded-md bg-info-soft px-1.5 py-0.5 text-xs font-semibold text-info-text">
                {s.collectingLabel}
              </span>
            ) : trend && trend.mode !== "hidden" ? (
              <>
                <span className="flex flex-wrap items-center gap-x-1.5 text-text-muted">
                  {trend.mode === "percent" ? (
                    <TrendChip trend={trend} trendTone={trendTone} />
                  ) : (
                    <span className="font-semibold tabular-nums text-text-body">{trend.value}</span>
                  )}
                  <span>{compareLabel ?? trend.label}</span>
                </span>
                {s.previousLabel !== null && (
                  <span className="mt-0.5 block text-xs tabular-nums text-text-muted">{s.previousLabel}</span>
                )}
              </>
            ) : (
              <span className="text-xs text-text-muted">{s.noComparisonLabel}</span>
            )}
          </span>
        </button>

        <div className="flex items-center justify-between gap-1 border-t border-divider/60 px-3 py-1">
          {definitionPopover}
          <button
            type="button"
            onClick={s.onOpenDetails}
            className="flex h-7 cursor-pointer items-center gap-0.5 rounded-lg px-2 text-xs font-semibold text-brand transition-colors [--focus-ring-offset:1px] hover:bg-brand/5"
          >
            {s.detailsLabel}
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">{title}</span>
          </button>
        </div>
      </div>
    );
  }

  // ── Plain / link (every other KPI card) ─────────────────────────────────
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {iconTile}
          <span className="dash-truncate text-xs font-semibold text-text-muted">{title}</span>
        </div>
        {definitionPopover}
      </div>

      <div className="mt-2.5">{valueRow}</div>

      <div className="mt-2 min-h-[18px] text-xs leading-[18px]">
        {badge ? (
          <span className="inline-flex items-center rounded-md bg-info-soft px-1.5 py-0.5 text-xs font-semibold text-info-text">
            {badge}
          </span>
        ) : trend && trend.mode === "absolute" ? (
          <span className="flex flex-wrap items-center gap-x-1.5 text-text-muted">
            <span className="font-semibold tabular-nums">{trend.value}</span>
            {compareLabel ?? trend.label}
          </span>
        ) : trend && trend.mode === "percent" ? (
          <span className="flex flex-wrap items-center gap-x-1.5 text-text-muted">
            <TrendChip trend={trend} trendTone={trendTone} />
            {compareLabel ?? trend.label}
          </span>
        ) : noTrendLabel ? (
          <span className="text-text-muted">{noTrendLabel}</span>
        ) : null}
      </div>

      {hint && <div className="mt-1 text-xs leading-4 text-text-muted">{hint}</div>}

      {href && drillLabel && (
        <Link
          href={href}
          className="mt-1.5 inline-flex w-fit items-center gap-0.5 text-xs font-semibold text-brand hover:underline"
        >
          {drillLabel}
          <span aria-hidden="true">→</span>
        </Link>
      )}
    </>
  );

  return <div className={`dash-card dash-kpi dash-kpi--${accent} relative flex min-w-0 flex-col p-5`}>{body}</div>;
}
