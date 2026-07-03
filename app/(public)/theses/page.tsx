import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { getTheses, getThesisCohorts, getThesisAcademicYears } from "@/app/actions/theses";
import ThesisCard from "@/components/ui/theses/ThesisCard";
import ThesisListItem from "@/components/ui/theses/ThesisListItem";
import ThesisSidebar from "@/components/ui/theses/ThesisSidebar";
import SearchBar from "@/components/ui/search/SearchBar";
import Icon from "@/components/ui/core/Icon";
import Pagination from "@/components/ui/core/Pagination";
import { ClientNavWrapper } from "@/components/ui/books/ClientNavWrapper";
import { PAGE_SIZE_OPTIONS, resolvePageSize } from "@/lib/pagination";
import { List, LayoutGrid, Rows3 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PROGRAMS, getFacultiesForProgram } from "@/lib/theses/programs";
import { SITE_URL } from "@/lib/seo/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Theses | PTEC Library",
  description:
    "Browse student theses from the Phnom Penh Teacher Education College (PTEC). Search by program, cohort, academic year, and keywords.",
  alternates: { canonical: `${SITE_URL}/theses` },
  openGraph: {
    title: "Theses | PTEC Library",
    description:
      "Browse student theses from PTEC. Search by program, cohort, and keywords.",
    url: `${SITE_URL}/theses`,
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
  page?: string;
  size?: string;
};

export default async function ThesesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const t = await getTranslations("nav");
  const params = await searchParams;

  const [reportsRes, cohortRes, yearRes] = await Promise.all([
    getTheses({
      program: params.program,
      faculty: params.faculty,
      cohort: params.cohort,
      academicYear: params.year,
      q: params.q,
      publishedOnly: true,
    }),
    getThesisCohorts(),
    getThesisAcademicYears(),
  ]);

  const reports = reportsRes.data || [];
  const total   = reports.length;
  const isGrid  = params.view === "grid";

  // Reports are fetched in full, so paginate the slice in-page.
  const pageSize   = resolvePageSize(params.size);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page       = Math.min(Math.max(1, Number(params.page) || 1), totalPages);
  const pagedReports = reports.slice((page - 1) * pageSize, page * pageSize);

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
    <ClientNavWrapper>
    <div className="min-h-screen bg-bg-body">
      <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-10 md:py-8">
        <div className="flex gap-6 items-start">

          {/* ── LEFT SIDEBAR ─────────────────────────────────────────────── */}
          <ThesisSidebar
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
                  ? `${total} thesis${total === 1 ? "" : "es"}`
                  : "No theses found"}
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
                  href="/theses/summary"
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
                <h2 className="text-lg sm:text-xl font-bold text-text-body">No theses found</h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-text-muted">
                  {params.q
                    ? `We couldn't find anything matching "${params.q}".`
                    : hasFilters
                      ? "No theses match your selected filters."
                      : "No theses are currently available."}
                </p>
                {hasFilters && (
                  <Link
                    href="/theses"
                    className="mt-5 inline-flex h-10 items-center rounded-full bg-brand px-6 text-sm font-semibold text-brand-contrast transition hover:bg-brand-hover"
                  >
                    Clear Filters
                  </Link>
                )}
              </div>
            ) : isGrid ? (
              <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 sm:gap-5">
                {pagedReports.map((report) => (
                  <ThesisCard key={report.id} report={report} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {pagedReports.map((report) => (
                  <ThesisListItem key={report.id} report={report} />
                ))}
              </div>
            )}

            {reports.length > 0 && (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={total}
                pageSize={pageSize}
                searchParams={params as Record<string, string | undefined>}
                basePath="/theses"
                pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
              />
            )}
          </div>

        </div>
      </div>
    </div>
    </ClientNavWrapper>
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
  return `/theses${qs ? `?${qs}` : ""}`;
}

function viewBtn(active: boolean): string {
  return `inline-flex items-center justify-center rounded-md px-2.5 py-1.5 transition-colors ${
    active ? "bg-brand text-brand-contrast" : "text-text-muted hover:text-brand"
  }`;
}
