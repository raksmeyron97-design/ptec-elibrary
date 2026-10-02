import { Link } from "@/i18n/navigation";
import { JOURNALS_PATH } from "@/lib/journals/urls";
import { Search, BookOpen, Library, CalendarRange, Download } from "lucide-react";

type HeroStats = {
  publications: number;
  journals: number;
  years: number;
  downloads: number;
};

type HeroLabels = {
  eyebrow: string;
  title: string;
  subtitle: string;
  searchPlaceholder: string;
  searchButton: string;
  popular: string;
  statPublications: string;
  statJournals: string;
  statYears: string;
  statDownloads: string;
};

/** Popular topics and the stats band appear from this many articles. */
const POPULAR_MIN = 10;

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function StatTile({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="hidden h-9 w-9 items-center justify-center rounded-xl border border-brand/15 bg-brand/5 text-brand sm:flex">
        {icon}
      </span>
      <div className="text-left">
        <p className="text-lg font-semibold leading-6 text-text-heading sm:text-xl">{value}</p>
        <p className="text-[11px] leading-4 text-text-muted sm:text-xs">{label}</p>
      </div>
    </div>
  );
}

/**
 * Scholar-style hero for the publications listing: primary search form
 * (plain GET — works without JS), repository stats, and popular-topic chips.
 * Non-search filters are preserved across submits via hidden inputs.
 */
export default function PublicationsHero({
  stats,
  popularKeywords,
  currentQuery,
  preservedParams,
  labels,
  badge,
  note,
  formAction = JOURNALS_PATH,
}: {
  /** One quiet line under the subtitle (the "PTEC's own publications" pointer). */
  note?: React.ReactNode;
  /**
   * Locale-prefixed listing path for the GET search form. A plain <form> is
   * not locale-aware, so the page passes "/km/journals" on the Khmer listing —
   * otherwise a Khmer reader's search landed on the English page.
   */
  formAction?: string;
  stats: HeroStats;
  popularKeywords: string[];
  currentQuery: string;
  preservedParams: Record<string, string | undefined>;
  labels: HeroLabels;
  badge?: React.ReactNode;
}) {
  // "Popular" needs a collection to be popular IN: six chips taken from one
  // article's keywords are that article's keywords. Same threshold as the
  // stats band below.
  const showPopular = popularKeywords.length > 0 && stats.publications >= POPULAR_MIN;

  return (
    // Articles redesign (2026-10-02): a compact, left-aligned header in the
    // same card style. The centred hero with decorative glow was ~300 px and
    // put the first article at 967 px on desktop, 1,143 px on a phone.
    <section className="rounded-[24px] border border-divider bg-bg-surface px-4 py-5 shadow-sm sm:px-6 sm:py-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
        <div className="min-w-0 lg:max-w-xl">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-brand">
            <BookOpen className="h-3 w-3" aria-hidden="true" />
            {labels.eyebrow}
          </span>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <h1 className="font-khmer-serif text-[26px] font-bold leading-tight text-text-heading sm:text-[30px]">
              {labels.title}
            </h1>
            {badge}
          </div>
          <p className="mt-1.5 text-sm leading-6 text-text-muted sm:text-[15px]">{labels.subtitle}</p>
          {note && <div className="mt-1.5 text-[13px] text-text-muted">{note}</div>}
        </div>

        {/* Primary search (plain GET — works without JS) */}
        <form action={formAction} method="get" role="search" className="w-full lg:max-w-md">
          {Object.entries(preservedParams).map(([key, value]) =>
            value ? <input key={key} type="hidden" name={key} value={value} /> : null,
          )}
          <div className="focus-shell group relative flex h-12 items-center rounded-full border border-divider bg-bg-body shadow-sm hover:border-border-strong">
            <Search className="pointer-events-none ml-4 h-5 w-5 shrink-0 text-text-muted" aria-hidden="true" />
            <input
              type="search"
              name="q"
              defaultValue={currentQuery}
              placeholder={labels.searchPlaceholder}
              aria-label={labels.searchPlaceholder}
              className="h-11 w-full min-w-0 bg-transparent px-3 text-base text-text-body sm:text-[15px] outline-none placeholder:text-text-muted"
            />
            <button
              type="submit"
              className="mr-1.5 inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-brand px-4 text-sm font-semibold text-brand-contrast transition-colors hover:bg-brand-hover sm:px-5"
            >
              <span className="hidden sm:inline">{labels.searchButton}</span>
              <Search className="h-4 w-4 sm:hidden" aria-hidden="true" />
              <span className="sr-only sm:hidden">{labels.searchButton}</span>
            </button>
          </div>
        </form>
      </div>

      {showPopular && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{labels.popular}</span>
          {popularKeywords.map((kw) => (
            <Link
              key={kw}
              href={`${JOURNALS_PATH}?keyword=${encodeURIComponent(kw)}`}
              className="rounded-full border border-divider bg-bg-surface px-2.5 py-1 text-[11.5px] font-medium text-text-body transition-colors hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
            >
              {kw}
            </Link>
          ))}
        </div>
      )}

      {/* Repository stats — hidden while the repository is small. A hero
          announcing "1 Publications · 1 Journals" undermines credibility. */}
      {stats.publications >= POPULAR_MIN && (
        <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-divider pt-4">
          <StatTile icon={<BookOpen className="h-4 w-4" />} value={compact(stats.publications)} label={labels.statPublications} />
          {stats.journals > 1 && (
            <StatTile icon={<Library className="h-4 w-4" />} value={compact(stats.journals)} label={labels.statJournals} />
          )}
          {stats.years > 1 && (
            <StatTile icon={<CalendarRange className="h-4 w-4" />} value={compact(stats.years)} label={labels.statYears} />
          )}
          {stats.downloads >= 10 && (
            <StatTile icon={<Download className="h-4 w-4" />} value={compact(stats.downloads)} label={labels.statDownloads} />
          )}
        </div>
      )}
    </section>
  );
}
