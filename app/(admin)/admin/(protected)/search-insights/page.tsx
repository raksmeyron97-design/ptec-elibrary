import {
  Activity,
  BarChart3,
  Languages,
  MousePointerClick,
  SearchX,
} from "lucide-react";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { getSearchAnalytics, getZeroResultReport } from "@/app/actions/search-insights";
import { PageHeader } from "@/components/admin/kit";
import ZeroResultActionCenter from "./ZeroResultActionCenter";

export const dynamic = "force-dynamic";

type T = (key: string, values?: Record<string, string | number>) => string;

function timeAgo(iso: string | undefined, t: T): string {
  if (!iso) return t("time.recently");
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return t("time.today");
  if (days === 1) return t("time.yesterday");
  if (days < 30) return t("time.daysAgo", { count: days });
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: "UTC" });
}

function MetricCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
        {icon}
      </div>
      <p className="text-[12px] font-bold uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold text-text-heading">{value}</p>
      <p className="mt-1 text-[12.5px] text-text-muted">{hint}</p>
    </div>
  );
}

function TermList({
  title,
  items,
  empty,
  t,
}: {
  title: string;
  items: { term: string; count: number; lastSearchedAt?: string }[];
  empty: string;
  t: T;
}) {
  return (
    <section className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm">
      <h2 className="text-[15px] font-bold text-text-heading">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-5 rounded-xl bg-paper px-4 py-6 text-center text-[13px] text-text-muted">{empty}</p>
      ) : (
        <div className="mt-4 space-y-2">
          {items.map((item) => (
            <div key={item.term} className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold text-text-heading">{item.term}</p>
                {item.lastSearchedAt && (
                  <p className="text-[11.5px] text-text-muted">{timeAgo(item.lastSearchedAt, t)}</p>
                )}
              </div>
              <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[12px] font-bold text-brand">
                {item.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TrendBars({
  title,
  points,
  t,
}: {
  title: string;
  points: { label: string; count: number; noResults: number }[];
  t: T;
}) {
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <section className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm">
      <h2 className="text-[15px] font-bold text-text-heading">{title}</h2>
      <div className="mt-4 flex h-40 items-end gap-2" role="img" aria-label={t("trends.barAria", { title })}>
        {points.map((point) => {
          const height = point.count === 0 ? 3 : Math.max(8, Math.round((point.count / max) * 100));
          return (
            <div key={point.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <div className="flex min-h-0 w-full flex-1 items-end justify-center">
                <div
                  className="w-full max-w-12 rounded-t-md bg-brand"
                  style={{ height: `${height}%`, opacity: point.count ? 0.95 : 0.18 }}
                  title={t("trends.pointSr", { label: point.label, count: point.count, noResults: point.noResults })}
                  aria-hidden="true"
                />
              </div>
              <span className="max-w-full truncate text-[10px] font-medium text-text-muted" title={point.label}>
                {point.count}
              </span>
              <span className="sr-only">
                {t("trends.pointSr", { label: point.label, count: point.count, noResults: point.noResults })}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default async function SearchInsightsPage() {
  const [t, analytics, zeroResultReport] = await Promise.all([
    getTranslations("adminSearchInsights"),
    getSearchAnalytics(),
    getZeroResultReport(),
  ]);
  const languageTotal = analytics.languageUsage.km + analytics.languageUsage.en + analytics.languageUsage.other || 1;
  const kmPct = Math.round((analytics.languageUsage.km / languageTotal) * 100);
  const enPct = Math.round((analytics.languageUsage.en / languageTotal) * 100);

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title={t("title")} description={t("description")} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={t("metrics.totalSearches")}
          value={analytics.totalSearches}
          hint={t("metrics.hintTotal")}
          icon={<BarChart3 className="h-5 w-5" />}
        />
        <MetricCard
          label={t("metrics.noResults")}
          value={analytics.totalNoResultSearches}
          hint={t("metrics.hintNoResults")}
          icon={<SearchX className="h-5 w-5" />}
        />
        <MetricCard
          label={t("metrics.clickRate")}
          value={`${analytics.conversionRate}%`}
          hint={t("metrics.hintClickRate")}
          icon={<MousePointerClick className="h-5 w-5" />}
        />
        <MetricCard
          label={t("metrics.languageSplit")}
          value={`${kmPct}% / ${enPct}%`}
          hint={t("metrics.hintLanguage")}
          icon={<Languages className="h-5 w-5" />}
        />
      </div>

      <div className="mt-6">
        <ZeroResultActionCenter entries={zeroResultReport} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <TermList title={t("lists.topKeywords")} items={analytics.topKeywords} empty={t("lists.emptyTop")} t={t} />
        <TermList title={t("lists.noResultTerms")} items={analytics.noResultKeywords} empty={t("lists.emptyNoResult")} t={t} />
        <TermList title={t("lists.missingRequests")} items={analytics.missingBookRequests} empty={t("lists.emptyMissing")} t={t} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <MousePointerClick className="h-4 w-4 text-brand" aria-hidden="true" />
            <h2 className="text-[15px] font-bold text-text-heading">{t("clicked.title")}</h2>
          </div>
          {analytics.clickedResults.length === 0 ? (
            <p className="mt-5 rounded-xl bg-paper px-4 py-6 text-center text-[13px] text-text-muted">
              {t("clicked.empty")}
            </p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-divider">
              <table className="w-full text-left text-[13px]">
                <caption className="sr-only">{t("clicked.caption")}</caption>
                <thead>
                  <tr className="border-b border-divider bg-paper text-[11px] font-bold uppercase tracking-wide text-text-muted">
                    <th scope="col" className="px-3 py-2">{t("clicked.colResult")}</th>
                    <th scope="col" className="px-3 py-2">{t("clicked.colType")}</th>
                    <th scope="col" className="px-3 py-2">{t("clicked.colClicks")}</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.clickedResults.map((item) => (
                    <tr key={item.url} className="border-b border-divider/60 last:border-0">
                      <td className="max-w-[340px] px-3 py-2">
                        <a href={item.url} className="line-clamp-1 font-semibold text-text-heading hover:text-brand">
                          {item.term}
                        </a>
                      </td>
                      <td className="px-3 py-2 text-text-muted">{item.type}</td>
                      <td className="px-3 py-2">
                        <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[12px] font-bold text-brand">
                          {item.count}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <TermList title={t("lists.successful")} items={analytics.popularSubjects} empty={t("lists.emptySuccessful")} t={t} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <TrendBars title={t("trends.daily")} points={analytics.trends.daily} t={t} />
        <TrendBars title={t("trends.weekly")} points={analytics.trends.weekly} t={t} />
        <TrendBars title={t("trends.monthly")} points={analytics.trends.monthly} t={t} />
      </div>

      <div className="mt-6 rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-brand" aria-hidden="true" />
          <h2 className="text-[15px] font-bold text-text-heading">{t("language.title")}</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {([
            [t("language.khmer"), analytics.languageUsage.km, kmPct],
            [t("language.english"), analytics.languageUsage.en, enPct],
            [t("language.other"), analytics.languageUsage.other, Math.round((analytics.languageUsage.other / languageTotal) * 100)],
          ] as [string, number, number][]).map(([label, count, pct]) => (
            <div key={label} className="rounded-xl bg-paper p-4">
              <p className="text-[12px] font-bold uppercase tracking-wide text-text-muted">{label}</p>
              <p className="mt-1 text-2xl font-bold text-text-heading">{count}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-divider">
                <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-[11.5px] text-text-muted">{t("language.pctOfSearches", { pct })}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
