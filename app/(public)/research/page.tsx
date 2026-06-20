import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { getResearchReports, getResearchCohorts, getResearchAcademicYears } from "@/app/actions/research";
import ResearchCard from "@/components/ui/research/ResearchCard";
import ResearchListItem from "@/components/ui/research/ResearchListItem";
import { ClientNavWrapper, FilterLink, FilterSelect } from "@/components/ui/books/ClientNavWrapper";
import SearchBar from "@/components/ui/search/SearchBar";
import Icon from "@/components/ui/core/Icon";
import { List, LayoutGrid, Rows3 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PROGRAMS, getFacultiesForProgram } from "@/lib/research/programs";
import { SITE_URL } from "@/lib/seo/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Research Reports",
  description: "Browse student research reports from the Phnom Penh Teacher Education College (PTEC). Search by program, cohort, academic year, and keywords.",
  alternates: {
    canonical: `${SITE_URL}/research`,
  },
  openGraph: {
    title: "Research Reports | PTEC Library",
    description: "Browse student research reports from PTEC. Search by program, cohort, and keywords.",
    url: `${SITE_URL}/research`,
    type: "website",
  },
};

export default async function ResearchReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ cohort?: string; year?: string; q?: string; program?: string; faculty?: string; view?: string }>;
}) {
  const t = await getTranslations("nav");
  const params = await searchParams;

  const [reportsRes, cohortRes, yearRes] = await Promise.all([
    getResearchReports({
      program: params.program,
      faculty: params.faculty,
      cohort: params.cohort,
      academicYear: params.year,
      q: params.q,
      publishedOnly: true,
    }),
    getResearchCohorts(),
    getResearchAcademicYears(),
  ]);

  const reports = reportsRes.data || [];
  const total = reports.length;
  const isGrid = params.view === "grid";

  const allDbCohorts = cohortRes.data ?? [];
  const allDbYears = yearRes.data ?? [];

  // Derive cohort numbers for the pill filter — scoped to selected program if set
  const selectedProgramConfig = PROGRAMS.find((p) => p.code === params.program);
  const visibleCohorts = params.program
    ? allDbCohorts
        .filter((c) => c.program_code === params.program)
        .sort((a, b) => a.sort_order - b.sort_order)
    : allDbCohorts.sort((a, b) => a.sort_order - b.sort_order);

  // Unique academic year labels — scoped to visible cohorts when program is selected
  const visibleCohortIds = new Set(visibleCohorts.map((c) => c.id));
  const uniqueYears = [
    ...new Set(
      allDbYears
        .filter((y) => !params.program || visibleCohortIds.has(y.cohort_id))
        .map((y) => y.label)
        .sort(),
    ),
  ];

  const facultyOptions = getFacultiesForProgram(params.program);
  const hasFilters = !!(params.cohort || params.year || params.q || params.program || params.faculty);

  const programOptions = PROGRAMS.map((p) => ({ value: p.code, label: `${p.nameKm} — ${p.nameEn}` }));
  const categoryPills = ["All", ...new Set(visibleCohorts.map((c) => `Cohort ${c.number}`))];

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

            {/* Program filter pills */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <FilterLink
                href={buildHref(params, { program: undefined, faculty: undefined, cohort: undefined })}
                className={pill(!params.program)}
              >
                All Programs
              </FilterLink>
              {programOptions.map((p) => (
                <FilterLink
                  key={p.value}
                  href={buildHref(params, { program: p.value, faculty: undefined, cohort: undefined })}
                  className={pill(params.program === p.value)}
                >
                  {p.label}
                </FilterLink>
              ))}
            </div>

            {/* Faculty filter — only when a program with faculties is selected */}
            {selectedProgramConfig?.hasFaculty && facultyOptions.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <FilterLink
                  href={buildHref(params, { faculty: undefined })}
                  className={pill(!params.faculty)}
                >
                  All Faculties
                </FilterLink>
                {facultyOptions.map((f) => (
                  <FilterLink
                    key={f.code}
                    href={buildHref(params, { faculty: f.code })}
                    className={pill(params.faculty === f.code)}
                  >
                    {f.nameKm} — {f.nameEn}
                  </FilterLink>
                ))}
              </div>
            )}

            {/* Cohort pills — sourced from DB, scoped to selected program */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none min-w-0 w-full">
              {categoryPills.map((cat) => {
                const isAll = cat === "All";
                const cohortValue = isAll ? undefined : cat.replace("Cohort ", "");
                const isActive = isAll ? !params.cohort : params.cohort === cohortValue;
                return (
                  <FilterLink
                    key={cat}
                    href={buildHref(params, { cohort: cohortValue })}
                    className={pill(isActive)}
                  >
                    {cat}
                  </FilterLink>
                );
              })}
            </div>

            {/* Sort & Filters row */}
            <div className="flex items-center justify-between gap-2 flex-wrap mt-2">
              <div className="flex items-center gap-2 flex-wrap">
                <FilterSelect
                  value={params.year || ""}
                  options={uniqueYears}
                  defaultLabel="Academic Year"
                  paramKey="year"
                />
              </div>

              <div className="flex items-center gap-2">
                {/* View toggle */}
                <div className="flex items-center rounded-lg border border-divider bg-paper p-0.5">
                  <FilterLink
                    href={buildHref(params, { view: undefined })}
                    className={viewBtn(!isGrid)}
                    aria-label="List view"
                  >
                    <Rows3 className="h-4 w-4" />
                  </FilterLink>
                  <FilterLink
                    href={buildHref(params, { view: "grid" })}
                    className={viewBtn(isGrid)}
                    aria-label="Grid view"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </FilterLink>
                </div>

                <Link
                  href="/research/summary"
                  className="inline-flex items-center gap-2 rounded-lg bg-paper border border-divider px-4 py-2 text-[13px] font-semibold text-text-body transition-colors hover:bg-brand/5 hover:text-brand hover:border-brand/30"
                >
                  <List className="w-4 h-4" />
                  {t("summaryIndex")}
                </Link>
              </div>
            </div>

            {/* Result count */}
            <p className="mt-3 text-[12px] text-text-muted sm:text-[13px]">
              {total > 0
                ? `${total} report${total === 1 ? "" : "s"}`
                : "No reports found"}
              {params.q && <> for &ldquo;{params.q}&rdquo;</>}
            </p>
          </div>
        </div>

        {/* ── Results ── */}
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
          ) : isGrid ? (
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-5">
              {reports.map((report) => (
                <ResearchCard key={report.id} report={report} />
              ))}
            </div>
          ) : (
            <div className="mx-auto flex max-w-[980px] flex-col gap-4">
              {reports.map((report) => (
                <ResearchListItem key={report.id} report={report} />
              ))}
            </div>
          )}
        </div>
      </div>
    </ClientNavWrapper>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type Params = { cohort?: string; year?: string; q?: string; program?: string; faculty?: string; view?: string };

function buildHref(current: Params, overrides: Partial<Params>): string {
  const merged = { ...current, ...overrides };
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v) p.set(k, v);
  }
  const qs = p.toString();
  return `/research${qs ? `?${qs}` : ""}`;
}

function pill(active: boolean): string {
  return `shrink-0 rounded-full px-3.5 py-[6px] text-[12px] font-medium whitespace-nowrap transition-all border sm:px-4 sm:text-[13px] ${
    active
      ? "bg-brand text-brand-contrast border-brand shadow-sm shadow-brand/20"
      : "bg-paper text-text-muted border-divider hover:bg-brand/5 hover:text-brand hover:border-brand/30"
  }`;
}

function viewBtn(active: boolean): string {
  return `inline-flex items-center justify-center rounded-md px-2.5 py-1.5 transition-colors ${
    active ? "bg-brand text-brand-contrast" : "text-text-muted hover:text-brand"
  }`;
}