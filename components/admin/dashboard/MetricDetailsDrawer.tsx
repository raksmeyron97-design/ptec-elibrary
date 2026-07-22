"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Info, X } from "lucide-react";
import type { TrendPoint } from "@/lib/admin/dashboard";
import type { DashboardMetric } from "@/lib/admin/dashboard-shared";
import { useMetricSelection } from "./MetricSelection";

export type DrawerTopRow = {
  key: string;
  title: string;
  href: string;
  /** Primary figure for this metric, already formatted + localised. */
  value: string;
  /** Supporting context ("312 views · Books"). */
  secondary: string;
};

export type MetricDetailPayload = {
  title: string;
  definition: string;
  value: string;
  previous: string | null;
  change: string | null;
  changeDirection: "up" | "down" | "neutral" | null;
  series: TrendPoint[];
  prevSeries: TrendPoint[] | null;
  top: DrawerTopRow[];
  /** Alerts whose module relates to this metric. */
  alerts: { key: string; label: string; href: string; severity: string }[];
  reportHref: string;
  reportLabel: string;
  /** Attribution / measurement caveat, when one applies. */
  limitation: string | null;
};

export type HealthDetailPayload = {
  title: string;
  level: string;
  checks: { key: string; label: string; levelLabel: string; level: string; detail: string; href: string }[];
  reportHref: string;
  reportLabel: string;
};

const LEVEL_DOT: Record<string, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  critical: "bg-rose-500",
  unknown: "bg-slate-300",
};

