import Link from "next/link";
import { TrendingDown, TrendingUp, Minus, type LucideIcon } from "lucide-react";
import type { TrendInfo } from "@/lib/admin/dashboard";

export type StatTone = "blue" | "green" | "orange" | "purple" | "cyan" | "gold" | "red" | "gray";

/** Tones map onto the existing --ptec-metric-* token groups in globals.css. */
const TONE_VARS: Record<StatTone, { bg: string; border: string; num: string; badge: string }> = {
  blue:   { bg: "var(--ptec-metric-books-bg)", border: "var(--ptec-metric-books-border)", num: "var(--ptec-metric-books-num)", badge: "metric-badge-books" },
  orange: { bg: "var(--ptec-metric-dl-bg)",    border: "var(--ptec-metric-dl-border)",    num: "var(--ptec-metric-dl-num)",    badge: "metric-badge-dl" },
  green:  { bg: "var(--ptec-metric-views-bg)", border: "var(--ptec-metric-views-border)", num: "var(--ptec-metric-views-num)", badge: "metric-badge-views" },
  purple: { bg: "var(--ptec-metric-users-bg)", border: "var(--ptec-metric-users-border)", num: "var(--ptec-metric-users-num)", badge: "metric-badge-users" },
  cyan:   { bg: "var(--ptec-metric-cat-bg)",   border: "var(--ptec-metric-cat-border)",   num: "var(--ptec-metric-cat-num)",   badge: "metric-badge-catalog" },
  gold:   { bg: "var(--ptec-metric-dl-bg)",    border: "var(--ptec-metric-dl-border)",    num: "var(--ptec-metric-dl-num)",    badge: "metric-badge-dl" },
  red:    { bg: "var(--ptec-metric-red-bg)",   border: "var(--ptec-metric-red-border)",   num: "var(--ptec-metric-red-num)",   badge: "metric-badge-red" },
  gray:   { bg: "var(--ptec-metric-gray-bg)",  border: "var(--ptec-metric-gray-border)",  num: "var(--ptec-metric-gray-num)",  badge: "metric-badge-gray" },
};

/**
 * `variant="quiet"` palette. The tinted cards above are right for the
 * dashboard, where a KPI wall is the whole point of the page; on a section
 * list page eight saturated blocks compete with the table that carries the
 * actual work. Quiet cards keep one border, no fill, and spend colour only on
 * the icon and the number — which is what the reader is scanning for.
 */
const QUIET_TONE: Record<StatTone, { icon: string; value: string }> = {
  blue:   { icon: "bg-brand/10 text-brand",              value: "text-brand" },
  green:  { icon: "bg-success-soft text-success-text",   value: "text-success-text" },
  orange: { icon: "bg-warning-soft text-warning-text",   value: "text-warning-text" },
  red:    { icon: "bg-danger-soft text-danger-text",     value: "text-danger-text" },
  gray:   { icon: "bg-paper text-text-muted",            value: "text-text-heading" },
  purple: { icon: "bg-info-soft text-info-text",         value: "text-info-text" },
  cyan:   { icon: "bg-info-soft text-info-text",         value: "text-info-text" },
  gold:   { icon: "bg-warning-soft text-warning-text",   value: "text-warning-text" },
};

/** The shared status vocabulary, so a trend badge here is the same green and
 *  red as every other "this moved" mark in the app (see trend-style.ts, which
 *  made the same migration for the arrows on the dashboard's own cards).
 *  Direction is never carried by colour alone — each has its own glyph. */
const TREND_STYLE = {
  up:      { icon: TrendingUp,   className: "dash-status--ok" },
  down:    { icon: TrendingDown, className: "dash-status--crit" },
  neutral: { icon: Minus,        className: "dash-status--neutral" },
} as const;

/**
 * KPI card: value + label + trend vs. the previous period + context line.
 * Wraps in a link when `href` is given so every KPI leads somewhere useful.
 */
export default function StatCard({
  title,
  value,
  description,
  trend,
  icon: Icon,
  href,
  tone = "blue",
  variant = "tinted",
}: {
  title: string;
  value: string | number;
  description?: string;
  trend?: TrendInfo;
  icon: LucideIcon;
  href?: string;
  tone?: StatTone;
  /** "tinted" (default) is the dashboard KPI wall; "quiet" is a list-page metric strip. */
  variant?: "tinted" | "quiet";
}) {
  const quiet = variant === "quiet";
  const q = QUIET_TONE[tone];
  const t = TONE_VARS[tone];
  const trendStyle = trend ? TREND_STYLE[trend.direction] : null;
  const TrendIcon = trendStyle?.icon;

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        {/* The tinted variant used to fade this label into its own fill
            (`color-mix(… 70%, transparent)`), which lands at 3.3–4.2:1 — below
            AA for 11px text. The tone's own `-num` token at full strength is
            8.9:1 on the same tint and is the colour the value already uses, so
            label and value now read as one pair rather than two greys. */}
        <span className="dash-label" style={quiet ? undefined : { color: t.num }}>
          {title}
        </span>
        {quiet ? (
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${q.icon}`} aria-hidden="true">
            <Icon className="h-[17px] w-[17px]" />
          </span>
        ) : (
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm ${t.badge}`} aria-hidden="true">
            <Icon className="h-[18px] w-[18px] text-white" />
          </span>
        )}
      </div>

      {/* One numeral step for "the big number on a KPI card", proportional
          rather than tabular — see `.dash-num-display` in admin.css. */}
      <div
        className={`dash-num-display mt-2.5 text-2xl font-bold leading-none ${quiet ? q.value : ""}`}
        style={quiet ? undefined : { color: t.num }}
      >
        {value}
      </div>

      {trend && TrendIcon && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span
            className={`dash-chip gap-1 text-xs font-bold tabular-nums ${trendStyle.className}`}
          >
            <TrendIcon className="h-3 w-3" aria-hidden="true" />
            {trend.value}
          </span>
          <span className="text-xs text-text-body">{trend.label}</span>
        </div>
      )}

      {description && <div className="mt-1.5 text-xs text-text-body">{description}</div>}
    </>
  );

  const cardStyle = quiet ? undefined : { background: t.bg, border: `1px solid ${t.border}` };
  const cardClass = quiet
    ? "relative block overflow-hidden rounded-[var(--dash-r-lg)] border border-divider bg-bg-surface p-4 transition-all duration-200"
    : "relative block overflow-hidden rounded-[var(--dash-r-lg)] p-4 shadow-sm transition-all duration-200 sm:p-5";

  if (href) {
    return (
      <Link
        href={href}
        className={`${cardClass} focus-field cursor-pointer ${
          quiet ? "hover:border-border-strong hover:shadow-sm" : "hover:-translate-y-0.5 hover:shadow-lg"
        }`}
        style={cardStyle}
        aria-label={`${title}: ${value}. View details`}
      >
        {body}
      </Link>
    );
  }

  return (
    <div className={cardClass} style={cardStyle}>
      {body}
    </div>
  );
}
