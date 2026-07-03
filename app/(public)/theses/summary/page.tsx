import Link from "next/link";
import type { Metadata } from "next";
import { getTheses } from "@/app/actions/theses";
import Icon from "@/components/ui/core/Icon";
import { ClientNavWrapper } from "@/components/ui/books/ClientNavWrapper";
import { getTranslations } from "next-intl/server";
import { getDoi, getDepartment } from "@/lib/theses/report-fields";
import { SITE_URL } from "@/lib/seo/site";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Theses Summary",
  description: "Complete index of all PTEC student theses, organised by academic year and cohort.",
  alternates: { canonical: `${SITE_URL}/theses/summary` },
  openGraph: {
    title: "Theses Summary | PTEC Library",
    description: "Browse all PTEC theses by academic year and student cohort.",
    url: `${SITE_URL}/theses/summary`,
    type: "website",
  },
};

export default async function ThesesSummaryPage() {
  const tNav = await getTranslations("nav");
  const t = await getTranslations("thesisSummary");

  // Fetch all published theses
  const { data: reports } = await getTheses({ publishedOnly: true });

  // Group theses by academic year and then by cohort
  const groupedReports: Record<string, Record<string, typeof reports>> = {};

  (reports || []).forEach((report) => {
    const year = report.academic_year || "Unknown Year";
    const cohort = report.cohort || "Unknown Cohort";

    if (!groupedReports[year]) groupedReports[year] = {};
    if (!groupedReports[year][cohort]) groupedReports[year][cohort] = [];
    groupedReports[year][cohort].push(report);
  });

  // Sort years descending
  const sortedYears = Object.keys(groupedReports).sort((a, b) => b.localeCompare(a));
  const totalReports = reports?.length ?? 0;

  return (
    <ClientNavWrapper>
      <div className="min-h-screen bg-bg-body">
        {/* Header */}
        <div className="border-b border-divider bg-bg-surface px-4 py-6 md:px-12 md:py-8">
          <div className="mx-auto max-w-[1000px]">
            <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 sm:gap-2 text-[13px] sm:text-[14.5px] font-medium text-text-muted">
              <Link href="/" className="hover:text-brand transition-colors">{tNav("home")}</Link>
              <Icon name="chevron-right" className="text-[16px] text-divider" />
              <Link href="/theses" className="hover:text-brand transition-colors">{tNav("theses")}</Link>
              <Icon name="chevron-right" className="text-[16px] text-divider" />
              <span className="text-text-heading">{tNav("summaryIndex")}</span>
            </nav>
            <h1 className="text-2xl md:text-4xl font-bold font-khmer-serif text-text-heading leading-tight">
              {t("title")}
            </h1>
            <p className="mt-2 text-text-muted text-sm md:text-base">
              {t("description")}
            </p>
            {totalReports > 0 && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-divider bg-paper px-3 py-1 text-[12.5px] font-medium text-text-muted">
                {totalReports} thesis{totalReports === 1 ? "" : "es"} · {sortedYears.length} academic year{sortedYears.length === 1 ? "" : "s"}
              </p>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="mx-auto max-w-[1000px] px-4 py-8 md:px-12 md:py-12">
          {sortedYears.length === 0 ? (
            <div className="text-center py-12 text-text-muted">
              {t("emptyState")}
            </div>
          ) : (
            <div className="space-y-12">
              {sortedYears.map((year) => {
                const cohorts = groupedReports[year];
                const sortedCohorts = Object.keys(cohorts).sort((a, b) => a.localeCompare(b));

                return (
                  <div key={year} className="bg-bg-surface border border-divider rounded-2xl p-6 sm:p-8 shadow-sm">
                    {sortedCohorts.map((cohort) => {
                      const items = cohorts[cohort] || [];
                      return (
                        <div key={cohort} className="mb-8 last:mb-0">
                          <h2 className="mb-6 flex items-center gap-3 font-khmer-serif text-xl md:text-2xl font-bold text-brand">
                            {t("groupHeader", { cohort, year })}
                            <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[12px] font-bold text-brand">
                              {items.length}
                            </span>
                          </h2>
                          <ol className="ml-6 list-outside list-decimal space-y-4">
                            {items.map((report) => {
                              const doi = getDoi(report);
                              const dept = getDepartment(report);
                              return (
                                <li
                                  key={report.id}
                                  className="pl-2 text-text-body marker:text-lg marker:font-bold marker:text-brand"
                                >
                                  <Link
                                    href={`/theses/${report.id}`}
                                    className="text-[15px] font-medium leading-relaxed transition-colors hover:text-brand hover:underline sm:text-base"
                                  >
                                    {report.title}
                                  </Link>
                                  {report.author_names && (
                                    <p className="mt-0.5 text-[13px] text-text-muted">
                                      {t("byAuthor", { authors: report.author_names })}
                                    </p>
                                  )}
                                  {(dept || doi) && (
                                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-text-muted">
                                      {dept && <span>{dept}</span>}
                                      {dept && doi && <span className="text-divider">·</span>}
                                      {doi && (
                                        <a
                                          href={doi.startsWith("http") ? doi : `https://doi.org/${doi}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="font-mono hover:text-brand"
                                        >
                                          {doi.replace(/^https?:\/\/doi\.org\//, "")}
                                        </a>
                                      )}
                                    </p>
                                  )}
                                </li>
                              );
                            })}
                          </ol>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ClientNavWrapper>
  );
}
