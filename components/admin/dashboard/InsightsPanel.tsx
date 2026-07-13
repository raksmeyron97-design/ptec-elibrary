import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Lightbulb, TrendingUp, AlertTriangle, Info } from "lucide-react";
import type { Insight } from "@/lib/admin/insights";

const SEVERITY_STYLE = {
  positive: { icon: TrendingUp, iconColor: "text-emerald-600", surface: "dash-insight--positive" },
  warning: { icon: AlertTriangle, iconColor: "text-amber-600", surface: "dash-insight--warning" },
  info: { icon: Info, iconColor: "text-sky-600", surface: "dash-insight--info" },
} as const;

/**
 * Deterministic rule-based observations on a warm gold/ivory surface —
 * intentionally distinct from the red/amber Action Center so "an
 * opportunity" never reads as "an alert". Each cites its numbers and links
 * to the underlying data. No LLM involvement.
 */
export default async function InsightsPanel({ insights }: { insights: Insight[] }) {
  const t = await getTranslations("adminDashboard.insights");
  if (insights.length === 0) return null;

  return (
    <section aria-labelledby="insights-heading" className="dash-insight-panel p-4">
      <div className="flex items-center gap-2">
        <span className="dash-ico dash-ico--gold dash-ico--md" aria-hidden="true">
          <Lightbulb className="h-[18px] w-[18px]" />
        </span>
        <div>
          <p className="dash-eyebrow">{t("eyebrow")}</p>
          <h3 id="insights-heading" className="text-[14px] font-bold text-text-heading">
            {t("title")}
          </h3>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {insights.map((insight) => {
          const s = SEVERITY_STYLE[insight.severity];
          const IconCmp = s.icon;
          return (
            <div key={insight.key} className={`dash-insight ${s.surface} px-3 py-2.5`}>
              <p className="flex items-start gap-2 text-[12.5px] leading-5 text-text-body">
                <IconCmp className={`mt-0.5 h-4 w-4 shrink-0 ${s.iconColor}`} aria-hidden="true" />
                <span className="min-w-0">
                  {t(insight.key, insight.params)}{" "}
                  <Link
                    href={insight.href}
                    className="whitespace-nowrap font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    {t("viewData")}
                  </Link>
                </span>
              </p>
            </div>
          );
        })}
      </div>
      <p className="mt-2.5 text-[10.5px] text-text-muted">{t("disclaimer")}</p>
    </section>
  );
}
