import { getLocale, getTranslations } from "next-intl/server";
import { BarChart3, MousePointerClick, SearchCheck, SearchX } from "lucide-react";
import { percentChange, type SearchKpis } from "@/lib/admin/search-insights-shared";
import KpiCard from "@/components/admin/dashboard/KpiCard";
import type { TrendInfo } from "@/lib/admin/dashboard-shared";

/**
 * A percent trend for one KPI, or null when there is no previous window to
 * compare against — a fabricated "+100%" against an empty prior period is
 * worse than no number at all.
 *
 * `direction` (the arrow) tracks the RAW sign of the change; `trendTone` (the
 * colour) is computed separately from `higherIsBetter`, because the two can
 * disagree — a RISING zero-result rate is bad news and must not read as green
 * just because the number went up.
 */
function trendOf(
  delta: number | null,
  neutralLabel: string,
  higherIsBetter: boolean,
): { trend: TrendInfo | null; trendTone: "success" | "danger" | undefined } {
  if (delta === null) return { trend: null, trendTone: undefined };
  const improving = higherIsBetter ? delta >= 0 : delta <= 0;
  return {
    trend: {
      direction: delta < 0 ? "down" : "up",
      value: `${delta > 0 ? "+" : ""}${delta}%`,
      label: neutralLabel,
      mode: "percent",
    },
    trendTone: improving ? "success" : "danger",
  };
}

/**
 * The five headline measures. Formulas live in
 * lib/admin/search-insights-shared.ts (`computeKpis`) and are documented
 * there; a rate that cannot be calculated renders as "—", never as 0%.
 *
 * Cards render through the dashboard's shared `KpiCard` — this file used to
 * carry its own, fifth re-implementation of the same KPI-card pattern (see
 * the admin dashboard modernization audit's KPI-card-consolidation item),
 * with its own top-strip colour logic. `trendTone`, `noTrendLabel` and the
 * "ok" / "crit" threshold accents exist on the shared card specifically so
 * this page's "a rise can be bad" cards could move onto it too.
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

  const successRate = trendOf(
    previous ? percentChange(kpis.successRate, previous.successRate) : null,
    compareLabel,
    true,
  );
  const zeroRate = trendOf(
    previous ? percentChange(kpis.zeroResultRate, previous.zeroResultRate) : null,
    compareLabel,
    false,
  );
  const searches = trendOf(
    previous ? percentChange(kpis.searches, previous.searches) : null,
    compareLabel,
    true,
  );
  const clickRate = trendOf(
    previous ? percentChange(kpis.clickRate, previous.clickRate) : null,
    compareLabel,
    true,
  );
  const perDay = trendOf(
    previous ? percentChange(kpis.avgPerDay, previous.avgPerDay) : null,
    compareLabel,
    true,
  );

  return (
    <section aria-label={t("aria")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <KpiCard
        title={t("searches")}
        value={numberFormat.format(kpis.searches)}
        hint={t("searchesHint")}
        trend={searches.trend}
        trendTone={searches.trendTone}
        noTrendLabel={compareLabel}
        icon={BarChart3}
        // Neutral identity: this metric has no inherent good/bad direction,
        // regardless of which way any given period's number moved.
        accent="views"
      />
      <KpiCard
        title={t("successRate")}
        value={pct(kpis.successRate)}
        hint={kpis.unmeasured > 0 ? t("unmeasured", { count: numberFormat.format(kpis.unmeasured) }) : t("successHint")}
        trend={successRate.trend}
        trendTone={successRate.trendTone}
        noTrendLabel={compareLabel}
        icon={SearchCheck}
        // Inherently a positive metric — always the "good" identity, whether
        // or not it happens to have risen this period.
        accent="ok"
      />
      <KpiCard
        title={t("zeroRate")}
        value={pct(kpis.zeroResultRate)}
        hint={t("zeroHint")}
        trend={zeroRate.trend}
        trendTone={zeroRate.trendTone}
        noTrendLabel={compareLabel}
        icon={SearchX}
        // Inherently a negative metric — always the "bad" identity, whether
        // or not it happens to have fallen this period.
        accent="crit"
      />
      <KpiCard
        title={t("clickRate")}
        value={pct(kpis.clickRate)}
        hint={t("clickHint")}
        trend={clickRate.trend}
        trendTone={clickRate.trendTone}
        noTrendLabel={compareLabel}
        icon={MousePointerClick}
        accent="views"
      />
      <KpiCard
        title={t("perDay")}
        value={numberFormat.format(kpis.avgPerDay)}
        hint={t("perDayHint", { days })}
        trend={perDay.trend}
        trendTone={perDay.trendTone}
        noTrendLabel={compareLabel}
        icon={BarChart3}
        accent="views"
      />
    </section>
  );
}
