"use client";

import { Activity, AlertOctagon, AlertTriangle, CheckCircle2, ChevronRight, HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { HealthCheckLevel, HealthLevel, HealthPulse } from "@/lib/admin/dashboard-shared";
import { useMetricSelection } from "./MetricSelection";

/** One status class per level; the chip, the rail and the dots all read their
 *  colours from it (see `.dash-status--*` in admin.css), so they cannot drift.
 *  Each level also owns a distinct icon shape — colour is never the only cue. */
const LEVEL_STYLE: Record<HealthLevel, { status: string; icon: typeof Activity; rail: string }> = {
  operational: { status: "dash-status--ok", icon: CheckCircle2, rail: "dash-sev--ok" },
  degraded: { status: "dash-status--warn", icon: AlertTriangle, rail: "dash-sev--warning" },
  critical: { status: "dash-status--crit", icon: AlertOctagon, rail: "dash-sev--critical" },
  unknown: { status: "dash-status--neutral", icon: HelpCircle, rail: "dash-sev--info" },
};

const CHECK_STATUS: Record<HealthCheckLevel, string> = {
  ok: "dash-status--ok",
  warn: "dash-status--warn",
  critical: "dash-status--crit",
  unknown: "dash-status--neutral",
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
    /* A severity RAIL, not the `.dash-kpi` top strip. That 3px strip is the
       metric cards' "this card is that series" mark, and this ribbon sits 16px
       above four cards wearing it — so the same device meant "series identity"
       and "system status" on two stacked elements. The left rail is the
       vocabulary the dashboard already uses for severity. */
    <div className={`dash-card dash-sev ${style.rail} ${style.status} overflow-hidden`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 p-5 ps-6">
        {/* Identity + verdict */}
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="dash-ico dash-ico--sm dash-ico--brand" aria-hidden="true">
            <Activity className="h-[15px] w-[15px]" />
          </span>
          <span className="whitespace-nowrap text-xs font-semibold text-text-muted">
            {t("title")}
          </span>
          <p className="dash-chip text-sm font-bold">
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t(`level.${pulse.level}`)}
          </p>
        </div>

        {/* Named failing subsystems (or the all-clear summary) */}
        <p className="dash-prose min-w-[min(100%,180px)] flex-1">
          {failingChecks.length > 0
            ? t("failingList", { list: failingChecks.map((c) => t(`check.${c.key}`)).join(", ") })
            : t("passingSummary", { passing: pulse.passing, total: pulse.checks.length })}
        </p>

        {/* Per-check state dots — text alternative in the drawer. Each <li>
            carries its own status class, so the dot reads --dash-status-mark
            (all four ≥4.8:1 on white; the old `bg-amber-500` was 2.15:1, below
            the 3:1 floor for a non-text mark). */}
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {pulse.checks.map((c) => (
            <li
              key={c.key}
              className={`${CHECK_STATUS[c.level]} flex items-center gap-1.5 text-xs leading-4 text-text-muted`}
            >
              <span aria-hidden="true" className="dash-dot" />
              <span>{t(`checkShort.${c.key}`)}</span>
              <span className="sr-only">{t(`checkLevel.${c.level}`)}</span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => openDetails("health")}
          className="flex h-8 shrink-0 cursor-pointer items-center gap-0.5 rounded-lg border border-brand/20 px-2.5 text-xs font-semibold text-brand transition-colors hover:bg-brand/5 [--focus-ring-offset:1px]"
        >
          {t("viewChecks")}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
