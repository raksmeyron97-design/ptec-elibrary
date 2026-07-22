import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Lightbulb, TrendingUp, AlertTriangle, Info } from "lucide-react";
import type { Insight, InsightSeverity } from "@/lib/admin/insights";

const PRIORITY: Record<InsightSeverity, { key: string; icon: typeof Info; iconColor: string; surface: string }> = {
  positive: { key: "opportunity", icon: TrendingUp, iconColor: "text-emerald-600", surface: "dash-insight--positive" },
  warning: { key: "warning", icon: AlertTriangle, iconColor: "text-amber-600", surface: "dash-insight--warning" },
  info: { key: "information", icon: Info, iconColor: "text-sky-600", surface: "dash-insight--info" },
};

/**
 * Rule-based insights — deterministic thresholds over verified aggregates, no
 * LLM involvement, and labelled as such so nobody mistakes them for AI output.
 *
 * Each card answers three questions in order: what changed (with its numbers),
 * why it matters, and what to do next. Wording is correlational by
 * construction ("occurred after", "coincided with") because none of these
 * rules can establish causation.
 */
export default async function AutomatedInsightsPanel({
  insights,
  emptyHint,
}: {
  insights: Insight[];
  emptyHint: string;
}) {
  const t = await getTranslations("adminDashboard.insights");

  return (
    <section aria-labelledby="insights-heading" className="dash-insight-panel flex h-full flex-col p-4">
      <div className="flex items-center gap-2">
        <span className="dash-ico dash-ico--gold dash-ico--md" aria-hidden="true">
          <Lightbulb className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="dash-eyebrow">{t("eyebrow")}</p>
          <h2 id="insights-heading" className="text-[14px] font-bold text-text-heading">
            {t("title")}
          </h2>
        </div>
      </div>

      {insights.length === 0 ? (
        <div className="mt-3 flex flex-1 flex-col items-center justify-center gap-1 rounded-xl bg-white/60 px-3 py-8 text-center">
          <p className="text-[12.5px] font-semibold text-text-heading">{t("emptyTitle")}</p>
          <p className="max-w-xs text-[11.5px] text-text-muted">{emptyHint}</p>
        </div>
      ) : (
        <div className="mt-3 flex-1 space-y-2">
          {insights.map((insight) => {
            const p = PRIORITY[insight.severity];
            const Icon = p.icon;
            return (
              <article key={insight.key} className={`dash-insight ${p.surface} px-3 py-2.5`}>
                <p className="flex items-center gap-1.5">
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${p.iconColor}`} aria-hidden="true" />
                  <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">
                    {t(`priority.${p.key}`)}
                  </span>
                </p>
                {/* What changed — with the numbers that triggered the rule. */}
                <p className="mt-1 text-[12.5px] font-semibold leading-5 text-text-heading">
                  {t(insight.key, insight.params)}
                </p>
                {/* Why it matters. */}
                <p className="mt-0.5 text-[11.5px] leading-4 text-text-muted">{t(`why.${insight.key}`)}</p>
                {/* Recommended action + route to the underlying data. */}
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11.5px] font-medium text-text-body">{t(`action.${insight.key}`)}</p>
                  <Link
                    href={insight.href}
                    className="flex items-center gap-0.5 whitespace-nowrap text-[11.5px] font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    {t("viewData")}
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="mt-2.5 text-[10.5px] leading-4 text-text-muted">{t("disclaimer")}</p>
    </section>
  );
}
