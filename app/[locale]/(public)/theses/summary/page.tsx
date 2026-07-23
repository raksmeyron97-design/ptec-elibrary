/* eslint-disable @typescript-eslint/no-explicit-any */
import { Link } from "@/i18n/navigation";
import type { Metadata } from "next";
import { after } from "next/server";
import { Eye, Download, ArrowRight, CalendarDays } from "lucide-react";
import { getTheses, getThesisPrograms, getThesisFaculties } from "@/app/actions/theses";
import { createServiceClient } from "@/lib/supabase/server";
import Icon from "@/components/ui/core/Icon";
import { ClientNavWrapper } from "@/components/ui/books/ClientNavWrapper";
import { getTranslations, getLocale } from "next-intl/server";
import { getDoi, getDepartment, getPublicationDate } from "@/lib/theses/report-fields";
import { thesisHref } from "@/lib/theses";
import { SITE_URL } from "@/lib/seo/site";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { buildListingMetadata, parsePageParam } from "@/lib/seo/listing-metadata";
import JsonLd from "@/components/seo/JsonLd";
import Pagination from "@/components/ui/core/Pagination";
import { PAGE_SIZE_OPTIONS, resolvePageSize } from "@/lib/pagination";
import SummaryToolbar from "@/components/ui/theses/SummaryToolbar";
import EmptyState from "@/components/ui/theses/EmptyState";
import ErrorState from "@/components/ui/theses/ErrorState";
import CiteThis from "@/components/ui/theses/CiteThis";
import BookmarkButton from "@/components/ui/detail/BookmarkButton";
import ShareButton from "@/components/ui/books/ShareButton";
import {
  buildSummaryIndex,
  computeSummaryStats,
  departmentLabel,
  distinctCohorts,
  distinctPrograms,
  distinctYears,
  filterReports,
  paginateSummary,
  programLabel,
  regroupEntries,
  resolveSummarySort,
  type SummaryEntry,
} from "@/lib/theses/summary";
import { getOrgIdentity } from "@/lib/system-settings/config";

type SP = {
  q?: string;
  year?: string;
  cohort?: string;
  program?: string;
  pdf?: string;
  sort?: string;
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
    org: await getOrgIdentity(),
    path: "/theses/summary",
    locale,
    title: "Student Theses Summary Index",
    description:
      `Browse student theses from ${(await getOrgIdentity()).institutionName} by academic year, cohort, author, advisor, program, and research topic.`,
    page: parsePageParam(params.page),
    hasFilters: !!(
      params.q ||
      params.year ||
      params.cohort ||
      params.program ||
      params.pdf ||
      params.sort ||
      params.size
    ),
  });
}

/** Best-effort search analytics — mirrors /api/search/native's query log. */
function logSummarySearch(term: string, resultCount: number) {
  after(async () => {
    try {
      const db = createServiceClient();
      const clean = term.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 200);
      if (!clean) return;
      const { error } = await db
        .from("search_queries")
        .insert({ term: clean, result_count: resultCount });
      if (error?.code === "42703" || error?.code === "PGRST204") {
        await db.from("search_queries").insert({ term: clean });
      }
    } catch (err) {
      console.error("[theses-summary] search log failed:", err);
    }
  });
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-divider bg-paper px-4 py-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-lg font-bold text-text-heading sm:text-xl">{value}</dd>
    </div>
  );
}

