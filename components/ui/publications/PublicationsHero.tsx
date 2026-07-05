import Link from "next/link";
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
}: {
  stats: HeroStats;
  popularKeywords: string[];
  currentQuery: string;
  preservedParams: Record<string, string | undefined>;
  labels: HeroLabels;
  badge?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-divider bg-bg-surface px-4 py-8 shadow-sm sm:px-8 sm:py-10 md:py-12">
      {/* Decorative background — pure CSS, theme-token driven */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 h-64 w-64 rounded-full bg-brand/10 blur-3xl" />
        <div className="absolute -bottom-28 -right-20 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, var(--color-divider) 1px, transparent 0)",
            backgroundSize: "26px 26px",
            maskImage: "radial-gradient(ellipse 80% 60% at 50% 40%, black, transparent)",
            WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 40%, black, transparent)",
          }}
        />
      </div>

      <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
        {/* Eyebrow */}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand/5 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand">
          <BookOpen className="h-3 w-3" />
          {labels.eyebrow}
        </span>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          <h1 className="font-khmer-serif text-[clamp(26px,4.5vw,40px)] font-bold leading-tight text-text-heading">
            {labels.title}
          </h1>
          {badge}
        </div>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted sm:text-[15px]">
          {labels.subtitle}
        </p>

        {/* Primary search */}
        <form action="/publications" method="get" role="search" className="mt-6 w-full">
          {Object.entries(preservedParams).map(([key, value]) =>
            value ? <input key={key} type="hidden" name={key} value={value} /> : null,
          )}
          <div className="group relative flex h-13 items-center rounded-full border border-divider bg-bg-body shadow-sm transition focus-within:border-brand focus-within:shadow-md focus-within:ring-2 focus-within:ring-focus-ring/30">
            <Search className="pointer-events-none ml-4 h-5 w-5 shrink-0 text-text-muted" />
            <input
              type="search"
              name="q"
              defaultValue={currentQuery}
              placeholder={labels.searchPlaceholder}
              className="h-12 w-full min-w-0 bg-transparent px-3 text-[15px] text-text-body outline-none placeholder:text-text-muted"
            />
            <button
              type="submit"
              className="mr-1.5 inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-brand px-4 text-sm font-semibold text-brand-contrast transition-colors hover:bg-brand-hover sm:px-5"
            >
              <span className="hidden sm:inline">{labels.searchButton}</span>
              <Search className="h-4 w-4 sm:hidden" />
            </button>
          </div>
        </form>

        {/* Popular topics */}
        {popularKeywords.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
              {labels.popular}
            </span>
            {popularKeywords.map((kw) => (
              <Link
                key={kw}
                href={`/publications?keyword=${encodeURIComponent(kw)}`}
                className="rounded-full border border-divider bg-bg-surface px-2.5 py-1 text-[11.5px] font-medium text-text-body transition-colors hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
              >
                {kw}
              </Link>
            ))}
          </div>
        )}

        {/* Repository stats */}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
          <StatTile
            icon={<BookOpen className="h-4 w-4" />}
            value={compact(stats.publications)}
            label={labels.statPublications}
          />
          <span aria-hidden className="hidden h-8 w-px bg-divider sm:block" />
          <StatTile
            icon={<Library className="h-4 w-4" />}
            value={compact(stats.journals)}
            label={labels.statJournals}
          />
          <span aria-hidden className="hidden h-8 w-px bg-divider sm:block" />
          <StatTile
            icon={<CalendarRange className="h-4 w-4" />}
            value={compact(stats.years)}
            label={labels.statYears}
          />
          {stats.downloads > 0 && (
            <>
              <span aria-hidden className="hidden h-8 w-px bg-divider sm:block" />
              <StatTile
                icon={<Download className="h-4 w-4" />}
                value={compact(stats.downloads)}
                label={labels.statDownloads}
              />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
