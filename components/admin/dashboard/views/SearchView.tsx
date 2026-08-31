import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { Search, MousePointerClick, SearchX, Languages, Sparkles, Clock, Cpu } from "lucide-react";
import { getSearchAiData, type QueryTableRow } from "@/lib/admin/intelligence";
import { serializeDashboardFilters, type DashboardFilters } from "@/lib/admin/dashboard-shared";
import FreshnessLine from "../FreshnessLine";
import SearchTrendChart from "../SearchTrendChart";
import OpportunityList from "../OpportunityList";
import KpiCard from "../KpiCard";

const QUERY_VIEWS = ["all", "zero", "noClick", "trending"] as const;
type QueryView = (typeof QUERY_VIEWS)[number];

export default async function SearchView({
  filters,
  queryViewParam,
}: {
  filters: DashboardFilters;
  queryViewParam?: string;
}) {
  const t = await getTranslations("adminDashboard.searchAi");
  const locale = await getLocale();
  const nf = new Intl.NumberFormat(locale === "km" ? "km-KH" : "en-US");
  const data = await getSearchAiData(filters);
  const s = data.search;

  const queryView: QueryView = (QUERY_VIEWS as readonly string[]).includes(queryViewParam ?? "")
    ? (queryViewParam as QueryView)
    : "all";

  const baseQs = serializeDashboardFilters(filters);
  const hrefFor = (v: QueryView) => {
    const sp = new URLSearchParams(baseQs);
    if (v !== "all") sp.set("qview", v);
    const str = sp.toString();
    return str ? `/admin?${str}` : "/admin";
  };

  const filteredRows: QueryTableRow[] = s.queryTable
    .filter((r) =>
      queryView === "zero" ? r.zero : queryView === "noClick" ? r.noClick : queryView === "trending" ? r.trending : true,
    )
    .slice(0, 15);

  // Search-health thresholds: CTR under 10% and zero-result rate over 15%
  // are amber; zero-result over 25% is red. Icons + sr text always accompany
  // the colour.
  const ctrTone = s.ctr !== null && s.ctr < 10 ? ("warn" as const) : undefined;
  const zeroTone =
    s.zeroRate === null ? undefined : s.zeroRate > 25 ? ("critical" as const) : s.zeroRate > 15 ? ("warn" as const) : undefined;

  const statusChip = (r: QueryTableRow) => {
    if (r.suspectedTest)
      return <span className="dash-status--neutral dash-chip text-xs font-bold">{t("status.test")}</span>;
    if (r.zero)
      return <span className="dash-status--crit dash-chip text-xs font-bold">{t("status.zero")}</span>;
    if (r.noClick)
      return <span className="dash-status--warn dash-chip text-xs font-bold">{t("status.noClick")}</span>;
    if (r.trending)
      return <span className="dash-status--ok dash-chip text-xs font-bold">{t("status.trending")}</span>;
    return <span className="text-xs text-text-muted">—</span>;
  };

  // Outer wrapper matches OverviewView's space-y-8 "zone" rhythm — the
  // dashboard-modernization audit's density item: this tab used to sit at
  // one flat space-y-5 level while Overview alone separated its zones with
  // extra air. Nested grids/cards below keep their own space-y-5/gap-5 —
  // that rhythm is WITHIN a zone, not between them, and stays unchanged.
  return (
    <div className="space-y-8">
      {/* ── KPI row ── */}
      <section aria-label={t("searchSection")}>
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-5">
          <KpiCard
            accent="views"
            title={t("totalSearches")}
            value={nf.format(s.total)}
            definition={t("totalSearchesDef")}
            badge={
              filters.compare && s.previousTotal > 0
                ? t("prevValue", { value: nf.format(s.previousTotal) })
                : null
            }
            icon={Search}
          />
          <KpiCard
            accent="visitors"
            title={t("sessions")}
            value={s.sessions === null ? "—" : nf.format(s.sessions)}
            definition={s.sessions === null ? t("collectingHint") : t("sessionsHint")}
            icon={Clock}
          />
          <KpiCard
            accent="reader"
            title={t("ctr")}
            value={s.ctr === null ? "—" : `${s.ctr}%`}
            definition={t("ctrHint")}
            icon={MousePointerClick}
            tone={ctrTone}
            toneLabel={ctrTone ? t("thresholdWarn") : undefined}
          />
          <KpiCard
            accent="downloads"
            title={t("zeroRate")}
            value={s.zeroRate === null ? "—" : `${s.zeroRate}%`}
            definition={s.avgResults !== null ? t("avgResults", { value: s.avgResults }) : t("zeroRateDef")}
            icon={SearchX}
            tone={zeroTone}
            toneLabel={zeroTone === "critical" ? t("thresholdCritical") : zeroTone === "warn" ? t("thresholdWarn") : undefined}
          />
          <KpiCard
            accent="gold"
            title={t("kmShare")}
            value={s.kmSharePct === null ? "—" : `${s.kmSharePct}%`}
            definition={t("kmShareHint")}
            icon={Languages}
          />
        </div>
      </section>

      {/* ── Trend (7) + opportunities (5) ── */}
      <div className="grid gap-5 lg:grid-cols-12">
        <section aria-labelledby="search-trend-heading" className="dash-card p-5 lg:col-span-7">
          <div className="flex items-center gap-2.5">
            <span className="dash-ico dash-ico--views dash-ico--md" aria-hidden="true">
              <Search className="h-[18px] w-[18px]" />
            </span>
            <div>
              <h3 id="search-trend-heading" className="text-sm font-bold text-text-heading">
                {t("trendTitle")}
              </h3>
              <p className="text-xs text-text-muted">{t("trendSubtitle")}</p>
            </div>
          </div>
          <div className="mt-2">
            <SearchTrendChart trend={s.trend} granularity={filters.range === "today" ? "hour" : "day"} />
          </div>
        </section>

        <section aria-labelledby="opportunities-heading" className="dash-insight-panel p-5 lg:col-span-5">
          <div className="flex items-center gap-2.5">
            <span className="dash-ico dash-ico--gold dash-ico--md" aria-hidden="true">
              <Sparkles className="h-[18px] w-[18px]" />
            </span>
            <div>
              <h3 id="opportunities-heading" className="text-sm font-bold text-text-heading">
                {t("opportunitiesTitle")}
              </h3>
              <p className="text-xs text-text-muted">{t("opportunitiesHint")}</p>
            </div>
          </div>
          <OpportunityList
            items={data.opportunities.slice(0, 6).map(({ kind, term, count }) => ({ kind, term, count }))}
          />
          <Link
            href="/admin/search-insights"
            className="mt-2.5 inline-block text-xs font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {t("actOnThis")}
          </Link>
        </section>
      </div>

      {/* ── Consolidated query table ── */}
      <section aria-labelledby="query-table-heading" className="dash-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5">
          <h3 id="query-table-heading" className="text-sm font-bold text-text-heading">
            {t("queryTableTitle")}
          </h3>
          <nav aria-label={t("queryViewsLabel")} className="flex items-center gap-1">
            {QUERY_VIEWS.map((v) => (
              <Link
                key={v}
                href={hrefFor(v)}
                aria-current={v === queryView ? "page" : undefined}
                className={`rounded-lg px-2 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                  v === queryView ? "bg-brand text-white shadow-sm" : "text-text-muted hover:bg-paper hover:text-text-heading"
                }`}
              >
                {t(`queryViews.${v}`)}
              </Link>
            ))}
          </nav>
        </div>
        {filteredRows.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-text-muted">{t("noQueries")}</p>
        ) : (
          <div className="mt-2.5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead className="dash-thead">
                <tr className="text-xs font-bold">
                  <th scope="col" className="px-4 py-2 text-start font-bold">{t("queryCols.query")}</th>
                  <th scope="col" className="px-2 py-2 text-start font-bold">{t("queryCols.lang")}</th>
                  <th scope="col" className="px-2 py-2 text-end font-bold">{t("queryCols.searches")}</th>
                  <th scope="col" className="px-2 py-2 text-end font-bold">{t("queryCols.results")}</th>
                  <th scope="col" className="px-2 py-2 text-end font-bold">{t("queryCols.clicks")}</th>
                  <th scope="col" className="px-2 py-2 text-end font-bold">{t("queryCols.ctr")}</th>
                  <th scope="col" className="px-2 py-2 pe-4 text-end font-bold">{t("queryCols.status")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={r.term} className="dash-row border-b border-divider/60 last:border-b-0">
                    <td className="max-w-[280px] px-4 py-1.5">
                      <span className="block dash-truncate font-medium text-text-body" dir="auto" title={r.term}>
                        {r.term}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-text-muted">{r.lang ? t(`langNames.${r.lang}`) : "—"}</td>
                    <td className="px-2 py-1.5 text-end tabular-nums font-semibold text-text-heading">
                      {nf.format(r.searches)}
                      {filters.compare && r.prevSearches > 0 && (
                        <span className="ms-1 text-xs font-normal text-text-muted">({nf.format(r.prevSearches)})</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-end tabular-nums">{r.avgResults ?? "—"}</td>
                    <td className="px-2 py-1.5 text-end tabular-nums">{nf.format(r.clicks)}</td>
                    <td className="px-2 py-1.5 text-end tabular-nums">{r.ctrPct === null ? "—" : `${r.ctrPct}%`}</td>
                    <td className="px-2 py-1.5 pe-4 text-end">{statusChip(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-divider/70 px-4 py-2 text-xs text-text-muted">{t("testQueryNote")}</p>
      </section>

      {/* ── AI telemetry — compact strip ── */}
      <section aria-labelledby="ai-heading" className="dash-card flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        <h3 id="ai-heading" className="flex items-center gap-1.5 text-sm font-bold text-text-heading">
          <Cpu className="h-4 w-4 text-brand" aria-hidden="true" />
          {t("aiTitle")}
        </h3>
        {data.ai.collecting ? (
          <p className="dash-status--info text-xs text-[var(--dash-status-fg)]">{t("aiCollectingShort")}</p>
        ) : (
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
            <div className="flex items-baseline gap-1.5">
              <dt className="text-text-muted">{t("aiRequests")}</dt>
              <dd className="font-bold tabular-nums text-text-heading">{nf.format(data.ai.total)}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-text-muted">{t("aiOkRate")}</dt>
              <dd className="font-bold tabular-nums text-text-heading">{data.ai.okRate === null ? "—" : `${data.ai.okRate}%`}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-text-muted">{t("aiLatency")}</dt>
              <dd className="font-bold tabular-nums text-text-heading">
                {data.ai.avgLatencyMs === null ? "—" : `${nf.format(data.ai.avgLatencyMs)} ms`}
              </dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-text-muted">{t("aiQuota")}</dt>
              <dd className="font-bold tabular-nums text-text-heading">{nf.format(data.ai.quotaHits)}</dd>
            </div>
          </dl>
        )}
      </section>

      <FreshnessLine generatedAt={data.generatedAt} />
    </div>
  );
}
