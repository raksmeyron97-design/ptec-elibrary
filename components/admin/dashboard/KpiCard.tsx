import { TrendingDown, TrendingUp, Minus, Info, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { TrendInfo } from "@/lib/admin/dashboard-shared";
import SparkLine from "./SparkLine";
import type { TrendPoint } from "@/lib/admin/dashboard";

const TREND_STYLE = {
  up: { icon: TrendingUp, className: "text-emerald-700" },
  down: { icon: TrendingDown, className: "text-rose-700" },
  neutral: { icon: Minus, className: "text-slate-500" },
} as const;

/** Metric colour identity — drives the icon tile tint + top accent strip. */
export type KpiAccent = "visitors" | "views" | "reader" | "downloads" | "brand" | "gold" | "emerald";

/**
 * Period-scoped KPI card. `emphasis` renders the hero metric on a deep PTEC
 * navy surface (large value, gold detail); supporting cards carry a tinted
 * icon tile + a thin metric-coloured top strip so the row reads as a family
 * of distinct measures rather than identical white rectangles. The change
 * line stays plain language and the ⓘ definition uses native <details> for
 * keyboard / no-JS accessibility.
 */
export default function KpiCard({
  title,
  value,
  definition,
  trend,
  compareLabel,
  badge,
  spark,
  href,
  drillLabel,
  icon: IconCmp,
  emphasis = false,
  accent = "brand",
}: {
  title: string;
  value: string;
  definition: string;
  trend?: TrendInfo | null;
  compareLabel?: string | null;
  badge?: string | null;
  spark?: TrendPoint[] | null;
  href?: string;
  drillLabel?: string;
  icon: LucideIcon;
  emphasis?: boolean;
  accent?: KpiAccent;
}) {
  const trendStyle = trend ? TREND_STYLE[trend.direction] : null;
  const TrendIcon = trendStyle?.icon;

  // ── Hero (emphasis) — deep navy institutional surface ──
  if (emphasis) {
    return (
      <div className="dash-hero flex h-full min-w-0 flex-col p-4 sm:p-[18px]">
        <div className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/15 text-white ring-1 ring-inset ring-white/20">
              <IconCmp className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="truncate text-[12.5px] font-semibold text-white/85">{title}</span>
          </span>
          <details className="group relative shrink-0">
            <summary
              className="flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--dash-gold)] [&::-webkit-details-marker]:hidden"
              aria-label={`${title}: definition`}
            >
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
            </summary>
            <p
              role="note"
              className="absolute end-0 top-7 z-20 w-64 rounded-xl border border-divider bg-bg-surface p-3 text-[11.5px] leading-5 text-text-body shadow-lg"
            >
              {definition}
            </p>
          </details>
        </div>

        <span className="mt-2.5 block text-[42px] font-bold leading-none tracking-tight tabular-nums text-white">
          {value}
        </span>

        <div className="mt-2 min-h-[18px] text-[12px] leading-[18px] text-white/75">
          {badge ? (
            <span className="inline-flex items-center rounded-md bg-white/12 px-2 py-0.5 text-[11px] font-semibold text-white/90 ring-1 ring-inset ring-white/15">
              {badge}
            </span>
          ) : trend && trend.mode === "absolute" ? (
            <span className="flex flex-wrap items-center gap-x-1.5 text-white/70">
              <span className="font-semibold tabular-nums">{trend.value}</span>
              {compareLabel ?? trend.label}
            </span>
          ) : trend && trend.mode === "percent" && TrendIcon ? (
            <span className="flex flex-wrap items-center gap-x-1.5">
              <span className="inline-flex items-center gap-0.5 font-bold tabular-nums text-white">
                <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {trend.value}
              </span>
              {compareLabel ?? trend.label}
            </span>
          ) : null}
        </div>
        <p className="mt-auto pt-2.5 text-[11px] leading-4 text-white/60">{definition}</p>
      </div>
    );
  }

  // ── Supporting KPI — tinted icon tile + metric-coloured top strip ──
  return (
    <div className={`dash-card dash-kpi dash-kpi--${accent} relative flex min-w-0 flex-col p-4`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`dash-ico dash-ico--${accent} dash-ico--sm`} aria-hidden="true">
            <IconCmp className="h-[15px] w-[15px]" />
          </span>
          <span className="truncate text-[12.5px] font-semibold text-text-muted">{title}</span>
        </div>
        <details className="group relative shrink-0">
          <summary
            className="flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-full text-text-muted/70 transition-colors hover:bg-paper hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand [&::-webkit-details-marker]:hidden"
            aria-label={`${title}: definition`}
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </summary>
          <p
            role="note"
            className="absolute end-0 top-7 z-20 w-64 rounded-xl border border-divider bg-bg-surface p-3 text-[11.5px] leading-5 text-text-body shadow-lg"
          >
            {definition}
          </p>
        </details>
      </div>

      <div className="mt-2.5 flex items-end justify-between gap-2">
        <span className="text-[27px] font-bold leading-none tabular-nums text-text-heading">{value}</span>
        {spark && spark.length > 1 && <SparkLine points={spark} accent={accent} />}
      </div>

      <div className="mt-2 min-h-[18px] text-[12px] leading-[18px]">
        {badge ? (
          <span className="inline-flex items-center rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800">
            {badge}
          </span>
        ) : trend && trend.mode === "absolute" ? (
          <span className="flex flex-wrap items-center gap-x-1.5 text-text-muted">
            <span className="font-semibold tabular-nums">{trend.value}</span>
            {compareLabel ?? trend.label}
          </span>
        ) : trend && trend.mode === "percent" && TrendIcon && trendStyle ? (
          <span className="flex flex-wrap items-center gap-x-1.5 text-text-muted">
            <span className={`inline-flex items-center gap-0.5 font-bold tabular-nums ${trendStyle.className}`}>
              <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {trend.value}
            </span>
            {compareLabel ?? trend.label}
          </span>
        ) : null}
      </div>

      {href && drillLabel && (
        <Link
          href={href}
          className="mt-1.5 inline-flex w-fit items-center gap-0.5 text-[11.5px] font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {drillLabel}
          <span aria-hidden="true">→</span>
        </Link>
      )}
    </div>
  );
}
