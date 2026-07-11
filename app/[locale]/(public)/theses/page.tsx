import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import {
  getTheses,
  getThesisCohorts,
  getThesisAcademicYears,
  getThesisPrograms,
  getThesisFaculties,
} from "@/app/actions/theses";
import ThesisCard from "@/components/ui/theses/ThesisCard";
import ThesisListItem from "@/components/ui/theses/ThesisListItem";
import ThesisSidebar from "@/components/ui/theses/ThesisSidebar";
import HeroSearch from "@/components/ui/theses/HeroSearch";
import ResultToolbar from "@/components/ui/theses/ResultToolbar";
import EmptyState from "@/components/ui/theses/EmptyState";
import ErrorState from "@/components/ui/theses/ErrorState";
import { ClientNavWrapper } from "@/components/ui/books/ClientNavWrapper";
import { PAGE_SIZE_OPTIONS, resolvePageSize } from "@/lib/pagination";
import Pagination from "@/components/ui/core/Pagination";
import { getTranslations } from "next-intl/server";
import { getKeywords } from "@/lib/theses/report-fields";
import { buildListingMetadata, parsePageParam } from "@/lib/seo/listing-metadata";
import JsonLd from "@/components/seo/JsonLd";
import { SITE_URL } from "@/lib/seo/site";
import { thesisHref } from "@/lib/theses";

export const dynamic = "force-dynamic";

type SP = {
  cohort?: string;
  year?: string;
  q?: string;
  program?: string;
  faculty?: string;
  author?: string;
  advisor?: string;
  keyword?: string;
  sort?: string;
  view?: string;
  page?: string;
  size?: string;
};

