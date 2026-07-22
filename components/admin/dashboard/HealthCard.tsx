"use client";

import { Activity, AlertOctagon, AlertTriangle, CheckCircle2, ChevronRight, HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { HealthCheckLevel, HealthLevel, HealthPulse } from "@/lib/admin/dashboard-shared";
import { useMetricSelection } from "./MetricSelection";

const LEVEL_STYLE: Record<HealthLevel, { chip: string; icon: typeof Activity; strip: string }> = {
  operational: { chip: "bg-emerald-50 text-emerald-800 ring-emerald-200", icon: CheckCircle2, strip: "dash-kpi--ok" },
  degraded: { chip: "bg-amber-50 text-amber-900 ring-amber-200", icon: AlertTriangle, strip: "dash-kpi--warn" },
  critical: { chip: "bg-rose-50 text-rose-800 ring-rose-200", icon: AlertOctagon, strip: "dash-kpi--crit" },
  unknown: { chip: "bg-slate-100 text-slate-700 ring-slate-200", icon: HelpCircle, strip: "dash-kpi--unknown" },
};

const CHECK_DOT: Record<HealthCheckLevel, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  critical: "bg-rose-500",
  unknown: "bg-slate-300",
};

/**
 * First card of the Executive Pulse: the operational verdict, its failing
 * subsystems named, and a details drawer with every check and its measured
 * value. Levels always carry an icon shape and a word, never colour alone.
 */
export default function HealthCard({ pulse }: { pulse: HealthPulse }) {
  const t = useTranslations("adminDashboard.health");
  const { openDetails } = useMetricSelection();
  const style = LEVEL_STYLE[pulse.level];
  const Icon = style.icon;

  const failingChecks = pulse.checks.filter((c) => c.level === "warn" || c.level === "critical");

  return (
    <div className={`dash-kpi ${style.strip} dash-metric-card`}>
      <div className="flex flex-col gap-2.5 p-4 pb-2">
        <div className="flex items-center gap-2">
          <span className="dash-ico dash-ico--sm dash-ico--brand" aria-hidden="true">
            <Activity className="h-[15px] w-[15px]" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text-muted">{t("title")}</span>
        </div>

        <p
          className={`inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-[15px] font-bold ring-1 ring-inset ${style.chip}`}
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t(`level.${pulse.level}`)}
        </p>

        <div className="min-h-[34px] text-[12px] leading-[17px] text-text-muted">
          {failingChecks.length > 0 ? (
            <span>
              {t("failingList", {
                list: failingChecks.map((c) => t(`check.${c.key}`)).join(", "),
              })}
            </span>
          ) : (
            <span>{t("passingSummary", { passing: pulse.passing, total: pulse.checks.length })}</span>
          )}
        </div>

        {/* Compact per-check state strip — text alternative in the drawer. */}
        <ul className="flex flex-wrap items-center gap-1.5">
          {pulse.checks.map((c) => (
            <li key={c.key} className="flex items-center gap-1 text-[10.5px] text-text-muted">
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${CHECK_DOT[c.level]}`} />
              <span>{t(`checkShort.${c.key}`)}</span>
              <span className="sr-only">{t(`checkLevel.${c.level}`)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-end border-t border-divider/60 px-2 py-1">
        <button
          type="button"
          onClick={() => openDetails("health")}
          className="flex h-7 cursor-pointer items-center gap-0.5 rounded-lg px-2 text-[11.5px] font-semibold text-brand transition-colors hover:bg-brand/5 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
        >
          {t("viewChecks")}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
