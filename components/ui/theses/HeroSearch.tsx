import { Suspense } from "react";
import { Link } from "@/i18n/navigation";
import SearchBar from "@/components/ui/search/SearchBar";
import AdvancedSearchModal, { type FacetOption } from "@/components/ui/theses/AdvancedSearchModal";

export default function HeroSearch({
  totalCount,
  quickChips,
  currentQ,
  currentProgram,
  currentFaculty,
  currentCohort,
  currentYear,
  currentAuthor,
  currentAdvisor,
  currentKeyword,
  cohorts,
  years,
  authors,
  advisors,
  keywords,
  institution,
}: {
  totalCount: number;
  /** Published institution name (server-resolved). */
  institution: string;
  quickChips: { label: string; value: string }[];
  currentQ: string;
  currentProgram: string;
  currentFaculty: string;
  currentCohort: string;
  currentYear: string;
  currentAuthor: string;
  currentAdvisor: string;
  currentKeyword: string;
  cohorts: FacetOption[];
  years: string[];
  authors: FacetOption[];
  advisors: FacetOption[];
  keywords: FacetOption[];
}) {
  return (
    <section className="relative rounded-3xl border border-divider bg-gradient-to-br from-brand/[0.06] via-bg-surface to-accent/[0.05] px-5 py-9 sm:px-10 sm:py-12">
      {/* Container for clipping decorative orbs so they don't bleed out of the rounded corners */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
        <div
          aria-hidden
          className="animate-float-orb absolute -top-16 -right-16 h-64 w-64 rounded-full bg-brand/10 blur-3xl"
        />
        <div
          aria-hidden
          className="animate-float-orb-slow absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-accent/10 blur-3xl"
        />
      </div>

      <div className="fade-rise-in relative mx-auto max-w-2xl text-center">
        <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.2em] text-brand">
          PTEC Digital Repository · {totalCount.toLocaleString()} theses
        </p>
        <h1 className="font-khmer-serif text-[28px] font-bold leading-tight text-text-heading sm:text-[36px]">
          Find Theses &amp; Research
        </h1>
        <p className="mx-auto mt-2.5 max-w-lg text-[14.5px] leading-relaxed text-text-muted sm:text-[15.5px]">
          Search student theses from {institution} by title, author,
          advisor, program, or keyword.
        </p>

        <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <Suspense fallback={<div className="h-13 flex-1 rounded-2xl bg-paper animate-pulse" />}>
            <SearchBar placeholder="Search title, author, keyword, advisor, DOI..." buttonLabel="Search" />
          </Suspense>
          <AdvancedSearchModal
            currentQ={currentQ}
            currentProgram={currentProgram}
            currentFaculty={currentFaculty}
            currentCohort={currentCohort}
            currentYear={currentYear}
            currentAuthor={currentAuthor}
            currentAdvisor={currentAdvisor}
            currentKeyword={currentKeyword}
            cohorts={cohorts}
            years={years}
            authors={authors}
            advisors={advisors}
            keywords={keywords}
          />
        </div>

        {quickChips.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <span className="text-[12px] text-text-muted">Popular:</span>
            {quickChips.map((chip) => (
              <Link
                key={chip.value}
                href={`/theses?keyword=${encodeURIComponent(chip.value)}`}
                className="inline-flex items-center rounded-full border border-divider bg-bg-surface px-3.5 py-1.5 text-[12.5px] font-medium text-text-body transition-all duration-150 hover:border-brand/40 hover:bg-brand/5 hover:text-brand active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
              >
                {chip.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
