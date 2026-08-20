import { Suspense } from "react";
import { Link } from "@/i18n/navigation";
import SearchBar from "@/components/ui/search/SearchBar";
import AdvancedSearchModal, { type FacetOption } from "@/components/ui/theses/AdvancedSearchModal";

// The listing header.
//
// The page has one job — turn a vague research need into one specific record —
// so the search field is the hero, not the headline. The headline is set one
// step down from the record page's title scale on purpose: on a detail page
// the title IS the content, here it is a signpost above the thing you came to
// use, and a 44px display line above a search field makes the field look like
// an afterthought.
//
// Flush left, on the page ground, no band and no card. The measure of the
// standfirst is capped in `ch` so it breaks into two comfortable lines rather
// than running the full 1320px container.

export default function HeroSearch({
  collectionLabel,
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
  /** Pre-resolved, translated collection-size text (e.g. "12 theses") built
   *  by the page from lib/collection-stats.ts. This eyebrow states how big
   *  the REPOSITORY is, so it must not move when a filter is applied — it
   *  used to be `baseReports.length`, the server-filtered set, which made
   *  the same page advertise a different repository size per filter. The
   *  "theses" suffix was also hard-coded English and never rendered Khmer. */
  collectionLabel: string;
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
    <section className="pt-7 pb-8 sm:pt-9">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent-text">
        PTEC Digital Repository · {collectionLabel}
      </p>
      <h1 className="mt-2.5 max-w-[20ch] text-[clamp(26px,3vw,36px)] font-bold leading-[1.15] tracking-[-0.015em] text-text-heading">
        Find theses &amp; research
      </h1>
      <p className="mt-2.5 max-w-[62ch] text-[14.5px] leading-[1.6] text-text-muted">
        Search student theses from {institution} by title, author, advisor,
        program or keyword.
      </p>

      <div className="mt-6 flex max-w-[820px] flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <Suspense
          fallback={<div className="h-13 flex-1 animate-pulse rounded-xl bg-paper" />}
        >
          <SearchBar
            placeholder="Search title, author, keyword, advisor, DOI…"
            buttonLabel="Search"
          />
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
        // The most-used keywords in the collection, as a way in for a reader
        // who does not yet have a query. Labelled "Popular topics" rather than
        // "Popular": the bare word left it ambiguous whether these were
        // popular THESES or popular subjects.
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-text-muted">Popular topics:</span>
          {quickChips.map((chip) => (
            <Link
              key={chip.value}
              href={`/theses?keyword=${encodeURIComponent(chip.value)}`}
              className="inline-flex h-[30px] items-center rounded-full border border-divider bg-bg-surface px-3.5 text-[12.5px] text-text-body transition-colors duration-150 hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
            >
              {chip.label}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
