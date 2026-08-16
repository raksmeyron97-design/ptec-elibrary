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
 * The Executive Pulse's operational verdict, as a full-width status ribbon that
 * sits *above* the four engagement measures — so "is anything broken?" is
 * answered before the numbers, not weighed equally against them. The failing
 * subsystems are named, every check gets a state dot, and the details drawer
 * carries the measured values. Levels always carry an icon shape and a word,
 * never colour alone; the full-width top strip is a redundant, glanceable cue.
 */
export default function HealthCard({ pulse }: { pulse: HealthPulse }) {
  const t = useTranslations("adminDashboard.health");
  const { openDetails } = useMetricSelection();
  const style = LEVEL_STYLE[pulse.level];
  const Icon = style.icon;

  const failingChecks = pulse.checks.filter((c) => c.level === "warn" || c.level === "critical");

  return (
    <div className={`dash-card dash-kpi ${style.strip} overflow-hidden`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 p-3.5">
        {/* Identity + verdict */}
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="dash-ico dash-ico--sm dash-ico--brand" aria-hidden="true">
            <Activity className="h-[15px] w-[15px]" />
          </span>
          <span className="whitespace-nowrap text-[12.5px] font-semibold text-text-muted">{t("title")}</span>
          <p
            className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[14px] font-bold ring-1 ring-inset ${style.chip}`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t(`level.${pulse.level}`)}
          </p>
        </div>

        {/* Named failing subsystems (or the all-clear summary) */}
        <p className="min-w-[min(100%,180px)] flex-1 text-[12px] leading-[17px] text-text-muted">
          {failingChecks.length > 0
            ? t("failingList", { list: failingChecks.map((c) => t(`check.${c.key}`)).join(", ") })
            : t("passingSummary", { passing: pulse.passing, total: pulse.checks.length })}
        </p>

        {/* Per-check state dots — text alternative in the drawer. */}
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {pulse.checks.map((c) => (
            <li key={c.key} className="flex items-center gap-1 text-[10.5px] text-text-muted">
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${CHECK_DOT[c.level]}`} />
              <span>{t(`checkShort.${c.key}`)}</span>
              <span className="sr-only">{t(`checkLevel.${c.level}`)}</span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => openDetails("health")}
          className="flex h-8 shrink-0 cursor-pointer items-center gap-0.5 rounded-lg border border-brand/20 px-2.5 text-[11.5px] font-semibold text-brand transition-colors hover:bg-brand/5 [--focus-ring-offset:1px]"
        >
          {t("viewChecks")}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
