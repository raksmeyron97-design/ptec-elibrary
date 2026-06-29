import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { getResearchReports, getResearchCohorts, getResearchAcademicYears } from "@/app/actions/research";
import ResearchCard from "@/components/ui/research/ResearchCard";
import ResearchListItem from "@/components/ui/research/ResearchListItem";
import ResearchSidebar from "@/components/ui/research/ResearchSidebar";
import SearchBar from "@/components/ui/search/SearchBar";
import Icon from "@/components/ui/core/Icon";
import { List, LayoutGrid, Rows3 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PROGRAMS, getFacultiesForProgram } from "@/lib/research/programs";
import { SITE_URL } from "@/lib/seo/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Research Reports",
  description:
    "Browse student research reports from the Phnom Penh Teacher Education College (PTEC). Search by program, cohort, academic year, and keywords.",
  alternates: { canonical: `${SITE_URL}/research` },
  openGraph: {
    title: "Research Reports | PTEC Library",
    description:
      "Browse student research reports from PTEC. Search by program, cohort, and keywords.",
    url: `${SITE_URL}/research`,
    type: "website",
  },
};

type SP = {
  cohort?: string;
  year?: string;
  q?: string;
  program?: string;
  faculty?: string;
  view?: string;
};

export default async function ResearchReportsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
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
  const total   = reports.length;
  const isGrid  = params.view === "grid";

  const allDbCohorts = cohortRes.data ?? [];
  const allDbYears   = yearRes.data   ?? [];

  // Cohorts scoped to selected program
  const visibleCohorts = params.program
    ? allDbCohorts
        .filter((c) => c.program_code === params.program)
        .sort((a, b) => a.sort_order - b.sort_order)
    : allDbCohorts.sort((a, b) => a.sort_order - b.sort_order);

  // Academic years scoped to visible cohorts
  const visibleCohortIds = new Set(visibleCohorts.map((c) => c.id));
  const uniqueYears = [
    ...new Set(
      allDbYears
        .filter((y) => !params.program || visibleCohortIds.has(y.cohort_id))
        .map((y) => y.label)
        .sort(),
    ),
  ];

  const hasFilters = !!(params.cohort || params.year || params.q || params.program || params.faculty);

  return (
    <div className="min-h-screen bg-bg-body">
      <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-10 md:py-8">
        <div className="flex gap-6 items-start">

          {/* ── LEFT SIDEBAR ─────────────────────────────────────────────── */}
          <ResearchSidebar
            currentProgram={params.program ?? ""}
            currentFaculty={params.faculty ?? ""}
            currentCohort={params.cohort ?? ""}
            currentYear={params.year ?? ""}
            currentQ={params.q ?? ""}
            currentView={params.view ?? ""}
            visibleCohorts={visibleCohorts}
            availableYears={uniqueYears}
          />

          {/* ── MAIN CONTENT ─────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Search bar */}
            <Suspense fallback={<div className="h-13 rounded-2xl bg-paper animate-pulse" />}>
              <SearchBar />
            </Suspense>

            {/* Controls row */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              {/* Result count */}
              <p className="text-[13px] text-text-muted">
                {total > 0
                  ? `${total} report${total === 1 ? "" : "s"}`
                  : "No reports found"}
                {params.q && (
                  <> for &ldquo;{params.q}&rdquo;</>
                )}
              </p>

              <div className="flex items-center gap-2">
                {/* View toggle */}
                <div className="flex items-center rounded-lg border border-divider bg-paper p-0.5">
                  <Link
                    href={buildHref(params, { view: undefined })}
                    className={viewBtn(!isGrid)}
                    aria-label="List view"
                  >
                    <Rows3 className="h-4 w-4" />
                  </Link>
                  <Link
                    href={buildHref(params, { view: "grid" })}
                    className={viewBtn(isGrid)}
                    aria-label="Grid view"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Link>
                </div>

                {/* Summary Index */}
                <Link
                  href="/research/summary"
                  className="inline-flex items-center gap-2 rounded-lg bg-paper border border-divider px-4 py-2 text-[13px] font-semibold text-text-body transition-colors hover:bg-brand/5 hover:text-brand hover:border-brand/30"
                >
                  <List className="w-4 h-4" />
                  {t("summaryIndex")}
                </Link>
              </div>
            </div>

            {/* Results */}
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
                  <Link
                    href="/research"
                    className="mt-5 inline-flex h-10 items-center rounded-full bg-brand px-6 text-sm font-semibold text-brand-contrast transition hover:bg-brand-hover"
                  >
                    Clear Filters
                  </Link>
                )}
              </div>
            ) : isGrid ? (
              <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 sm:gap-5">
                {reports.map((report) => (
                  <ResearchCard key={report.id} report={report} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {reports.map((report) => (
                  <ResearchListItem key={report.id} report={report} />
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type Params = SP;

function buildHref(current: Params, overrides: Partial<Params>): string {
  const merged = { ...current, ...overrides };
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v) p.set(k, v);
  }
  const qs = p.toString();
  return `/research${qs ? `?${qs}` : ""}`;
}

function viewBtn(active: boolean): string {
  return `inline-flex items-center justify-center rounded-md px-2.5 py-1.5 transition-colors ${
    active ? "bg-brand text-brand-contrast" : "text-text-muted hover:text-brand"
  }`;
}
