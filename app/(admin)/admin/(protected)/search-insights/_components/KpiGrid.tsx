import { getLocale, getTranslations } from "next-intl/server";
import { BarChart3, MousePointerClick, SearchCheck, SearchX, TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { percentChange, type SearchKpis } from "@/lib/admin/search-insights-shared";

type CardTone = "neutral" | "good" | "bad";

/**
 * One KPI.
 *
 * The delta is shown ONLY when there is a previous window to compare with.
 * With no comparison the card states the period instead — a fabricated
 * "+100%" against an empty prior period is worse than no number at all.
 *
 * `higherIsBetter` decides whether a rise is green or red: a rising
 * zero-result rate is bad news and must not be painted as growth.
 */
function KpiCard({
  icon,
  label,
  value,
  hint,
  delta,
  neutralLabel,
  higherIsBetter,
  tone = "neutral",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  delta: number | null;
  neutralLabel: string;
  higherIsBetter: boolean;
  tone?: CardTone;
}) {
  const accent =
    tone === "bad" ? "var(--ptec-danger)" : tone === "good" ? "var(--ptec-success)" : "var(--ptec-series-views)";
  const improving = delta === null ? null : higherIsBetter ? delta >= 0 : delta <= 0;
  const DeltaIcon = delta !== null && delta < 0 ? TrendingDown : TrendingUp;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: accent, opacity: 0.9 }} aria-hidden="true" />
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">{label}</p>
        <span style={{ color: accent }}>{icon}</span>
      </div>
      {/* Proportional figures on a standalone value; tabular is for columns. */}
      <p className="mt-3 text-[28px] font-bold leading-none text-text-heading">{value}</p>
      <p className="mt-2 min-h-[18px] text-[11.5px] leading-[18px]">
        {delta === null ? (
          <span className="text-text-muted">{neutralLabel}</span>
        ) : (
          <span className="flex flex-wrap items-center gap-x-1.5 text-text-muted">
            <span
              className="inline-flex items-center gap-0.5 font-bold tabular-nums"
              style={{ color: improving ? "var(--ptec-success)" : "var(--ptec-danger)" }}
            >
              <DeltaIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {delta > 0 ? "+" : ""}{delta}%
            </span>
            {neutralLabel}
          </span>
        )}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-text-muted">{hint}</p>
    </div>
  );
}

/**
 * The five headline measures. Formulas live in
 * lib/admin/search-insights-shared.ts (`computeKpis`) and are documented
 * there; a rate that cannot be calculated renders as "—", never as 0%.
 */
export default async function KpiGrid({
  kpis,
  previous,
  days,
}: {
  kpis: SearchKpis;
  previous: SearchKpis | null;
  days: number;
}) {
  const [t, locale] = await Promise.all([
    getTranslations("adminSearchInsights.kpi"),
    getLocale(),
  ]);
  const numberFormat = new Intl.NumberFormat(locale);
  const pct = (value: number | null) => (value === null ? "—" : `${value}%`);
  const compareLabel = previous ? t("vsPrevious", { days }) : t("selectedPeriod");

  return (
    <section aria-label={t("aria")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <KpiCard
        icon={<BarChart3 className="h-4 w-4" />}
        label={t("searches")}
        value={numberFormat.format(kpis.searches)}
        hint={t("searchesHint")}
        delta={previous ? percentChange(kpis.searches, previous.searches) : null}
        neutralLabel={compareLabel}
        higherIsBetter
      />
      <KpiCard
        icon={<SearchCheck className="h-4 w-4" />}
        label={t("successRate")}
        value={pct(kpis.successRate)}
        hint={kpis.unmeasured > 0 ? t("unmeasured", { count: numberFormat.format(kpis.unmeasured) }) : t("successHint")}
        delta={previous ? percentChange(kpis.successRate, previous.successRate) : null}
        neutralLabel={compareLabel}
        higherIsBetter
        tone="good"
      />
      <KpiCard
        icon={<SearchX className="h-4 w-4" />}
        label={t("zeroRate")}
        value={pct(kpis.zeroResultRate)}
        hint={t("zeroHint")}
        delta={previous ? percentChange(kpis.zeroResultRate, previous.zeroResultRate) : null}
        neutralLabel={compareLabel}
        higherIsBetter={false}
        tone="bad"
      />
      <KpiCard
        icon={<MousePointerClick className="h-4 w-4" />}
        label={t("clickRate")}
        value={pct(kpis.clickRate)}
        hint={t("clickHint")}
        delta={previous ? percentChange(kpis.clickRate, previous.clickRate) : null}
        neutralLabel={compareLabel}
        higherIsBetter
      />
      <KpiCard
        icon={<BarChart3 className="h-4 w-4" />}
        label={t("perDay")}
        value={numberFormat.format(kpis.avgPerDay)}
        hint={t("perDayHint", { days })}
        delta={previous ? percentChange(kpis.avgPerDay, previous.avgPerDay) : null}
        neutralLabel={compareLabel}
        higherIsBetter
      />
    </section>
  );
}