/** Current period solid, previous period dashed — plus a zero baseline. */
function DrawerTrend({ series, prevSeries }: { series: TrendPoint[]; prevSeries: TrendPoint[] | null }) {
  const w = 320;
  const h = 84;
  const values = [...series.map((p) => p.value), ...(prevSeries ?? []).map((p) => p.value)];
  const max = Math.max(1, ...values);
  const path = (points: TrendPoint[]) =>
    points
      .map((p, i) => {
        const x = points.length > 1 ? (i / (points.length - 1)) * w : w / 2;
        const y = h - 2 - (p.value / max) * (h - 6);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height={h}
      preserveAspectRatio="none"
      aria-hidden="true"
      className="mt-1"
    >
      <line x1="0" y1={h - 2} x2={w} y2={h - 2} stroke="currentColor" strokeOpacity=".12" strokeWidth="1" />
      {prevSeries && prevSeries.length > 1 && (
        <path d={path(prevSeries)} fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="4 4" />
      )}
      {series.length > 1 && <path d={path(series)} fill="none" stroke="#1E3A8A" strokeWidth="2" strokeLinejoin="round" />}
    </svg>
  );
}

/**
 * Side drawer with the full story behind one KPI: definition, current vs
 * previous, trend, the content driving it, related alerts and a route to the
 * full report. Rendered only while open (nothing is fetched or mounted for a
 * drawer nobody asked for), with a focus trap, Escape to close and focus
 * restored to the trigger.
 */
export default function MetricDetailsDrawer({
  metrics,
  health,
}: {
  metrics: Record<DashboardMetric, MetricDetailPayload>;
  health: HealthDetailPayload;
}) {
  const t = useTranslations("adminDashboard.kpi");
  const { details, closeDetails } = useMetricSelection();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const open = details !== null;

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeDetails();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      restoreRef.current?.focus?.();
    };
  }, [open, closeDetails]);

  if (!open) return null;

  const isHealth = details === "health";
  const payload = isHealth ? null : metrics[details as DashboardMetric];
  const title = isHealth ? health.title : (payload?.title ?? "");

  return (
    <div className="dash-drawer-root" role="presentation">
      {/* Scrim: click to dismiss. Keyboard users have Escape and the close button. */}
      <div className="dash-drawer-scrim" onClick={closeDetails} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="dash-drawer"
      >
        <div className="flex items-start justify-between gap-3 border-b border-divider px-5 py-3.5">
          <div className="min-w-0">
            <p className="dash-eyebrow">{t("detailsEyebrow")}</p>
            <h2 className="truncate text-[16px] font-bold text-text-heading">{title}</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={closeDetails}
            aria-label={t("closeDetails")}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[10px] text-text-muted transition-colors hover:bg-paper hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isHealth ? (
            <>
              <p className="text-[13px] font-semibold text-text-heading">{health.level}</p>
              <ul className="mt-3 space-y-2">
                {health.checks.map((c) => (
                  <li key={c.key} className="rounded-xl border border-divider bg-paper/50 p-3">
                    <div className="flex items-center gap-2">
                      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${LEVEL_DOT[c.level]}`} />
                      <span className="min-w-0 flex-1 text-[12.5px] font-semibold text-text-heading">{c.label}</span>
                      <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-text-muted">
                        {c.levelLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-[11.5px] leading-4 text-text-muted">{c.detail}</p>
                    <Link
                      href={c.href}
                      className="mt-1.5 inline-flex items-center gap-0.5 text-[11.5px] font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      {t("inspect")}
                      <ArrowRight className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href={health.reportHref}
                className="mt-4 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {health.reportLabel}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </>
          ) : payload ? (
            <>
              <p className="flex items-start gap-2 rounded-xl bg-paper/70 p-3 text-[11.5px] leading-5 text-text-body">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
                {payload.definition}
              </p>

              <dl className="mt-4 grid grid-cols-3 gap-3">
                <div>
                  <dt className="text-[11px] font-medium text-text-muted">{t("current")}</dt>
                  <dd className="text-[22px] font-bold leading-tight tabular-nums text-text-heading">
                    {payload.value}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium text-text-muted">{t("previousPeriod")}</dt>
                  <dd className="text-[22px] font-bold leading-tight tabular-nums text-text-muted">
                    {payload.previous ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium text-text-muted">{t("change")}</dt>
                  <dd
                    className={`text-[22px] font-bold leading-tight tabular-nums ${
                      payload.changeDirection === "up"
                        ? "text-emerald-700"
                        : payload.changeDirection === "down"
                          ? "text-rose-700"
                          : "text-text-muted"
                    }`}
                  >
                    {payload.change ?? "—"}
                  </dd>
                </div>
              </dl>

              <div className="mt-4">
                <h3 className="text-[12px] font-bold text-text-heading">{t("trendHeading")}</h3>
                <DrawerTrend series={payload.series} prevSeries={payload.prevSeries} />
                <p className="text-[11px] text-text-muted">{t("trendLegend")}</p>
              </div>

              <div className="mt-4">
                <h3 className="text-[12px] font-bold text-text-heading">{t("topContentHeading")}</h3>
                {payload.top.length === 0 ? (
                  <p className="mt-1.5 rounded-xl bg-paper/70 px-3 py-4 text-center text-[12px] text-text-muted">
                    {t("noContentData")}
                  </p>
                ) : (
                  <ol className="mt-1.5 space-y-1">
                    {payload.top.map((row) => (
                      <li key={row.key} className="flex items-baseline gap-2 text-[12px]">
                        <Link
                          href={row.href}
                          className="min-w-0 flex-1 truncate font-medium text-text-body hover:text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                          title={row.title}
                          dir="auto"
                        >
                          {row.title}
                        </Link>
                        <span className="shrink-0 text-[11px] text-text-muted">{row.secondary}</span>
                        <span className="shrink-0 font-bold tabular-nums text-text-heading">{row.value}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {payload.alerts.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-[12px] font-bold text-text-heading">{t("relatedAlerts")}</h3>
                  <ul className="mt-1.5 space-y-1">
                    {payload.alerts.map((a) => (
                      <li key={a.key}>
                        <Link
                          href={a.href}
                          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-text-body transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                        >
                          <span
                            aria-hidden="true"
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              a.severity === "critical"
                                ? "bg-rose-500"
                                : a.severity === "warning"
                                  ? "bg-amber-500"
                                  : "bg-sky-500"
                            }`}
                          />
                          <span className="min-w-0 flex-1">{a.label}</span>
                          <ArrowRight className="h-3 w-3 shrink-0 text-text-muted" aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {payload.limitation && (
                <p className="mt-4 rounded-xl border border-divider bg-paper/50 p-2.5 text-[11px] leading-4 text-text-muted">
                  {payload.limitation}
                </p>
              )}

              <Link
                href={payload.reportHref}
                className="mt-4 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {payload.reportLabel}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