function SummaryRow({
  entry,
  program,
  department,
  published,
  t,
  institution,
}: {
  entry: SummaryEntry;
  program: string | null;
  department: string | null;
  published: string | null;
  t: Awaited<ReturnType<typeof getTranslations>>;
  /** Published institution name, resolved once by the page. */
  institution: string;
}) {
  const report = entry.report as any;
  const doi = getDoi(report);
  const href = thesisHref(report);

  const metaParts = [
    program,
    department && department !== program ? department : null,
    published,
  ].filter(Boolean) as string[];

  return (
    <li className="pl-2 text-text-body marker:text-base marker:font-bold marker:text-brand">
      <div className="group rounded-xl px-2 py-2 -mx-2 transition-colors hover:bg-paper/60">
        <h4 className="font-khmer-serif text-[15px] font-semibold leading-relaxed sm:text-base">
          <Link
            href={href}
            className="rounded-sm text-text-heading transition-colors hover:text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
          >
            {report.title}
          </Link>
        </h4>

        {report.author_names && (
          <p className="mt-0.5 text-[13px] font-medium text-text-body">
            {t("byAuthor", { authors: report.author_names })}
          </p>
        )}
        {report.advisor_name && (
          <p className="mt-0.5 text-[12.5px] text-text-muted">
            {t("advisor", { name: report.advisor_name })}
          </p>
        )}

        {metaParts.length > 0 && (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-text-muted">
            {metaParts.map((part, i) => (
              <span key={i} className="inline-flex items-center gap-x-2">
                {i > 0 && <span aria-hidden className="text-divider">·</span>}
                {part}
              </span>
            ))}
            {doi && (
              <>
                <span aria-hidden className="text-divider">·</span>
                <a
                  href={doi.startsWith("http") ? doi : `https://doi.org/${doi}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-sm font-mono hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
                >
                  {doi.replace(/^https?:\/\/doi\.org\//, "")}
                </a>
              </>
            )}
          </p>
        )}

        {report.abstract && (
          <p className="mt-1.5 line-clamp-2 max-w-3xl text-[13px] leading-relaxed text-text-muted">
            {report.abstract}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span
            className="inline-flex items-center gap-1.5 text-[12px] text-text-muted"
            title={t("viewsLabel")}
          >
            <Eye aria-hidden className="h-3.5 w-3.5" />
            {report.view_count || 0}
            <span className="sr-only">{t("viewsLabel")}</span>
          </span>
          <span
            className="inline-flex items-center gap-1.5 text-[12px] text-text-muted"
            title={t("downloadsLabel")}
          >
            <Download aria-hidden className="h-3.5 w-3.5" />
            {report.download_count || 0}
            <span className="sr-only">{t("downloadsLabel")}</span>
          </span>

          <div className="ml-auto flex items-center gap-1.5">
            <CiteThis
              report={report}
              reportId={report.slug ?? report.id}
              institution={institution}
              compact
            />
            <BookmarkButton id={report.id} contentType="thesis" className="h-8 w-8" />
            <ShareButton
              url={`${SITE_URL}${href}`}
              title={report.title}
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-divider bg-bg-surface text-text-muted transition-colors hover:border-brand/40 hover:text-brand active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
            />
            {report.file_url && (
              <a
                href={`/api/theses/${report.id}/file?download=1`}
                aria-label={t("downloadPdf")}
                title={t("downloadPdf")}
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-divider bg-bg-surface text-text-muted transition-colors hover:border-brand/40 hover:text-brand active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
              >
                <Download aria-hidden className="h-4 w-4" />
              </a>
            )}
            <Link
              href={href}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-[12px] font-bold text-brand-contrast transition-all hover:bg-brand-hover active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
            >
              {t("view")}
              <ArrowRight aria-hidden className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </li>
  );
}

export default async function ThesesSummaryPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const [tNav, t, locale, params, org] = await Promise.all([
    getTranslations("nav"),
    getTranslations("thesisSummary"),
    getLocale(),
    searchParams,
    getOrgIdentity(),
  ]);

  const [reportsRes, programsRes, facultiesRes] = await Promise.all([
    getTheses({ publishedOnly: true }),
    getThesisPrograms(),
    getThesisFaculties(),
  ]);

  if (reportsRes.error) {
    return (
      <ClientNavWrapper>
        <div className="min-h-screen bg-bg-body">
          <div className="mx-auto max-w-[1100px] px-4 py-8 md:px-10 md:py-12">
            <ErrorState />
          </div>
        </div>
      </ClientNavWrapper>
    );
  }

  const allReports = reportsRes.data ?? [];
  const dbPrograms = programsRes.data ?? [];
  const dbFaculties = facultiesRes.data ?? [];
  const toLabel = (code: string | null | undefined) => programLabel(code, dbPrograms, locale);
  const toDeptLabel = (report: any) =>
    departmentLabel(getDepartment(report), dbFaculties, locale);

  // ── Header stats (whole collection, independent of active filters) ────────
  const stats = computeSummaryStats(allReports);
  const dateFormatter = new Intl.DateTimeFormat(locale === "km" ? "km-KH" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const latestLabel = stats.latest ? dateFormatter.format(new Date(stats.latest)) : "—";

  // ── Filter → sort → group → paginate ──────────────────────────────────────
  const filters = {
    q: params.q?.trim() || undefined,
    year: params.year || undefined,
    cohort: params.cohort || undefined,
    program: params.program || undefined,
    hasPdf: params.pdf === "1",
  };
  const hasFilters = !!(filters.q || filters.year || filters.cohort || filters.program || filters.hasPdf);
  const filtered = filterReports(allReports, filters);

  if (filters.q) logSummarySearch(filters.q, filtered.length);

  const sort = resolveSummarySort(params.sort);
  const flat = buildSummaryIndex(filtered, sort);
  const pageSize = resolvePageSize(params.size);
  const paged = paginateSummary(flat, parsePageParam(params.page), pageSize);
  const groups = regroupEntries(paged.entries);
  const pageOffset = (paged.page - 1) * pageSize;

  // ── Facet options (derived from the whole collection) ─────────────────────
  const years = distinctYears(allReports);
  const cohorts = distinctCohorts(allReports).map((c) => ({
    value: c,
    label: t("groupHeader", { cohort: c }),
  }));
  const programs = distinctPrograms(allReports).map((p) => ({
    value: p,
    label: toLabel(p) ?? p,
  }));

  // ── Structured data ────────────────────────────────────────────────────────
  const crumbs = breadcrumbSchema([
    { name: tNav("home"), path: "/" },
    { name: tNav("theses"), path: "/theses" },
    { name: tNav("summaryIndex") },
  ]);
  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Student Theses Summary Index",
    description:
      `Index of student theses from ${org.institutionName} by academic year, cohort, author, advisor, and program.`,
    url: `${SITE_URL}/theses/summary`,
    isPartOf: { "@type": "WebSite", name: org.siteName, url: SITE_URL },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: paged.total,
      itemListElement: paged.entries.map((entry, i) => ({
        "@type": "ListItem",
        position: pageOffset + i + 1,
        url: `${SITE_URL}${thesisHref(entry.report as any)}`,
        name: (entry.report as any).title,
      })),
    },
  };

  return (
    <ClientNavWrapper>
      <JsonLd data={crumbs} />
      <JsonLd data={collectionSchema} />
      <div className="min-h-screen bg-bg-body">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="border-b border-divider bg-bg-surface px-4 py-6 md:px-12 md:py-8">
          <div className="mx-auto max-w-[1100px]">
            <nav
              aria-label="Breadcrumb"
              className="mb-4 flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-text-muted sm:gap-2 sm:text-[14.5px]"
            >
              <Link href="/" className="rounded-sm transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50">
                {tNav("home")}
              </Link>
              <Icon name="chevron-right" className="text-[16px] text-divider" />
              <Link href="/theses" className="rounded-sm transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50">
                {tNav("theses")}
              </Link>
              <Icon name="chevron-right" className="text-[16px] text-divider" />
              <span aria-current="page" className="text-text-heading">
                {tNav("summaryIndex")}
              </span>
            </nav>

            <h1 className="font-khmer-serif text-2xl font-bold leading-tight text-text-heading md:text-4xl">
              {t("title")}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-text-muted md:text-base">
              {t("description")}
            </p>

            {stats.total > 0 && (
              <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile label={t("statTotal")} value={stats.total.toLocaleString()} />
                <StatTile label={t("statYears")} value={String(stats.yearCount)} />
                <StatTile label={t("statPrograms")} value={String(stats.programCount)} />
                <StatTile label={t("statLatest")} value={latestLabel} />
              </dl>
            )}
          </div>
        </div>

        {/* ── Content ────────────────────────────────────────────────────── */}
        <div className="mx-auto max-w-[1100px] px-4 py-6 md:px-12 md:py-10">
          {allReports.length === 0 ? (
            <EmptyState
              title={t("emptyTitle")}
              message={t("emptyState")}
              showReset={false}
            />
          ) : (
            <div className="space-y-5">
              <SummaryToolbar
                current={{
                  q: params.q ?? "",
                  year: filters.year ?? "",
                  cohort: filters.cohort ?? "",
                  program: filters.program ?? "",
                  sort,
                  pdf: filters.hasPdf,
                }}
                years={years}
                cohorts={cohorts}
                programs={programs}
              />

              {paged.total === 0 ? (
                <EmptyState
                  title={t("emptyTitle")}
                  message={t("noResults")}
                  showReset
                  resetHref="/theses/summary"
                  resetLabel={t("clearFilters")}
                />
              ) : (
                <>
                  <p role="status" className="text-[13px] font-medium text-text-muted">
                    {t("resultCount", { count: paged.total })}
                    {hasFilters ? ` · ${t("filteredNote")}` : ""}
                  </p>

                  <div className="space-y-8">
                    {groups.map((group) => (
                      <section
                        key={group.year ?? "unknown-year"}
                        className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm sm:p-7"
                      >
                        <h2 className="flex items-center gap-2.5 font-khmer-serif text-lg font-bold text-text-heading md:text-xl">
                          <CalendarDays aria-hidden className="h-5 w-5 text-brand" />
                          {group.year
                            ? t("yearHeading", { year: group.year })
                            : t("unknownYear")}
                        </h2>

                        <div className="mt-4 space-y-7">
                          {group.cohorts.map((cohortGroup) => (
                            <div key={cohortGroup.cohort ?? "unknown-cohort"}>
                              <h3 className="mb-3 flex items-center gap-2.5 text-[15px] font-bold text-brand md:text-base">
                                {cohortGroup.cohort
                                  ? t("groupHeader", { cohort: cohortGroup.cohort })
                                  : t("unknownCohort")}
                                <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[11.5px] font-bold text-brand">
                                  {cohortGroup.items.length}
                                </span>
                              </h3>
                              <ol
                                start={cohortGroup.start}
                                className="ml-6 list-outside list-decimal space-y-3"
                              >
                                {cohortGroup.items.map((entry) => {
                                  const published = getPublicationDate(entry.report as any);
                                  const publishedDate = published ? new Date(published) : null;
                                  return (
                                    <SummaryRow
                                      key={(entry.report as any).id}
                                      entry={entry}
                                      institution={org.institutionName}
                                      program={toLabel((entry.report as any).program)}
                                      department={toDeptLabel(entry.report)}
                                      published={
                                        publishedDate && !isNaN(publishedDate.getTime())
                                          ? dateFormatter.format(publishedDate)
                                          : null
                                      }
                                      t={t}
                                    />
                                  );
                                })}
                              </ol>
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>

                  <Pagination
                    currentPage={paged.page}
                    totalPages={paged.totalPages}
                    totalItems={paged.total}
                    pageSize={pageSize}
                    searchParams={params as Record<string, string | undefined>}
                    basePath={locale === "km" ? "/km/theses/summary" : "/theses/summary"}
                    pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </ClientNavWrapper>
  );
}
