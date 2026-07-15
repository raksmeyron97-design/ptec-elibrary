import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { Search, MousePointerClick, SearchX, Languages, Sparkles, Clock, Cpu } from "lucide-react";
import { getSearchAiData, type QueryTableRow } from "@/lib/admin/intelligence";
import { serializeDashboardFilters, type DashboardFilters } from "@/lib/admin/dashboard-shared";
import FreshnessLine from "../FreshnessLine";
import SearchTrendChart from "../SearchTrendChart";

const QUERY_VIEWS = ["all", "zero", "noClick", "trending"] as const;
type QueryView = (typeof QUERY_VIEWS)[number];

function MetricCard({
  label,
  value,
  hint,
  icon,
  accent = "brand",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  accent?: "views" | "visitors" | "reader" | "downloads" | "gold" | "brand";
}) {
  return (
    <div className={`dash-card dash-kpi dash-kpi--${accent === "gold" ? "downloads" : accent} p-3.5`}>
      <div className="flex items-center gap-2">
        <span className={`dash-ico dash-ico--${accent} dash-ico--sm`} aria-hidden="true">
          {icon}
        </span>
        <span className="text-[11.5px] font-semibold text-text-muted">{label}</span>
      </div>
      <p className="mt-2 text-[24px] font-bold leading-none tabular-nums text-text-heading">{value}</p>
      {hint && <p className="mt-1.5 text-[11px] text-text-muted">{hint}</p>}
    </div>
  );
}

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

  const statusChip = (r: QueryTableRow) => {
    if (r.suspectedTest)
      return <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-600">{t("status.test")}</span>;
    if (r.zero)
      return <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[10.5px] font-bold text-rose-700">{t("status.zero")}</span>;
    if (r.noClick)
      return <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-bold text-amber-800">{t("status.noClick")}</span>;
    if (r.trending)
      return <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-800">{t("status.trending")}</span>;
    return <span className="text-[10.5px] text-text-muted">—</span>;
  };

  return (
    <div className="space-y-4">
      {/* ── KPI row ── */}
      <section aria-label={t("searchSection")}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <MetricCard
            accent="views"
            label={t("totalSearches")}
            value={nf.format(s.total)}
            hint={
              filters.compare && s.previousTotal > 0
                ? t("prevValue", { value: nf.format(s.previousTotal) })
                : undefined
            }
            icon={<Search className="h-4 w-4" />}
          />
          <MetricCard
            accent="visitors"
            label={t("sessions")}
            value={s.sessions === null ? "—" : nf.format(s.sessions)}
            hint={s.sessions === null ? t("collectingHint") : t("sessionsHint")}
            icon={<Clock className="h-4 w-4" />}
          />
          <MetricCard
            accent="reader"
            label={t("ctr")}
            value={s.ctr === null ? "—" : `${s.ctr}%`}
            hint={t("ctrHint")}
            icon={<MousePointerClick className="h-4 w-4" />}
          />
          <MetricCard
            accent="downloads"
            label={t("zeroRate")}
            value={s.zeroRate === null ? "—" : `${s.zeroRate}%`}
            hint={s.avgResults !== null ? t("avgResults", { value: s.avgResults }) : undefined}
            icon={<SearchX className="h-4 w-4" />}
          />
          <MetricCard
            accent="gold"
            label={t("kmShare")}
            value={s.kmSharePct === null ? "—" : `${s.kmSharePct}%`}
            hint={t("kmShareHint")}
            icon={<Languages className="h-4 w-4" />}
          />
        </div>
      </section>

      {/* ── Trend (7) + opportunities (5) ── */}
      <div className="grid gap-4 lg:grid-cols-12">
        <section aria-labelledby="search-trend-heading" className="dash-card p-4 lg:col-span-7">
          <div className="flex items-center gap-2.5">
            <span className="dash-ico dash-ico--views dash-ico--md" aria-hidden="true">
              <Search className="h-[18px] w-[18px]" />
            </span>
            <div>
              <h3 id="search-trend-heading" className="text-[14px] font-bold text-text-heading">
                {t("trendTitle")}
              </h3>
              <p className="text-[11.5px] text-text-muted">{t("trendSubtitle")}</p>
            </div>
          </div>
          <div className="mt-2">
            <SearchTrendChart trend={s.trend} granularity={filters.range === "today" ? "hour" : "day"} />
          </div>
        </section>

        <section aria-labelledby="opportunities-heading" className="dash-insight-panel p-4 lg:col-span-5">
          <div className="flex items-center gap-2.5">
            <span className="dash-ico dash-ico--gold dash-ico--md" aria-hidden="true">
              <Sparkles className="h-[18px] w-[18px]" />
            </span>
            <div>
              <h3 id="opportunities-heading" className="text-[14px] font-bold text-text-heading">
                {t("opportunitiesTitle")}
              </h3>
              <p className="text-[11px] text-text-muted">{t("opportunitiesHint")}</p>
            </div>
          </div>
          {data.opportunities.length === 0 ? (
            <p className="mt-3 rounded-xl bg-white/60 px-3 py-5 text-center text-[12px] text-text-muted">
              {t("noOpportunities")}
            </p>
          ) : (
            <ul className="mt-2.5 space-y-1.5">
              {data.opportunities.slice(0, 6).map((o) => (
                <li key={`${o.kind}-${o.term}`} className="dash-insight flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="inline-flex shrink-0 items-center rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                    {t(`opportunityKind.${o.kind}`)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-text-body" title={o.term}>
                    {o.term}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-text-muted">
                    {t("searchedTimes", { count: o.count })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/admin/search-insights"
            className="mt-2.5 inline-block text-[11.5px] font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {t("actOnThis")}
          </Link>
        </section>
      </div>

      {/* ── Consolidated query table ── */}
      <section aria-labelledby="query-table-heading" className="dash-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5">
          <h3 id="query-table-heading" className="text-[14px] font-bold text-text-heading">
            {t("queryTableTitle")}
          </h3>
          <nav aria-label={t("queryViewsLabel")} className="flex items-center gap-1">
            {QUERY_VIEWS.map((v) => (
              <Link
                key={v}
                href={hrefFor(v)}
                aria-current={v === queryView ? "page" : undefined}
                className={`rounded-lg px-2 py-1 text-[11.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                  v === queryView ? "bg-brand text-white shadow-sm" : "text-text-muted hover:bg-paper hover:text-text-heading"
                }`}
              >
                {t(`queryViews.${v}`)}
              </Link>
            ))}
          </nav>
        </div>
        {filteredRows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12.5px] text-text-muted">{t("noQueries")}</p>
        ) : (
          <div className="mt-2.5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12.5px]">
              <thead className="dash-thead">
                <tr className="text-[11px] font-bold">
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
                      <span className="block truncate font-medium text-text-body" title={r.term}>
                        {r.term}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-text-muted">{r.lang ? t(`langNames.${r.lang}`) : "—"}</td>
                    <td className="px-2 py-1.5 text-end tabular-nums font-semibold text-text-heading">
                      {nf.format(r.searches)}
                      {filters.compare && r.prevSearches > 0 && (
                        <span className="ms-1 text-[10.5px] font-normal text-text-muted">({nf.format(r.prevSearches)})</span>
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
        <p className="border-t border-divider/70 px-4 py-2 text-[10.5px] text-text-muted">{t("testQueryNote")}</p>
      </section>

      {/* ── AI telemetry — compact strip ── */}
      <section aria-labelledby="ai-heading" className="dash-card flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        <h3 id="ai-heading" className="flex items-center gap-1.5 text-[13px] font-bold text-text-heading">
          <Cpu className="h-4 w-4 text-brand" aria-hidden="true" />
          {t("aiTitle")}
        </h3>
        {data.ai.collecting ? (
          <p className="text-[12px] text-sky-900">{t("aiCollectingShort")}</p>
        ) : (
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px]">
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