export async function generateMetadata({
  searchParams,
  params: routeParams,
}: {
  searchParams: Promise<SP>;
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const { locale } = await routeParams;
  return buildListingMetadata({
    path: "/theses",
    locale,
    title: "Theses",
    description:
      "Browse student theses from the Phnom Penh Teacher Education College (PTEC). Search by program, cohort, academic year, author, advisor, and keywords.",
    page: parsePageParam(params.page),
    hasFilters: !!(
      params.q ||
      params.cohort ||
      params.year ||
      params.program ||
      params.faculty ||
      params.author ||
      params.advisor ||
      params.keyword ||
      params.sort ||
      params.view ||
      params.size
    ),
  });
}

// ── Facet helpers ──────────────────────────────────────────────────────────────

type Report = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function countBy(items: Report[], keyFn: (item: Report) => string | null | undefined): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function toFacetOptions(counts: Record<string, number>): { value: string; label: string; count: number }[] {
  return Object.entries(counts)
    .map(([value, count]) => ({ value, label: value, count }))
    // Never offer a filter that is guaranteed to return nothing.
    .filter((opt) => opt.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

const SORTERS: Record<string, (a: Report, b: Report) => number> = {
  oldest: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  views: (a, b) => (b.view_count || 0) - (a.view_count || 0),
  downloads: (a, b) => (b.download_count || 0) - (a.download_count || 0),
  newest: (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
};

export default async function ThesesPage({
  searchParams,
  params: routeParams,
}: {
  searchParams: Promise<SP>;
  params: Promise<{ locale: string }>;
}) {
  const t = await getTranslations("nav");
  const tTheses = await getTranslations("theses");
  const params = await searchParams;
  const { locale } = await routeParams;
  const basePath = locale === "km" ? "/km/theses" : "/theses";

  const [reportsRes, cohortRes, yearRes, programsRes, facultiesRes] = await Promise.all([
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
    getThesisPrograms(),
    getThesisFaculties(),
  ]);

  // One code → localized-name lookup for every card (the cards used to fetch
  // programs each, an N+1 on the grid view). Faculty labels likewise — the
  // cards' getDepartment() otherwise falls back to the raw code ("primary").
  const programNames = new Map(
    (programsRes.data ?? []).map((p) => [
      p.code,
      (locale === "km" && p.name_km) || p.name_en,
    ]),
  );
  const facultyNames = new Map(
    (facultiesRes.data ?? []).map((f) => [
      f.code,
      (locale === "km" && f.name_km) || f.name_en,
    ]),
  );

  // A real fetch failure (e.g. the database is unreachable) is distinct from a
  // successful query that simply returned zero rows — show it separately so
  // an outage doesn't masquerade as "no theses found".
  if (reportsRes.error) {
    return (
      <div className="min-h-screen bg-bg-body">
        <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-10 md:py-8">
          <ErrorState />
        </div>
      </div>
    );
  }

  // Full set matching the server-side filters (program/faculty/cohort/year/q).
  // Facet counts and quick chips are derived from this before the finer-grained
  // author/advisor/keyword/sort narrowing below — see the sidebar's per-facet counts.
  const baseReports = reportsRes.data || [];

  const allDbCohorts = cohortRes.data ?? [];
  const allDbYears = yearRes.data ?? [];

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

  // ── Facets (computed from the currently server-filtered set) ────────────────
  const programCounts = countBy(baseReports, (r) => r.program);
  const facultyCounts = countBy(baseReports, (r) => r.faculty);
  const cohortCounts = countBy(baseReports, (r) => (r.cohort ? String(r.cohort) : null));
  const yearCounts = countBy(baseReports, (r) => r.academic_year);
  const authors = toFacetOptions(countBy(baseReports, (r) => r.author_names));
  const advisors = toFacetOptions(countBy(baseReports, (r) => r.advisor_name));
  const keywordCounts: Record<string, number> = {};
  for (const r of baseReports) {
    for (const kw of getKeywords(r)) {
      keywordCounts[kw] = (keywordCounts[kw] ?? 0) + 1;
    }
  }
  const keywords = toFacetOptions(keywordCounts);
  const cohortFacetOptions = toFacetOptions(cohortCounts).map((o) => ({
    ...o,
    label: `Cohort ${o.value}`,
  }));
  const quickChips = keywords.slice(0, 5).map((k) => ({ label: k.label, value: k.value }));

  // ── Narrow further by author / advisor / keyword (in-memory — the full set
  // is already loaded for pagination, so no extra query is needed) ────────────
  let narrowed = baseReports;
  if (params.author) narrowed = narrowed.filter((r) => r.author_names === params.author);
  if (params.advisor) narrowed = narrowed.filter((r) => r.advisor_name === params.advisor);
  if (params.keyword) narrowed = narrowed.filter((r) => getKeywords(r).includes(params.keyword!));

  // ── Sort ──────────────────────────────────────────────────────────────────
  const sort = params.sort && SORTERS[params.sort] ? params.sort : "newest";
  const sorted = [...narrowed].sort(SORTERS[sort]);

  const total = sorted.length;
  const isGrid = params.view === "grid";

  // Reports are fetched in full, so paginate the slice in-page.
  const pageSize = resolvePageSize(params.size);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Number(params.page) || 1), totalPages);
  const pagedReports = sorted.slice((page - 1) * pageSize, page * pageSize);

  const hasFilters = !!(
    params.cohort ||
    params.year ||
    params.q ||
    params.program ||
    params.faculty ||
    params.author ||
    params.advisor ||
    params.keyword
  );

  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Theses — PTEC Digital Library",
    description:
      "Student theses and research reports from Phnom Penh Teacher Education College.",
    url: `${SITE_URL}/theses`,
    isAccessibleForFree: true,
    inLanguage: ["km", "en"],
    hasPart: pagedReports.slice(0, 10).map((r) => ({
      "@type": "ScholarlyArticle",
      headline: r.title,
      url: `${SITE_URL}${thesisHref(r)}`,
      isAccessibleForFree: true,
    })),
  };

  return (
    <ClientNavWrapper>
      <JsonLd data={collectionSchema} />
      <div className="min-h-screen bg-bg-body">
        <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-10 md:py-8 space-y-6">
          {/* ── HERO SEARCH ─────────────────────────────────────────────── */}
          <HeroSearch
            totalCount={baseReports.length}
            quickChips={quickChips}
            currentQ={params.q ?? ""}
            currentProgram={params.program ?? ""}
            currentFaculty={params.faculty ?? ""}
            currentCohort={params.cohort ?? ""}
            currentYear={params.year ?? ""}
            currentAuthor={params.author ?? ""}
            currentAdvisor={params.advisor ?? ""}
            currentKeyword={params.keyword ?? ""}
            cohorts={cohortFacetOptions}
            years={uniqueYears}
            authors={authors}
            advisors={advisors}
            keywords={keywords}
          />

          <div className="flex gap-6 items-start">
            {/* ── LEFT SIDEBAR ─────────────────────────────────────────── */}
            <ThesisSidebar
              currentProgram={params.program ?? ""}
              currentFaculty={params.faculty ?? ""}
              currentCohort={params.cohort ?? ""}
              currentYear={params.year ?? ""}
              currentQ={params.q ?? ""}
              currentView={params.view ?? ""}
              currentAuthor={params.author ?? ""}
              currentAdvisor={params.advisor ?? ""}
              currentKeyword={params.keyword ?? ""}
              visibleCohorts={visibleCohorts}
              availableYears={uniqueYears}
              programCounts={programCounts}
              facultyCounts={facultyCounts}
              cohortCounts={cohortCounts}
              yearCounts={yearCounts}
              authors={authors}
              advisors={advisors}
              keywords={keywords}
            />

            {/* ── MAIN CONTENT ─────────────────────────────────────────── */}
            <div className="flex-1 min-w-0 space-y-4">
              <ResultToolbar
                total={total}
                query={params.q}
                params={params as Record<string, string | undefined>}
                isGrid={isGrid}
                sort={sort}
                pageSize={pageSize}
                pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
                hasFilters={hasFilters}
                summaryLabel={t("summaryIndex")}
                basePath={basePath}
              />

              {/* Results */}
              {total === 0 ? (
                <EmptyState
                  message={
                    params.q
                      ? `We couldn't find anything matching "${params.q}".`
                      : hasFilters
                        ? "No theses match your selected filters."
                        : "No theses are currently available."
                  }
                  showReset={hasFilters}
                />
              ) : isGrid ? (
                <>
                  {/* Card titles are h3s; keep the document outline h1 → h2 → h3 */}
                  <h2 className="sr-only">{tTheses("resultsHeading")}</h2>
                  <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 sm:gap-5">
                    {pagedReports.map((report) => (
                      <ThesisCard
                        key={report.id}
                        report={report}
                        programLabel={programNames.get(report.program) ?? null}
                        facultyLabel={facultyNames.get(report.faculty) ?? null}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <h2 className="sr-only">{tTheses("resultsHeading")}</h2>
                  <div className="flex flex-col gap-4">
                    {pagedReports.map((report) => (
                      <ThesisListItem
                        key={report.id}
                        report={report}
                        programLabel={programNames.get(report.program) ?? null}
                        facultyLabel={facultyNames.get(report.faculty) ?? null}
                      />
                    ))}
                  </div>
                </>
              )}

              {total > 0 && (
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  totalItems={total}
                  pageSize={pageSize}
                  searchParams={params as Record<string, string | undefined>}
                  basePath={basePath}
                />
              )}

              {total > 0 && total < 5 && !hasFilters && !params.q && (
                <div className="rounded-xl border border-dashed border-divider bg-bg-surface px-4 py-4 text-center">
                  <p className="text-[13.5px] font-semibold text-text-heading">
                    {tTheses("growingTitle")}
                  </p>
                  <p className="mt-1 text-[13px] text-text-muted">{tTheses("growingNote")}</p>
                  <Link
                    href="/contact"
                    className="mt-3 inline-flex items-center rounded-full border border-brand/20 bg-brand/5 px-4 py-1.5 text-[12.5px] font-semibold text-brand transition-colors hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
                  >
                    {tTheses("growingCta")}
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ClientNavWrapper>
  );
}
