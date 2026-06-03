import { Suspense } from "react";
import Link from "next/link";
import { getResearchReports } from "@/app/actions/research";
import ResearchCard from "@/components/ui/research/ResearchCard";
import { ClientNavWrapper, FilterLink, FilterSelect, SortSelect } from "@/components/ui/books/ClientNavWrapper";
import SearchBar from "@/components/ui/search/SearchBar";
import Icon from "@/components/ui/core/Icon";
import { List } from "lucide-react";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function ResearchReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ cohort?: string; year?: string; q?: string }>;
}) {
  const t = await getTranslations("nav");
  const params = await searchParams;
  
  const [reportsRes] = await Promise.all([
    getResearchReports({
      cohort: params.cohort,
      academicYear: params.year,
      q: params.q,
      publishedOnly: true
    })
  ]);

  const reports = reportsRes.data || [];
  const total = reports.length;
  
  const uniqueCohorts = ["1", "2", "3", "4", "5", "6"];
  const uniqueYears = ["2020-2021", "2021-2022", "2022-2023", "2023-2024", "2024-2025"];

  const hasFilters = !!(params.cohort || params.year || params.q);
  const categoryPills = ["All", ...uniqueCohorts.map(c => `Cohort ${c}`)];

  return (
    <ClientNavWrapper>
      <div className="min-h-screen bg-bg-body">
        {/* ── Header ── */}
        <div className="border-b border-divider bg-bg-surface px-4 py-4 md:px-12 md:py-7">
          <div className="mx-auto max-w-[1400px]">
            {/* Search bar */}
            <div className="mb-5">
              <Suspense fallback={<div className="h-11 rounded-xl bg-paper" />}>
                <SearchBar />
              </Suspense>
            </div>

            {/* Filters row */}
            <div className="flex flex-col gap-2 min-w-0 w-full">
              {/* Category pills — horizontal scroll */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none min-w-0 w-full">
                {categoryPills.map((cat) => {
                  const isAll = cat === "All";
                  const cohortValue = isAll ? undefined : cat.replace("Cohort ", "");
                  const isActive = isAll ? !params.cohort : params.cohort === cohortValue;
                  
                  const merged = { ...params, cohort: cohortValue };
                  const p = new URLSearchParams();
                  Object.entries(merged).forEach(([k, v]) => {
                    if (v) p.set(k, v);
                  });
                  const qs = p.toString();
                  const href = `/research${qs ? `?${qs}` : ""}`;

                  return (
                    <FilterLink
                      key={cat}
                      href={href}
                      className={`shrink-0 rounded-full px-3.5 py-[6px] text-[12px] font-medium whitespace-nowrap transition-all border sm:px-4 sm:text-[13px] ${
                        isActive
                          ? "bg-brand text-brand-contrast border-brand shadow-sm shadow-brand/20"
                          : "bg-paper text-text-muted border-divider hover:bg-brand/5 hover:text-brand hover:border-brand/30"
                      }`}
                    >
                      {cat}
                    </FilterLink>
                  );
                })}
              </div>

              {/* Sort & Filters */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <FilterSelect
                    value={params.year || ""}
                    options={uniqueYears}
                    defaultLabel="Academic Year"
                    paramKey="year"
                  />
                </div>
                
                <Link 
                  href="/research/summary" 
                  className="inline-flex items-center gap-2 rounded-lg bg-paper border border-divider px-4 py-2 text-[13px] font-semibold text-text-body transition-colors hover:bg-brand/5 hover:text-brand hover:border-brand/30"
                >
                  <List className="w-4 h-4" />
                  {t('summaryIndex')}
                </Link>
              </div>
            </div>

            {/* Result count */}
            <p className="mt-3 text-[12px] text-text-muted sm:text-[13px]">
              {total > 0
                ? `${total} report${total === 1 ? '' : 's'}`
                : "No reports found"}
              {params.q && (
                <>
                  {" "}
                  for &ldquo;{params.q}&rdquo;
                </>
              )}
            </p>
          </div>
        </div>

        {/* ── Grid ── */}
        <div className="mx-auto max-w-[1400px] px-4 py-5 md:px-12 md:py-8">
          {reports.length === 0 ? (
            <div className="flex min-h-[280px] sm:min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-divider bg-bg-surface p-6 sm:p-10 text-center">
              <Icon name="search-off" className="mb-3 text-4xl sm:text-5xl text-text-muted" />
              <h2 className="text-lg sm:text-xl font-bold text-text-body">No reports found</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-text-muted">
                {params.q
                  ? `We couldn't find anything matching "${params.q}".`
                  : hasFilters
                    ? "No reports match your selected filters."
                    : "No reports are currently available."}
              </p>
              {hasFilters && (
                <FilterLink
                  href="/research"
                  className="mt-5 inline-flex h-10 items-center rounded-full bg-brand px-6 text-sm font-semibold text-brand-contrast transition hover:bg-brand-hover"
                >
                  Clear Filters
                </FilterLink>
              )}
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-5">
              {reports.map((report) => (
                <ResearchCard key={report.id} report={report} />
              ))}
            </div>
          )}
        </div>
      </div>
    </ClientNavWrapper>
  );
}
