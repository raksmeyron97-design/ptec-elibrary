// components/ui/home/TrendingResearch.tsx
// Homepage — ranked top-5 theses by real reader behavior (views + weighted
// downloads). A numbered <ol>, not a card grid: rank is the information, and
// usage numbers beside each row are the social proof (IEEE "most popular").
import { Link } from "@/i18n/navigation";
import { getTrendingThesesCached } from "@/lib/home-data";
import { getTranslations, getLocale } from "next-intl/server";

const formatCount = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `${(n / 1_000).toFixed(1)}K`
      : String(n);

export default async function TrendingResearch() {
  const theses = await getTrendingThesesCached();
  // A "trending" list of one or two rows reads as emptiness, not popularity —
  // hide the section until there is a real ranking to show.
  if (theses.length < 3) return null;

  const [t, locale] = await Promise.all([getTranslations("home"), getLocale()]);
  const latinEyebrow = locale === "en" ? "uppercase tracking-[0.2em]" : "tracking-normal";

  return (
    <section className="border-b border-divider/60 bg-bg-surface" aria-labelledby="trending-research-title">
      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-14 md:px-12 md:py-16">
        {/* ── Header ── */}
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <span className="h-[3px] w-7 rounded-full bg-gradient-to-r from-accent to-brand" aria-hidden />
              <span className={`text-[11px] font-bold text-accent-text ${latinEyebrow}`}>
                {t("trendingResearchEyebrow")}
              </span>
            </div>
            <h2
              id="trending-research-title"
              className="font-khmer-serif font-bold leading-tight tracking-tight text-text-heading"
              style={{ fontSize: "clamp(22px, 2.4vw, 32px)" }}
            >
              {t("trendingResearchTitle")}
            </h2>
          </div>
          <Link
            href="/theses"
            className="hidden shrink-0 items-center gap-1.5 text-[13.5px] font-semibold text-brand transition-colors hover:text-brand-hover sm:inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 rounded-sm"
          >
            {t("trendingResearchViewAll")}
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>

        {/* ── Ranked list ── */}
        <ol className="divide-y divide-divider rounded-2xl border border-divider bg-paper">
          {theses.map((thesis, i) => {
            const views = thesis.view_count ?? 0;
            const downloads = thesis.download_count ?? 0;
            return (
              <li key={thesis.id} className="relative flex items-center gap-4 px-5 py-4 transition-colors hover:bg-brand/[0.03] sm:gap-6 sm:px-7">
                {/* Ordinal */}
                <span
                  className="w-8 shrink-0 text-center font-serif text-[22px] font-bold text-brand/35 tabular-nums sm:text-[26px]"
                  aria-hidden
                >
                  {i + 1}
                </span>

                {/* Title + meta */}
                <div className="min-w-0 flex-1 py-0.5">
                  <h3 className="font-khmer-serif text-[15px] font-bold leading-snug text-text-heading line-clamp-2 sm:text-[16px]">
                    <Link
                      href={`/theses/${thesis.slug ?? thesis.id}`}
                      className="after:absolute after:inset-0 transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 rounded-sm"
                    >
                      {thesis.title}
                    </Link>
                  </h3>
                  <p className="mt-1 text-[12.5px] text-text-muted line-clamp-1">
                    {[thesis.author_names, thesis.cohort].filter(Boolean).join(" · ")}
                  </p>
                </div>

                {/* Usage stats */}
                <div className="hidden shrink-0 items-center gap-4 sm:flex">
                  <span
                    className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-text-muted tabular-nums"
                    aria-label={t("trendingResearchViews", { count: views })}
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    {formatCount(views)}
                  </span>
                  <span
                    className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-text-muted tabular-nums"
                    aria-label={t("trendingResearchDownloads", { count: downloads })}
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                    </svg>
                    {formatCount(downloads)}
                  </span>
                </div>

                {/* Compact mobile stat */}
                <span className="shrink-0 text-[12px] font-semibold text-text-muted tabular-nums sm:hidden" aria-label={t("trendingResearchViews", { count: views })}>
                  {formatCount(views)} {t("trendingResearchReads")}
                </span>
              </li>
            );
          })}
        </ol>

        {/* Mobile view-all */}
        <div className="mt-6 sm:hidden">
          <Link href="/theses" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand">
            {t("trendingResearchViewAll")}
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
