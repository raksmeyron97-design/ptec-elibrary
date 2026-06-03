import Link from "next/link";
import { getResearchReports } from "@/app/actions/research";
import Icon from "@/components/ui/core/Icon";
import { ClientNavWrapper } from "@/components/ui/books/ClientNavWrapper";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function ResearchSummaryPage() {
  const tNav = await getTranslations("nav");
  const t = await getTranslations("researchSummary");

  // Fetch all published reports
  const { data: reports } = await getResearchReports({ publishedOnly: true });
  
  // Group reports by academic year and then by cohort
  const groupedReports: Record<string, Record<string, typeof reports>> = {};

  (reports || []).forEach(report => {
    const year = report.academic_year || "Unknown Year";
    const cohort = report.cohort || "Unknown Cohort";

    if (!groupedReports[year]) {
      groupedReports[year] = {};
    }
    if (!groupedReports[year][cohort]) {
      groupedReports[year][cohort] = [];
    }
    groupedReports[year][cohort].push(report);
  });

  // Sort years descending
  const sortedYears = Object.keys(groupedReports).sort((a, b) => b.localeCompare(a));

  return (
    <ClientNavWrapper>
      <div className="min-h-screen bg-bg-body">
        {/* Header */}
        <div className="border-b border-divider bg-bg-surface px-4 py-6 md:px-12 md:py-8">
          <div className="mx-auto max-w-[1000px]">
            <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 sm:gap-2 text-[13px] sm:text-[14.5px] font-medium text-text-muted">
              <Link href="/" className="hover:text-brand transition-colors">{tNav('home')}</Link>
              <Icon name="chevron-right" className="text-[16px] text-divider" />
              <Link href="/research" className="hover:text-brand transition-colors">{tNav('researchReports')}</Link>
              <Icon name="chevron-right" className="text-[16px] text-divider" />
              <span className="text-text-heading">{tNav('summaryIndex')}</span>
            </nav>
            <h1 className="text-2xl md:text-4xl font-bold font-khmer-serif text-text-heading leading-tight">
              {t('title')}
            </h1>
            <p className="mt-2 text-text-muted text-sm md:text-base">
              {t('description')}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="mx-auto max-w-[1000px] px-4 py-8 md:px-12 md:py-12">
          {sortedYears.length === 0 ? (
            <div className="text-center py-12 text-text-muted">
              {t('emptyState')}
            </div>
          ) : (
             <div className="space-y-12">
              {sortedYears.map(year => {
                const cohorts = groupedReports[year];
                const sortedCohorts = Object.keys(cohorts).sort((a, b) => a.localeCompare(b));

                return (
                  <div key={year} className="bg-bg-surface border border-divider rounded-2xl p-6 sm:p-8 shadow-sm">
                    {sortedCohorts.map(cohort => (
                      <div key={cohort} className="mb-8 last:mb-0">
                        <h2 className="text-xl md:text-2xl font-bold font-khmer-serif text-brand mb-6 flex items-center gap-3">
                          {t('groupHeader', { cohort, year })}
                        </h2>
                        <ol className="list-decimal list-outside ml-6 space-y-4">
                          {(cohorts[cohort] || []).map(report => (
                            <li key={report.id} className="pl-2 text-text-body marker:text-brand marker:font-bold marker:text-lg">
                              <Link 
                                href={`/research/${report.id}`}
                                className="text-[15px] sm:text-base font-medium hover:text-brand hover:underline transition-colors leading-relaxed"
                              >
                                {report.title}
                              </Link>
                              {report.author_names && (
                                <p className="text-[13px] text-text-muted mt-0.5">
                                  {t('byAuthor', { authors: report.author_names })}
                                </p>
                              )}
                            </li>
                          ))}
                        </ol>
                      </div>
                    ))}
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
