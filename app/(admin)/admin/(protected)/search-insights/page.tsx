import {
  Activity,
  BarChart3,
  Languages,
  MousePointerClick,
  Search,
  SearchX,
} from "lucide-react";
import type { ReactNode } from "react";
import { getSearchAnalytics } from "@/app/actions/search-insights";

export const dynamic = "force-dynamic";

function timeAgo(iso?: string): string {
  if (!iso) return "recently";
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
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
}: {
  title: string;
  items: { term: string; count: number; lastSearchedAt?: string }[];
  empty: string;
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
                  <p className="text-[11.5px] text-text-muted">{timeAgo(item.lastSearchedAt)}</p>
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

function TrendBars({ title, points }: { title: string; points: { label: string; count: number; noResults: number }[] }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <section className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm">
      <h2 className="text-[15px] font-bold text-text-heading">{title}</h2>
      <div className="mt-4 flex h-32 items-end gap-2">
        {points.map((point) => {
          const height = Math.max(6, Math.round((point.count / max) * 100));
          return (
            <div key={point.label} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t-md bg-brand"
                style={{ height: `${height}%`, opacity: point.count ? 0.95 : 0.18 }}
                title={`${point.label}: ${point.count} searches, ${point.noResults} no-result`}
              />
              <span className="max-w-full truncate text-[10px] text-text-muted">{point.count}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default async function SearchInsightsPage() {
  const analytics = await getSearchAnalytics();
  const languageTotal = analytics.languageUsage.km + analytics.languageUsage.en + analytics.languageUsage.other || 1;
  const kmPct = Math.round((analytics.languageUsage.km / languageTotal) * 100);
  const enPct = Math.round((analytics.languageUsage.en / languageTotal) * 100);

  return (
    <div className="p-6 md:p-10">
      <div className="mb-7">
        <div className="flex items-center gap-2.5">
          <Search className="h-6 w-6 text-brand" />
          <h1 className="text-[22px] font-bold text-text-heading">Search Analytics</h1>
        </div>
        <p className="mt-1 max-w-[72ch] text-[13px] text-text-muted">
          Search behavior from the last 30 days: what people look for, where search fails,
          which results earn clicks, and how Khmer and English usage compares.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total searches"
          value={analytics.totalSearches}
          hint="All logged global-search queries"
          icon={<BarChart3 className="h-5 w-5" />}
        />
        <MetricCard
          label="No results"
          value={analytics.totalNoResultSearches}
          hint="Useful acquisition signals"
          icon={<SearchX className="h-5 w-5" />}
        />
        <MetricCard
          label="Conversion"
          value={`${analytics.conversionRate}%`}
          hint="Result clicks per search"
          icon={<MousePointerClick className="h-5 w-5" />}
        />
        <MetricCard
          label="Language split"
          value={`${kmPct}% / ${enPct}%`}
          hint="Khmer / English search usage"
          icon={<Languages className="h-5 w-5" />}
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <TermList
          title="Top searched keywords"
          items={analytics.topKeywords}
          empty="No search activity recorded yet."
        />
        <TermList
          title="Searches with no results"
          items={analytics.noResultKeywords}
          empty="No zero-result searches recorded."
        />
        <TermList
          title="Missing book requests"
          items={analytics.missingBookRequests}
          empty="No failed searches to review yet."
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <MousePointerClick className="h-4 w-4 text-brand" />
            <h2 className="text-[15px] font-bold text-text-heading">Most clicked results</h2>
          </div>
          {analytics.clickedResults.length === 0 ? (
            <p className="mt-5 rounded-xl bg-paper px-4 py-6 text-center text-[13px] text-text-muted">
              No clicked search results recorded yet. New clicks appear after migration 0080 is applied.
            </p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-divider">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-divider bg-paper text-[11px] font-bold uppercase tracking-wide text-text-muted">
                    <th className="px-3 py-2">Result</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Clicks</th>
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

        <TermList
          title="Popular subjects"
          items={analytics.popularSubjects}
          empty="No subject-like searches recorded yet."
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <TrendBars title="Daily trend" points={analytics.trends.daily} />
        <TrendBars title="Weekly trend" points={analytics.trends.weekly} />
        <TrendBars title="Monthly trend" points={analytics.trends.monthly} />
      </div>

      <div className="mt-6 rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-brand" />
          <h2 className="text-[15px] font-bold text-text-heading">Khmer vs English usage</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Khmer", analytics.languageUsage.km, kmPct],
            ["English", analytics.languageUsage.en, enPct],
            ["Other", analytics.languageUsage.other, Math.round((analytics.languageUsage.other / languageTotal) * 100)],
          ].map(([label, count, pct]) => (
            <div key={label} className="rounded-xl bg-paper p-4">
              <p className="text-[12px] font-bold uppercase tracking-wide text-text-muted">{label}</p>
              <p className="mt-1 text-2xl font-bold text-text-heading">{count}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-divider">
                <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-[11.5px] text-text-muted">{pct}% of searches</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
